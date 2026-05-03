import { defineAgent } from "@generata/core";
import { renderOutOfScopeList } from "./_out-of-scope.js";

export default defineAgent<{ spec_creator_output: string; plan_creator_output: string }>(
  ({ spec_creator_output, plan_creator_output, work_dir }) => ({
    type: "worker",
    description:
      "Implements the plan: edits files, writes tests, runs typecheck/lint/test before declaring success.",
    modelTier: "heavy",
    permissions: "full",
    tools: ["write", "edit", "bash"],
    timeoutSeconds: 1200,
    maxRetries: 1,
    promptTemplate: `
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
${renderOutOfScopeList()}
   If the plan calls for any of the above, stop and report \`STATUS: halt - plan requests out-of-scope edit to <path>\`. Do not proceed.
3. **Dependency changes are out-of-scope unless the plan explicitly enumerates the package and version.** Do not run \`pnpm add\`, \`pnpm remove\`, \`pnpm install <pkg>\`, \`npm install\`, etc. unless the plan calls for it by name. \`pnpm install\` (no args, refresh existing lockfile) is permitted only if a config edit demands it.
4. **Test discipline.** Do not skip, comment out, \`.skip\`, \`.todo\`, \`.only\` (which excludes others), or otherwise disable existing tests. If a test appears flaky, retry it once; if it still fails, report \`STATUS: halt - flaky test <path>::<name>\` with the failure output pasted. Editing test files to make them pass without fixing the underlying behaviour is a regression, not a fix.
5. Use bash for file system operations and to run the precommit gauntlet:
   - From repo root (\`cd ${work_dir}/../..\`): \`pnpm typecheck && pnpm lint && pnpm test\`
   - All three must pass before you declare success.
   - If something fails, fix it iteratively (fix the code, not the test). Do NOT run \`--no-verify\` or any flag that bypasses checks.
6. When complete, lead your final response with one of:
   - \`STATUS: complete\` followed by a one-line summary and a list of files changed
   - \`STATUS: halt\` followed by the reason. Use halt for: out-of-scope plan request, dependency change not enumerated, flaky test, ambiguous spec requirement that needs human input
   - \`STATUS: partial\` is reserved for genuine external blockers (network/auth/missing creds). It is NOT acceptable for "ran out of effort," failing tests, or lint errors. If you hit a tough error, fix it or halt with the failure output - do not declare partial.

Do not commit. Do not run \`git\` for anything destructive (no \`git reset\`, \`git checkout --\`, \`git clean\`, \`git stash drop\`, etc.). Do not run \`gh\`. Read-only git introspection (\`git diff\`, \`git status\`, \`git log\`) is fine. Leave the working tree dirty for the human to inspect and \`/ship\`.`,
  }),
);
