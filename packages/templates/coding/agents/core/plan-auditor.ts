import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "plan-auditor",
  type: "critic",
  description:
    "Triage staged plans - approve to proceed or reject to halt the workflow",
  modelTier: "standard",
  tools: ["read", "glob", "grep", "bash"],
  permissions: "read-only",
  timeoutSeconds: 180,
  promptContext: [
    { filepath: "goals.md" },
    { filepath: ({ plan_filepath }) => plan_filepath },
  ],
  promptTemplate: ({ plans_dir, output_dir }) => `
  Evaluate the plan:
  1. Does it have clear acceptance criteria?
  2. Are the steps concrete and actionable (no vague steps like "set up" or "handle X")?
  3. Does it align with the goals in goals.md?
  4. Are there conflicts with other plans in ${plans_dir}/?
  5. Is the scope reasonable (not too large, not too small)?
  6. Does it duplicate an existing project? (scan ${output_dir}/ directory)

  Reason through each point in prose, then call the verdict command. When rejecting, list each concrete problem as a separate issue argument - the engine uses those verbatim to tell the plan author what to fix.`,
});
