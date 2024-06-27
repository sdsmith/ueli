import type { WorkflowAction } from "./WorkflowAction";

export type Workflow = {
    readonly id: string;
    readonly name: string;
    readonly actions: WorkflowAction<unknown>[];
};

export function sortWorkflows(workflows: Workflow[]): void {
    workflows.sort((a, b) => { return a.name.localeCompare(b.name) });
}