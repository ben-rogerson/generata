import type { AgentDef, StepParams, WorkflowStep } from "./schema.js";

export function isLoopStep(step: WorkflowStep): step is Extract<WorkflowStep, { each: unknown }> {
  return "each" in step && "subWorkflow" in step;
}

// Resolve a workflow step (agent-form or stepFn-form) to its underlying
// agent + args. For function-form steps, run the stepFn under a Proxy that
// returns string placeholders so it can execute without throwing - the
// returned StepInvocation gives both the agent and the args mapping for
// any caller that needs them (precheck, env-key collection, output rendering).
//
// Loop steps have no agent of their own (the sub-workflow's agents are
// validated separately when each iteration fires). Callers that hit this
// path should branch on isLoopStep() before calling resolveStepShape.
export function resolveStepShape(step: WorkflowStep): {
  agent: AgentDef;
  args: Record<string, unknown> | ((p: StepParams) => Record<string, unknown>) | undefined;
} {
  if (isLoopStep(step)) {
    throw new Error(
      `resolveStepShape called on loop step '${step.id}' - callers must check isLoopStep() first`,
    );
  }
  if ("stepFn" in step) {
    const sentinel = new Proxy({} as StepParams, {
      get: (_, key) => `__placeholder_${String(key)}__`,
      has: () => true,
    });
    try {
      const inv = step.stepFn(sentinel);
      return { agent: inv.agent, args: inv.args };
    } catch {
      return {
        agent: { name: "<unknown>", kind: "agent" } as unknown as AgentDef,
        args: undefined,
      };
    }
  }
  return { agent: step.agent, args: step.args };
}
