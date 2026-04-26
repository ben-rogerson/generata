import type { StepResult } from "../engine.js";
import type { WorkflowDef } from "../schema.js";

// Mirrors the literal emitted by runInteractive in agent-runner.ts.
const INTERACTIVE_PLACEHOLDER = "[interactive session completed]";

export function pickPrintableFinalOutput(
  steps: StepResult[],
  workflow: WorkflowDef,
): string | null {
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1];
  const trimmed = last.output.trim();
  if (trimmed === "") return null;
  if (trimmed === INTERACTIVE_PLACEHOLDER) return null;
  const stepDef = workflow.steps.find((s) => s.id === last.stepId);
  // Critic verdict already prints via logStepDone; raw output would be redundant.
  if (stepDef?.agent.type === "critic") return null;
  return trimmed;
}
