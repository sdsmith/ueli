import type { SettingsManager } from "@Core/SettingsManager";
import { getExtensionSettingKey } from "@common/Core/Extension";
import { Workflow, sortWorkflows } from "@common/Extensions/Workflow";

export class WorkflowRepository {
    public constructor(private readonly settingsManager: SettingsManager) {}

    public async getAll(): Promise<Workflow[]> {
        const workflows = this.settingsManager.getValue<Workflow[]>(getExtensionSettingKey("Workflow", "workflows"), []);
        sortWorkflows(workflows);
        return workflows;
    }
}
