import { defineAgent } from "@generata/core";
import { renderOutOfScopeList } from "./_out-of-scope.js";

export default defineAgent<{ spec_filepath: string; plan_filepath: string }>(
  ({ spec_filepath, plan_filepath, work_dir }) => {
    const repo_root = `${work_dir}/../..`;
    const diff_filepath = `${work_dir}/last-diff.patch`;
    return {
      type: "worker",
      description:
        "Implements the plan: edits files, writes tests, runs typecheck/lint/test before declaring success.",
      modelTier: "heavy",
      permissions: "full",
      tools: ["write", "edit", "bash"],
      timeoutSeconds: 1200,
      maxRetries: 1,
      prompt: `
SPEC: ${spec_filepath}
PLAN: ${plan_filepath}

Read both files.

Procedure:
1. Implement the plan steps in order. The work directory for self-improve is \`${work_dir}\`, but you may edit anywhere in the parent generata repo EXCEPT the out-of-scope paths.
2. **Out-of-scope paths - HALT if the plan asks you to touch any of these:**
${renderOutOfScopeList()}
   If the plan calls for any of the above, halt with reason "out-of-scope: plan requests edit to <path>". Do not proceed.
3. **Dependency changes are out-of-scope unless the plan explicitly enumerates the package and version.** Do not run \`pnpm add\`, \`pnpm remove\`, \`pnpm install <pkg>\`, \`npm install\`, etc. unless the plan calls for it by name. \`pnpm install\` (no args, refresh existing lockfile) is permitted only if a config edit demands it. Halt with reason "dependency change not enumerated: <pkg>" if needed.
4. **Test discipline.** Do not skip, comment out, \`.skip\`, \`.todo\`, \`.only\` (which excludes others), or otherwise disable existing tests. If a test appears flaky, retry it once; if it still fails, halt with reason "flaky test <path>::<name>" and paste the failure output in your text response. Editing test files to make them pass without fixing the underlying behaviour is a regression, not a fix.
5. Use bash for file system operations and to run the precommit gauntlet:
   - From repo root (\`cd ${repo_root}\`): \`pnpm typecheck && pnpm lint && pnpm test\`
   - All three must pass before you declare success.
   - If something fails, fix it iteratively (fix the code, not the test). Do NOT run \`--no-verify\` or any flag that bypasses checks.
6. **After the gauntlet passes**, capture the diff: \`git -C ${repo_root} diff HEAD > ${diff_filepath}\`. This file feeds the reviewer and summariser; they will not re-run \`git diff\` themselves.
7. On success, lead your text response with \`STATUS: complete\`, a one-line summary, and a list of files changed.
8. **Genuine external blockers only** (network/auth/missing creds): halt with reason "partial: <blocker detail>". This is NOT acceptable for "ran out of effort," failing tests, or lint errors - fix those or halt with the failure detail. Use halt-as-partial sparingly.

Do not commit. Do not run \`git\` for anything destructive (no \`git reset\`, \`git checkout --\`, \`git clean\`, \`git stash drop\`, etc.). Do not run \`gh\`. Read-only git introspection (\`git diff\`, \`git status\`, \`git log\`) is fine. Leave the working tree dirty for the human to inspect and \`/ship\`.`,
      outputs: {
        diff_filepath: `Absolute path to the unified-diff patch file you wrote at ${diff_filepath} after the gauntlet passed. Always echo this exact path; do not invent a different one.`,
        checks_passed:
          "Literal 'true' if pnpm typecheck && pnpm lint && pnpm test all passed in the worktree. If any failed, halt instead of emitting; do not emit 'false'.",
      },
    };
  },
);
