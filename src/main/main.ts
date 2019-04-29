import { app, BrowserWindow, ipcMain, globalShortcut, dialog, Tray, Menu, screen, MenuItemConstructorOptions, WebContents } from "electron";
import { join } from "path";
import { IpcChannels } from "../common/ipc-channels";
import { SearchResultItem } from "../common/search-result-item";
import { UserConfigOptions } from "../common/config/user-config-options";
import { ElectronStoreConfigRepository } from "../common/config/electron-store-config-repository";
import { defaultUserConfigOptions } from "../common/config/default-user-config-options";
import { AppearanceOptions } from "../common/config/appearance-options";
import { isDev } from "../common/is-dev";
import { UeliCommand } from "./plugins/ueli-command-search-plugin/ueli-command";
import { UeliCommandExecutionArgument } from "./plugins/ueli-command-search-plugin/ueli-command-execution-argument";
import { platform } from "os";
import { OperatingSystem } from "../common/operating-system";
import { getProductionSearchEngine } from "./production/production-search-engine";
import { cloneDeep } from "lodash";
import { GlobalHotKey } from "../common/global-hot-key/global-hot-key";
import { GlobalHotKeyHelpers } from "../common/global-hot-key/global-hot-key-helpers";
import { defaultGeneralOptions } from "../common/config/default-general-options";
import { getErrorSearchResultItem } from "../common/error-search-result-item";
import { FileHelpers } from "./helpers/file-helpers";
import { ueliTempFolder } from "../common/helpers/ueli-helpers";
import { getTranslationSet } from "../common/translation/translation-set-manager";
import { trayIconPathWindows, trayIconPathMacOs } from "./helpers/tray-icon-helpers";

if (!FileHelpers.fileExistsSync(ueliTempFolder)) {
    FileHelpers.createFolderSync(ueliTempFolder);
}

const configRepository = new ElectronStoreConfigRepository(cloneDeep(defaultUserConfigOptions));
const currentOperatingSystem = platform() === "darwin" ? OperatingSystem.macOS : OperatingSystem.Windows;
const windowIconFilePath = join(__dirname, "..", "assets", "ueli-black-on-white-logo.png");

if (currentOperatingSystem === OperatingSystem.macOS) {
    app.dock.hide();
}

let trayIcon: Tray;
let mainWindow: BrowserWindow;
let settingsWindow: BrowserWindow;

let config = configRepository.getConfig();
let translationSet = getTranslationSet(config.generalOptions.language);
let searchEngine = getProductionSearchEngine(config, translationSet);
const logger = searchEngine.getLogger();

let rescanInterval = config.generalOptions.rescanEnabled
    ? setInterval(() => refreshAllIndexes(), Number(config.generalOptions.rescanIntervalInSeconds) * 1000)
    : undefined;

function notifyRenderer(ipcChannel: IpcChannels, message?: string) {
    const allWindows = [mainWindow, settingsWindow];
    allWindows.forEach((window) => {
        if (window !== undefined && !window.isDestroyed()) {
            window.webContents.send(ipcChannel, message);
        }
    });
}

function refreshAllIndexes() {
    searchEngine.refreshIndexes()
        .then(() => {
            const message = translationSet.successfullyRefreshedIndexes;
            logger.debug(message);
            notifyRenderer(IpcChannels.indexRefreshSucceeded, message);
        })
        .catch((err) => {
            logger.error(err);
            notifyRenderer(IpcChannels.indexRefreshFailed, err);
        });
}

function clearAllCaches() {
    searchEngine.clearCaches()
        .then(() => logger.debug(translationSet.successfullyClearedCaches))
        .catch((err) => logger.error(err));
}

function registerGlobalKeyboardShortcut(toggleAction: () => void, newHotKey: GlobalHotKey) {
    newHotKey = GlobalHotKeyHelpers.isValidHotKey(newHotKey) ? newHotKey : defaultGeneralOptions.hotKey;
    globalShortcut.unregisterAll();
    globalShortcut.register(`${newHotKey.modifier ? `${newHotKey.modifier}+` : ``}${newHotKey.key}`, toggleAction);
}

function showMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const mousePosition = screen.getCursorScreenPoint();
        const display = config.generalOptions.showAlwaysOnPrimaryDisplay
            ? screen.getPrimaryDisplay()
            : screen.getDisplayNearestPoint(mousePosition);

        const windowBounds: Electron.Rectangle = {
            height: Number(config.appearanceOptions.userInputHeight),
            width: Number(config.appearanceOptions.windowWidth),
            x: Number(display.bounds.x + (display.bounds.width / 2) - (config.appearanceOptions.windowWidth / 2)),
            y: Number(display.bounds.y + (display.bounds.height / 2) - (getMaxWindowHeight(
                    config.appearanceOptions.maxSearchResultsPerPage,
                    config.appearanceOptions.searchResultHeight,
                    config.appearanceOptions.userInputHeight) / 2)),
        };

        mainWindow.setBounds(windowBounds);
        mainWindow.show();
        mainWindow.webContents.send(IpcChannels.mainWindowHasBeenShown);
    }
}

function hideMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IpcChannels.mainWindowHasBeenHidden);

        setTimeout(() => {
            updateMainWindowSize(0, config.appearanceOptions);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.hide();
            }
        }, 25);
    }
}

function toggleMainWindow() {
    if (mainWindow.isVisible()) {
        hideMainWindow();
    } else {
        showMainWindow();
    }
}

function getMaxWindowHeight(maxSearchResultsPerPage: number, searchResultHeight: number, userInputHeight: number): number {
    return Number(maxSearchResultsPerPage) * Number(searchResultHeight) + Number(userInputHeight);
}

function updateConfig(updatedConfig: UserConfigOptions, needsIndexRefresh: boolean) {
    if (updatedConfig.generalOptions.language !== config.generalOptions.language) {
        onLanguageChange(updatedConfig);
    }

    if (updatedConfig.generalOptions.hotKey !== config.generalOptions.hotKey) {
        registerGlobalKeyboardShortcut(toggleMainWindow, updatedConfig.generalOptions.hotKey);
    }

    if (updatedConfig.generalOptions.rescanIntervalInSeconds !== config.generalOptions.rescanIntervalInSeconds) {
        if (rescanInterval) {
            clearInterval(rescanInterval);
        }
        rescanInterval = setInterval(() => refreshAllIndexes(), updatedConfig.generalOptions.rescanIntervalInSeconds * 1000);
    }

    if (!updatedConfig.generalOptions.rescanEnabled) {
        if (rescanInterval) {
            clearInterval(rescanInterval);
        }
    }

    if (Number(updatedConfig.appearanceOptions.windowWidth) !== Number(config.appearanceOptions.windowWidth)) {
        mainWindow.setResizable(true);
        mainWindow.setSize(Number(updatedConfig.appearanceOptions.windowWidth), getMaxWindowHeight(
            updatedConfig.appearanceOptions.maxSearchResultsPerPage,
            updatedConfig.appearanceOptions.searchResultHeight,
            updatedConfig.appearanceOptions.userInputHeight));
        updateMainWindowSize(0, updatedConfig.appearanceOptions);
        mainWindow.center();
        mainWindow.setResizable(false);
    }

    if (JSON.stringify(updatedConfig.appearanceOptions) !== JSON.stringify(config.appearanceOptions)) {
        mainWindow.webContents.send(IpcChannels.appearanceOptionsUpdated, updatedConfig.appearanceOptions);
    }

    if (JSON.stringify(updatedConfig.colorThemeOptions) !== JSON.stringify(config.colorThemeOptions)) {
        mainWindow.webContents.send(IpcChannels.colorThemeOptionsUpdated, updatedConfig.colorThemeOptions);
    }

    config = updatedConfig;

    updateTrayIcon(updatedConfig);
    updateAutoStartOptions(updatedConfig);

    configRepository.saveConfig(updatedConfig)
        .then(() => {
            searchEngine.updateConfig(updatedConfig, translationSet)
                .then(() => {
                    if (needsIndexRefresh) {
                        refreshAllIndexes();
                    } else {
                        notifyRenderer(IpcChannels.indexRefreshSucceeded, translationSet.successfullyUpdatedconfig);
                    }
                })
                .catch((err) =>  logger.error(err));
        })
        .catch((err) => logger.error(err));
}

function updateMainWindowSize(searchResultCount: number, appearanceOptions: AppearanceOptions, center?: boolean) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setResizable(true);
        const windowHeight = searchResultCount > appearanceOptions.maxSearchResultsPerPage
            ? getMaxWindowHeight(
                appearanceOptions.maxSearchResultsPerPage,
                appearanceOptions.searchResultHeight, appearanceOptions.userInputHeight)
            : (Number(searchResultCount) * Number(appearanceOptions.searchResultHeight)) + Number(appearanceOptions.userInputHeight);

        mainWindow.setSize(Number(appearanceOptions.windowWidth), Number(windowHeight));
        if (center) {
            mainWindow.center();
        }
        mainWindow.setResizable(false);
    }
}

function reloadApp() {
    updateMainWindowSize(0, config.appearanceOptions);
    searchEngine = getProductionSearchEngine(config, translationSet);
    mainWindow.reload();
}

function beforeQuitApp(): Promise<void> {
    return new Promise((resolve, reject) => {
        destroyTrayIcon();
        if (config.generalOptions.clearCachesOnExit) {
            searchEngine.clearCaches()
                .then(() => {
                    logger.debug(translationSet.successfullyClearedCachesBeforeExit);
                    resolve();
                })
                .catch((err) => reject(err));
        } else {
            resolve();
        }
    });
}

function quitApp() {
    beforeQuitApp()
        .then()
        .catch((err) => logger.error(err))
        .then(() => {
            if (rescanInterval) {
                clearInterval(rescanInterval);
            }
            globalShortcut.unregisterAll();
            app.quit();
        });
}

function updateAutoStartOptions(userConfig: UserConfigOptions) {
    if (!isDev()) {
        app.setLoginItemSettings({
            args: [],
            openAtLogin: userConfig.generalOptions.autostart,
            path: process.execPath,
        });
    }
}

function createTrayIcon() {
    if (config.generalOptions.showTrayIcon) {
        const trayIconFilePath = currentOperatingSystem === OperatingSystem.Windows
            ? trayIconPathWindows
            : trayIconPathMacOs;
        trayIcon = new Tray(trayIconFilePath);
        updateTrayIconContextMenu();
    }
}

function updateTrayIconContextMenu() {
    if (trayIcon && !trayIcon.isDestroyed()) {
        trayIcon.setContextMenu(Menu.buildFromTemplate([
            {
                click: showMainWindow,
                label: translationSet.trayIconShow,
            },
            {
                click: openSettings,
                label: translationSet.trayIconSettings,
            },
            {
                click: quitApp,
                label: translationSet.trayIconQuit,
            },
        ]));
    }
}

function updateTrayIcon(updatedConfig: UserConfigOptions) {
    if (updatedConfig.generalOptions.showTrayIcon) {
        if (trayIcon === undefined || (trayIcon && trayIcon.isDestroyed())) {
            createTrayIcon();
        }
    } else {
        destroyTrayIcon();
    }
}

function destroyTrayIcon() {
    if (trayIcon !== undefined && !trayIcon.isDestroyed()) {
        trayIcon.destroy();
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        center: true,
        frame: false,
        height: getMaxWindowHeight(
            config.appearanceOptions.maxSearchResultsPerPage,
            config.appearanceOptions.searchResultHeight,
            config.appearanceOptions.userInputHeight),
        icon: windowIconFilePath,
        resizable: false,
        show: false,
        skipTaskbar: true,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
        },
        width: config.appearanceOptions.windowWidth,
    });
    mainWindow.on("blur", hideMainWindow);
    mainWindow.on("closed", quitApp);
    mainWindow.loadFile(join(__dirname, "..", "main.html"));
}

function startApp() {
    createTrayIcon();
    createMainWindow();

    const recenter = currentOperatingSystem === OperatingSystem.macOS;
    updateMainWindowSize(0, config.appearanceOptions, recenter);
    registerGlobalKeyboardShortcut(toggleMainWindow, config.generalOptions.hotKey);
    updateAutoStartOptions(config);
    setKeyboardShortcuts();
    registerAllIpcListeners();
}

function setKeyboardShortcuts() {
    if (currentOperatingSystem === OperatingSystem.macOS && !isDev()) {
        const template = [
            {
                label: "ueli",
                submenu: [
                    { label: "Quit", accelerator: "Command+Q", click: quitApp },
                    { label: "Reload", accelerator: "Command+R", click: reloadApp },
                ],
            },
            {
                label: "Edit",
                submenu: [
                    { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
                    { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
                    { type: "separator" },
                    { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
                    { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
                    { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
                    { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" },
                ],
            },
        ] as MenuItemConstructorOptions[];

        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    }
}

function onLanguageChange(updatedConfig: UserConfigOptions) {
    translationSet = getTranslationSet(updatedConfig.generalOptions.language);
    updateTrayIconContextMenu();
}

function onSettingsOpen() {
    if (currentOperatingSystem === OperatingSystem.macOS) {
        app.dock.show();
    }
}

function onSettingsClose() {
    if (currentOperatingSystem === OperatingSystem.macOS) {
        app.dock.hide();
    }
}

function openSettings() {
    onSettingsOpen();
    if (!settingsWindow || settingsWindow.isDestroyed()) {
        settingsWindow = new BrowserWindow({
            height: 900,
            icon: windowIconFilePath,
            webPreferences: {
                nodeIntegration: true,
            },
            width: 1200,
        });
        settingsWindow.setMenu(null);
        settingsWindow.loadFile(join(__dirname, "..", "settings.html"));
        settingsWindow.on("close", onSettingsClose);
        if (isDev()) {
            settingsWindow.webContents.openDevTools();
        }
    } else {
        settingsWindow.focus();
    }
}

function updateSearchResults(results: SearchResultItem[], webcontents: WebContents, updatedUserInput?: string) {
    if (updatedUserInput) {
        webcontents.send(IpcChannels.userInputUpdated, updatedUserInput);
    }

    updateMainWindowSize(results.length, config.appearanceOptions);
    webcontents.send(IpcChannels.searchResponse, results);
}

function sendErrorToRenderer(err: string, webcontents: WebContents) {
    updateMainWindowSize(1, config.appearanceOptions);
    const noResultFound = getErrorSearchResultItem(translationSet.generalErrorTitle, translationSet.generalErrorDescription);
    webcontents.send(IpcChannels.searchResponse, [noResultFound]);
}

function registerAllIpcListeners() {
    ipcMain.on(IpcChannels.configUpdated, (event: Electron.Event, updatedConfig: UserConfigOptions, needsIndexRefresh: boolean) => {
        updateConfig(updatedConfig, needsIndexRefresh);
    });

    ipcMain.on(IpcChannels.search, (event: Electron.Event, userInput: string) => {
        searchEngine.getSearchResults(userInput)
            .then((result) => updateSearchResults(result, event.sender))
            .catch((err) => {
                logger.error(err);
                sendErrorToRenderer(err, event.sender);
            });
    });

    ipcMain.on(IpcChannels.favoritesRequested, (event: Electron.Event) => {
        searchEngine.getFavorites()
            .then((result) => updateSearchResults(result, event.sender))
            .catch((err) => {
                logger.error(err);
                sendErrorToRenderer(err, event.sender);
            });
    });

    ipcMain.on(IpcChannels.execute, (event: Electron.Event, searchResultItem: SearchResultItem, privileged: boolean) => {
        searchEngine.execute(searchResultItem, privileged)
            .then(() => {
                if (searchResultItem.hideMainWindowAfterExecution) {
                    hideMainWindow();
                } else {
                    updateMainWindowSize(0, config.appearanceOptions);
                }
            })
            .catch((err) => logger.error(err));
    });

    ipcMain.on(IpcChannels.openSearchResultLocation, (event: Electron.Event, searchResultItem: SearchResultItem) => {
        searchEngine.openLocation(searchResultItem)
            .then(() => hideMainWindow())
            .catch((err) => logger.error(err));
    });

    ipcMain.on(IpcChannels.autoComplete, (event: Electron.Event, searchResultItem: SearchResultItem) => {
        searchEngine.autoComplete(searchResultItem)
            .then((result) => updateSearchResults(result.results, event.sender, result.updatedUserInput))
            .catch((err) => sendErrorToRenderer(err, event.sender));
    });

    ipcMain.on(IpcChannels.reloadApp, () => {
        reloadApp();
    });

    ipcMain.on(IpcChannels.openSettingsWindow, () => {
        openSettings();
    });

    ipcMain.on(IpcChannels.folderPathRequested, (event: Electron.Event) => {
        dialog.showOpenDialog(settingsWindow, {
            properties: ["openDirectory"],
        }, (folderPaths: string[]) => {
            event.sender.send(IpcChannels.folderPathResult, folderPaths);
        });
    });

    ipcMain.on(IpcChannels.folderAndFilePathsRequested, (event: Electron.Event) => {
        dialog.showOpenDialog(settingsWindow, {
            properties: ["openFile", "openDirectory"],
        }, (filePaths: string[]) => {
            event.sender.send(IpcChannels.folderAndFilePathsResult, filePaths);
        });
    });

    ipcMain.on(IpcChannels.filePathRequested, (event: Electron.Event, filters: Electron.FileFilter[]) => {
        dialog.showOpenDialog(settingsWindow, {
            filters,
            properties: ["openFile"],
        }, (filePaths: string[]) => {
            if (!filePaths) {
                filePaths = [];
            }
            event.sender.send(IpcChannels.filePathResult, filePaths);
        });
    });

    ipcMain.on(IpcChannels.clearExecutionLogConfirmed, (event: Electron.Event) => {
        searchEngine.clearExecutionLog()
            .then(() => notifyRenderer(IpcChannels.executionLogClearingSucceeded, translationSet.successfullyClearedExecutionLog))
            .catch((err) => notifyRenderer(IpcChannels.executionLogClearingErrored, err));
    });

    ipcMain.on(IpcChannels.openDebugLogRequested, (event: Electron.Event) => {
        logger.openLog();
    });

    ipcMain.on(IpcChannels.ueliCommandExecuted, (command: UeliCommand) => {
        switch (command.executionArgument) {
            case UeliCommandExecutionArgument.Exit:
                quitApp();
                break;
            case UeliCommandExecutionArgument.Reload:
                reloadApp();
                break;
            case UeliCommandExecutionArgument.EditConfigFile:
                configRepository.openConfigFile();
                break;
            case UeliCommandExecutionArgument.OpenSettings:
                openSettings();
                break;
            case UeliCommandExecutionArgument.RefreshIndexes:
                refreshAllIndexes();
                break;
            case UeliCommandExecutionArgument.ClearCaches:
                clearAllCaches();
                break;
            default:
                logger.error("Unhandled ueli command execution");
                break;
        }
    });
}

app.on("ready", () => {
    const gotSingleInstanceLock = app.requestSingleInstanceLock();
    if (gotSingleInstanceLock) {
        startApp();
    } else {
        logger.error("Other instance is already running: quitting app.");
        quitApp();
    }
});

app.on("window-all-closed", quitApp);
app.on("quit", app.quit);
