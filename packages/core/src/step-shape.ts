import type { AgentDef, StepParams, WorkflowStep } from "./schema.js";

// Resolve a workflow step to its underlying agent + args. The stepFn runs
// under a Proxy that returns string placeholders so it can execute without
// throwing - the returned StepInvocation gives both the agent and the args
// mapping for any caller that needs them (precheck, env-key collection,
// output rendering).
export function resolveStepShape(step: WorkflowStep): {
  agent: AgentDef;
  args: Record<string, unknown>;
} {
  const sentinel = new Proxy({} as StepParams, {
    get: (_, key) => `__placeholder_${String(key)}__`,
    has: () => true,
  });
  try {
    const inv = step.stepFn(sentinel);
    return { agent: inv.agent, args: inv.args };
  } catch (err) {
    throw new Error(
      `resolveStepShape: stepFn for step threw during static analysis - ensure it only accesses proxy properties without calling methods on them: ${String(err)}`,
      { cause: err },
    );
  }
}
