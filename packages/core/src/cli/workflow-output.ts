import type { StepResult } from "../engine.js";
import type { WorkflowDef } from "../schema.js";

const _INTERACTIVE_PLACEHOLDER = "[interactive session completed]";

export function pickPrintableFinalOutput(
  steps: StepResult[],
  _workflow: WorkflowDef,
): string | null {
  if (steps.length === 0) return null;
  return null;
}
