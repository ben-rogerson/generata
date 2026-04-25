import { defineAgent } from "@generata/core";

export default defineAgent({
  name: "code-reviewer", // Get this name from the filename
  type: "critic",
  description: "Post-implementation review: checks code after execution",
  modelTier: "standard",
  tools: ["read", "glob", "grep", "bash"],
  permissions: "read-only",
  timeoutSeconds: 300, // whats it do when it times out?
  promptContext: [
    { filepath: "goals.md" },
    { filepath: ({ plan_filepath }) => plan_filepath },
  ],
  promptTemplate: ({ plan_name, output_dir }) => `
  POST-IMPLEMENTATION REVIEW
  Review the code after execution. Check:
  - Does the project typecheck? (run: cd ${output_dir}/${plan_name}/code && pnpm tsc --noEmit if tsconfig.json exists)
  - Do tests pass? (run: pnpm test if tests exist)
  - Does the project structure match conventions?
  - Are there obvious issues? (hardcoded secrets, missing error handling)
  - Does the output satisfy the acceptance criteria in the plan?

  Reason through each point in prose. Anchor every rejection issue to a concrete, locatable fact (e.g. "src/index.ts:12 missing return type annotation"); vague flags like "needs more error handling" do not qualify.`,
});
