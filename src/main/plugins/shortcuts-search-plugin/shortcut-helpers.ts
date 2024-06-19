import { Shortcut } from "./shortcut";
import { ShortcutType } from "./shortcut-type";
import { IconType } from "../../../common/icon/icon-type";
import { isValidIcon } from "../../../common/icon/icon-helpers";
import { defaultShortcutIcon, defaultTerminalIcon, defaultUrlIcon } from "../../../common/icon/default-icons";
import { ShortcutOptions } from "../../../common/config/shortcuts-options";

export const defaultNewShortcut: Shortcut = {
    description: "",
    executionArgument: "",
    icon: {
        parameter: "",
        type: IconType.URL,
    },
    name: "",
    needsUserConfirmationBeforeExecution: false,
    tags: [],
    type: ShortcutType.Url,
};

export function isValidShortcutType(shortcutType: ShortcutType): boolean {
    return Object.values(ShortcutType).find((s) => s === shortcutType) !== undefined;
}

export function isValidShortcutToAdd(shortcut: Shortcut, filePathValidator: (filePath: string) => boolean): boolean {
    let iconCondition = true;
    if (shortcut.icon.parameter && shortcut.icon.parameter.length > 0) {
        iconCondition = isValidIcon(shortcut.icon);
    }

    return (
        shortcut !== undefined &&
        isValidShortcutExecutionArgument(shortcut, filePathValidator) &&
        isValidShortcutType(shortcut.type) &&
        iconCondition
    );
}

export function isValidShortcutExecutionArgument(
    shortcut: Shortcut,
    filePathValidator: (filePath: string) => boolean,
): boolean {
    switch (shortcut.type) {
        case ShortcutType.Url:
            return isValidShortcutUrl(shortcut.executionArgument);
        case ShortcutType.FilePath:
            return isValidShortcutFilePath(shortcut.executionArgument, filePathValidator);
        case ShortcutType.CommandlineTool:
            return isValidShortcutCommand(shortcut.executionArgument);
    }
}

export function getDefaultShortcutIcon(shortcut: Shortcut) {
    switch (shortcut.type) {
        case ShortcutType.CommandlineTool:
            return defaultTerminalIcon;
        case ShortcutType.Url:
            return defaultUrlIcon;
        case ShortcutType.FilePath:
        default:
            return defaultShortcutIcon;
    }
}

export function sortInPlaceShortcutOptions(shortcutOptions: ShortcutOptions) {
    shortcutOptions.shortcuts.sort((a, b) => {
        return a.name.localeCompare(b.name);
    })
}

function isValidShortcutUrl(url: string): boolean {
    return url !== undefined && (url.startsWith("https://") || url.startsWith("http://"));
}

function isValidShortcutFilePath(filePath: string, filePathValidator: (filePath: string) => boolean): boolean {
    return filePath !== undefined && filePathValidator(filePath);
}

function isValidShortcutCommand(command: string): boolean {
    return command.length > 0;
}