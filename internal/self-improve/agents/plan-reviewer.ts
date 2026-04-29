import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "critic",
  description:
    "Verifies the plan covers the spec, scales to the declared SIZE, and stays in scope. Rejects with concrete issues.",
  modelTier: "standard",
  permissions: "read-only",
  tools: [],
  timeoutSeconds: 240,
  promptTemplate: ({ spec_creator_output, plan_creator_output }) => `
You have the spec-creator output and the plan-creator output:

SPEC CREATOR OUTPUT:
${spec_creator_output}

PLAN CREATOR OUTPUT:
${plan_creator_output}

If either output contains a halt sentinel (\`NO_ITEMS\`, \`PICKER PARSE ERROR\`, \`SPEC SIZE MISSING\`), accept the verdict immediately - the upstream halt has already done its job.

Otherwise:

Extract the spec path from the spec-creator's \`SPEC WRITTEN: <path>\` line, and the plan path from the plan-creator's \`PLAN WRITTEN: <path>\` line. Read both files.

Evaluate:
1. Does the plan cover every acceptance criterion / requirement implied by the spec?
2. Does the plan scale to the spec's SIZE declaration (no 5-step plan for a TRIVIAL typo; no 1-bullet plan for a SUBSTANTIAL change)?
3. Are plan steps concrete (no "set up X" or "handle edge cases" without specifics)?
4. Does the plan stay in scope - no proposed edits to .changeset/, .github/workflows/, internal/self-improve/, package.json version fields?
5. Are dependencies and risks called out for SUBSTANTIAL plans?

Reason through each point in prose, then call the verdict command. When rejecting, list each concrete problem as a separate issue argument anchored to a specific spec line or plan step. Vague flags like "needs more detail" do not qualify.`,
});
