import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string; plan_filepath: string }>(
  ({ spec_filepath, plan_filepath }) => ({
    type: "critic",
    description: "Audits PLAN.md against SPEC.md - approve or reject with concrete issues",
    modelTier: "standard",
    permissions: "read-only",
    timeoutSeconds: 180,
    prompt: `
Read the spec at: ${spec_filepath}
Read the plan at: ${plan_filepath}

Evaluate whether the PLAN faithfully implements the SPEC:

1. Does every acceptance criterion in SPEC have at least one corresponding implementation step in PLAN?
2. Are the PLAN steps concrete and actionable (no vague "set up X" or "handle Y" steps)?
3. Does the PLAN respect the SPEC's non-goals (no scope creep)?
4. Does the PLAN respect the SPEC's constraints (tech stack, deployment target)?
5. Are dependencies and risks called out?

Reason through each point in prose, then call the verdict command.

When rejecting, list each concrete problem as a separate issue argument. The engine passes these verbatim back to plan-creator as feedback for the retry. Vague flags like "needs more detail" do not qualify; anchor each issue to a specific SPEC requirement that the PLAN misses or contradicts.`,
  }),
);
