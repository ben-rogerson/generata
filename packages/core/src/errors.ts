import type { PrecheckIssue } from "./precheck.js";

export class GenerataPrecheckError extends Error {
  readonly workflow: string;
  readonly issues: PrecheckIssue[];
  constructor(workflow: string, issues: PrecheckIssue[]) {
    super(
      `Precheck failed for workflow '${workflow}' - ${issues.length} problem${issues.length === 1 ? "" : "s"}`,
    );
    this.name = "GenerataPrecheckError";
    this.workflow = workflow;
    this.issues = issues;
  }
}
