import { useContextBridge } from "../../Hooks";
import { Setting } from "../Setting";
import { SettingGroup } from "../SettingGroup";
import { SettingGroupList } from "../SettingGroupList";

export const About = () => {
    const { contextBridge } = useContextBridge();

    const { electronVersion, nodeJsVersion, v8Version, version } = contextBridge.getAboutUeli();
    const settingsFile = contextBridge.getSettingsFile();

    return (
        <SettingGroupList>
            <SettingGroup title="Versions">
                <Setting label="Ueli" control={<>{version}</>} />
                <Setting label="Electron" control={<>{electronVersion}</>} />
                <Setting label="Node.js" control={<>{nodeJsVersion}</>} />
                <Setting label="V8" control={<>{v8Version}</>} />
            </SettingGroup>
            <SettingGroup title="Misc">
                <Setting label="Settings file" control={<>{settingsFile}</>} />
            </SettingGroup>
        </SettingGroupList>
    );
};
