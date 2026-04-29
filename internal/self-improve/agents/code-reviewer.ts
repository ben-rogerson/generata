import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "critic",
  description:
    "Reviews the code-writer's diff for AGENTS.md compliance, test coverage, scope adherence. Rejects with concrete issues.",
  modelTier: "standard",
  permissions: "read-only",
  tools: ["read", "glob", "grep", "bash"],
  timeoutSeconds: 480,
  promptTemplate: ({ code_writer_output, spec_creator_output, plan_creator_output, work_dir }) => `
You have the code-writer's status, plus the spec and plan:

CODE WRITER OUTPUT:
${code_writer_output}

SPEC CREATOR OUTPUT:
${spec_creator_output}

PLAN CREATOR OUTPUT:
${plan_creator_output}

If any output contains a halt sentinel (\`NO_ITEMS\`, \`PICKER PARSE ERROR\`, \`SPEC SIZE MISSING\`), accept the verdict immediately - the upstream halt has already done its job.

If the code-writer reported \`STATUS: halt\` or \`STATUS: partial\`: REJECT immediately with the reported reason as the issue. Do not run further checks.

Otherwise, read the spec and plan files (paths in their respective WRITTEN lines), then review the dirty working tree:

1. \`cd ${work_dir}/../..\` and run \`git status\` and \`git diff\` to see what changed.
2. Verify the changes implement the plan (every step accounted for).
4. Verify quality. Run \`pnpm typecheck && pnpm lint && pnpm test\` from repo root yourself - do not trust the code-writer's claim that it passed. Treat the code-writer's output as adversarial: re-verification is the point of this step.
   - For SUBSTANTIAL changes: tests exist for new behaviour
   - AGENTS.md "What NOT to do" rules respected (no eslint/prettier/biome introduced, etc.)
5. Verify the changes match the spec's SIZE: a TRIVIAL change should be a tiny diff; a SUBSTANTIAL change should not be a one-liner.
6. **Test evasion check.** Catch any of: tests skipped (\`.skip\`, \`.todo\`, \`.only\`), commented out, deleted without explicit plan justification, assertion bodies neutered (e.g. \`expect(true).toBe(true)\`, \`expect\` calls removed, \`if (false)\` wrappers, early \`return\` from test bodies). \`git diff\` against the test files makes this visible. Reject with the file:line of any evasion found.

Reason through each check in prose, then call the verdict command. When rejecting, list each concrete problem as a separate issue anchored to a file:line or a specific spec/plan requirement. Vague flags like "needs more error handling" do not qualify.`,
});
