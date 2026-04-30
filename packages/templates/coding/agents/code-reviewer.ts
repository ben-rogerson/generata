import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "critic",
  description: "Reviews code in the project dir: typecheck, tests, acceptance criteria",
  modelTier: "standard",
  permissions: "read-only",
  tools: ["bash"],
  promptContext: [
    { filepath: ({ spec_filepath }) => spec_filepath },
    { filepath: ({ plan_filepath }) => plan_filepath },
  ],
  timeoutSeconds: 300,
  promptTemplate: ({ project_dir }) => `
POST-IMPLEMENTATION REVIEW

Review the code in ${project_dir}/. SPEC.md and PLAN.md are in your context.

Check:
- Does the project typecheck? (cd ${project_dir} && pnpm tsc --noEmit if tsconfig.json exists)
- Do tests pass? (cd ${project_dir} && pnpm test if a test script exists in package.json)
- Does the project structure match conventions? (no code/ subdir, source files at the project root or under src/)
- Are there obvious issues? (hardcoded secrets, missing required files)
- Does the output satisfy every acceptance criterion in SPEC.md?

Reason through each point in prose. Anchor every rejection issue to a concrete, locatable fact (e.g. "src/index.ts:12 missing return type" or "SPEC criterion 3 not satisfied: no rate-limit middleware in src/server.ts"). Vague flags like "needs more error handling" do not qualify.`,
});
