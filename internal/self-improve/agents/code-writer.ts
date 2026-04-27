import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Implements the plan: edits files, writes tests, runs typecheck/lint/test before declaring success.",
  modelTier: "heavy",
  permissions: "full",
  tools: ["read", "write", "edit", "bash", "glob", "grep"],
  timeoutSeconds: 1200,
  maxRetries: 1,
  promptTemplate: ({ spec_creator_output, plan_creator_output, work_dir }) => `
You receive the spec and plan paths:

SPEC CREATOR OUTPUT:
${spec_creator_output}

PLAN CREATOR OUTPUT:
${plan_creator_output}

If either output contains a halt sentinel (\`NO_ITEMS\`, \`PICKER PARSE ERROR\`, \`SPEC SIZE MISSING\`), propagate that line verbatim and stop. Do not edit any files. Do not run any commands.

Otherwise:

Extract the paths from the \`SPEC WRITTEN: <path>\` / \`PLAN WRITTEN: <path>\` lines. Read both.

Procedure:
1. Implement the plan steps in order. The work directory for self-improve is \`${work_dir}\`, but you may edit anywhere in the parent generata repo EXCEPT the out-of-scope paths.
2. **Out-of-scope paths - HALT if the plan asks you to touch any of these:**
   - \`.changeset/\` or any \`CHANGELOG.md\`
   - \`package.json\` version fields (any package - "version" key only; other fields are fine)
   - \`.github/workflows/\`
   - \`internal/self-improve/\` (the workflow does not improve itself in v1)
   If the plan calls for any of the above, stop and report \`STATUS: halt - plan requests out-of-scope edit to <path>\`. Do not proceed.
3. Use bash for file system operations and to run the precommit gauntlet:
   - From repo root (\`cd ${work_dir}/../..\`): \`pnpm typecheck && pnpm lint && pnpm test\`
   - All three must pass before you declare success.
   - If something fails, fix it iteratively. Do NOT skip or disable tests. Do NOT run \`--no-verify\` or any flag that bypasses checks.
4. When complete, lead your final response with one of:
   - \`STATUS: complete\` followed by a one-line summary and a list of files changed
   - \`STATUS: partial\` followed by what is left and why
   - \`STATUS: halt\` followed by the reason (out-of-scope, blocked, etc.)

Do not commit. Do not run \`git\` for anything destructive (no \`git reset\`, \`git checkout --\`, \`git clean\`, etc.). Do not run \`gh\`. Read-only git introspection (\`git diff\`, \`git status\`, \`git log\`) is fine. Leave the working tree dirty for the human to inspect and \`/ship\`.`,
});
