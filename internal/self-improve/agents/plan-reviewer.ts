import { defineAgent } from "@generata/core";

export default defineAgent<{ spec_filepath: string; plan_filepath: string }>(
  ({ spec_filepath, plan_filepath }) => ({
    type: "critic",
    description:
      "Verifies the plan covers the spec, scales to the declared SIZE, and stays in scope. Rejects with concrete issues.",
    modelTier: "standard",
    permissions: "read-only",
    tools: [],
    timeoutSeconds: 240,
    prompt: `
Read the spec at: ${spec_filepath}
Read the plan at: ${plan_filepath}

Evaluate:
1. Does the plan cover every acceptance criterion / requirement implied by the spec?
2. Does the plan scale to the spec's SIZE declaration (no 5-step plan for a TRIVIAL typo; no 1-bullet plan for a SUBSTANTIAL change)?
3. Are plan steps concrete (no "set up X" or "handle edge cases" without specifics)?
4. Does the plan stay in scope - no proposed edits to .changeset/, .github/workflows/, internal/self-improve/ (except IMPROVEMENTS.md, which the workflow may prune), package.json version fields?
5. Are dependencies and risks called out for SUBSTANTIAL plans?

Reason through each point in prose, then call the verdict command. When rejecting, list each concrete problem as a separate issue argument anchored to a specific spec line or plan step. Vague flags like "needs more detail" do not qualify.`,
  }),
);
