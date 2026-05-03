import { defineAgent } from "@generata/core";

export default defineAgent<{
  spec_filepath: string;
  plan_filepath: string;
  code_writer_output: string;
}>(({ spec_filepath, plan_filepath, code_writer_output }) => {
  const project_dir = spec_filepath.replace(/\/SPEC\.md$/, "");
  return {
    type: "critic",
    description: "Reviews code in the project dir: typecheck, tests, acceptance criteria",
    modelTier: "standard",
    permissions: "read-only",
    tools: ["bash"],
    timeoutSeconds: 300,
    promptTemplate: `
Project directory: ${project_dir}
SPEC: ${spec_filepath}
PLAN: ${plan_filepath}

CODE WRITER OUTPUT:
${code_writer_output}

POST-IMPLEMENTATION REVIEW

Read SPEC.md and PLAN.md, then check:
- Does the project typecheck? (cd ${project_dir} && pnpm tsc --noEmit if tsconfig.json exists)
- Do tests pass? (cd ${project_dir} && pnpm test if a test script exists in package.json)
- Does the project structure match conventions? (no code/ subdir, source files at the project root or under src/)
- Are there obvious issues? (hardcoded secrets, missing required files)
- Does the output satisfy every acceptance criterion in SPEC.md?

Reason through each point in prose. Anchor every rejection issue to a concrete, locatable fact (e.g. "src/index.ts:12 missing return type" or "SPEC criterion 3 not satisfied: no rate-limit middleware in src/server.ts"). Vague flags like "needs more error handling" do not qualify.`,
  };
});
