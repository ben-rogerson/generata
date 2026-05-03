import { defineAgent } from "@generata/core";

export default defineAgent<{
  slug: string;
  bump: string;
  commit_subject: string;
  commit_body: string;
  checks_passed: string;
}>(({ slug, bump, commit_subject, commit_body, checks_passed, work_dir }) => {
  const worktree_root = `${work_dir}/../..`;
  return {
    type: "worker",
    description:
      "Runs the /ship procedure (branch, commit, changeset, push, PR) using the typed bump and commit values from change-summariser.",
    modelTier: "light",
    permissions: "full",
    tools: ["write", "edit", "bash"],
    timeoutSeconds: 900,
    prompt: `
You ship the change that the previous step just summarised. The values to use:

SLUG:           ${slug}
BUMP:           ${bump}
COMMIT SUBJECT: ${commit_subject}
COMMIT BODY:    ${commit_body}
WRITER REPORTS: checks_passed=${checks_passed}

**Two locations.** The code-writer's edits live in a worktree, but you ship from the main repo:

- **WORKTREE** (changes are here): ${worktree_root}
- **MAIN REPO** (ship from here): derive once with
  \`MAIN_REPO=$(git -C ${worktree_root} worktree list --porcelain | awk '$1=="worktree"{print $2; exit}')\`
  and reuse \`$MAIN_REPO\` for every git/gh/pnpm command below. Do not \`cd\` between them - prefer \`git -C "$MAIN_REPO"\` and \`(cd "$MAIN_REPO" && pnpm ...)\`.

Read the /ship skill at \`${worktree_root}/.claude/skills/ship/SKILL.md\` once before acting; it has the canonical commit/changeset/PR conventions.

Use the typed values above directly:
- **Branch**: \`<type>/${slug}\`. Derive \`<type>\` from the COMMIT SUBJECT's conventional-commit prefix (\`feat\`, \`fix\`, \`chore\`, \`docs\`, \`refactor\`, \`test\`, \`ci\`).
- **Commit message**: COMMIT SUBJECT as the subject line; COMMIT BODY as the body paragraph. Use exactly these strings - do not rephrase.
- **Changeset bump**: BUMP. Apply per /ship's table:
  - \`patch\` or \`minor\`: write the changeset and commit it as a separate \`chore: add changeset\` commit.
  - \`none\`: skip the changeset step entirely.
  - \`major\`: halt with reason "major bump needs human review". Do not push.

Procedure (call commands once each unless something fails):
1. Compute \`$MAIN_REPO\` as above.
2. Switch main repo to a fresh branch: \`git -C "$MAIN_REPO" checkout main && git -C "$MAIN_REPO" pull --ff-only origin main && git -C "$MAIN_REPO" checkout -b <branch>\`.
3. Copy the writer's changed files from \`${worktree_root}\` into \`$MAIN_REPO\` at the same relative paths. Source the file list from the patch at \`${worktree_root}\`/internal/self-improve/last-diff.patch (or fall back to \`git -C ${worktree_root} diff --name-only HEAD\`).
4. Run validation **once** in \`$MAIN_REPO\` as the final gate (the worktree gauntlet ran in a different working tree): \`(cd "$MAIN_REPO" && pnpm typecheck && pnpm lint && pnpm test)\`. If anything fails, halt with reason "typecheck/lint/test failed in main: <one-line summary>" and paste the error in your text response. Do not push broken work, do not skip hooks, do not amend, do not force-push.
5. Stage only the writer's paths by explicit name (never \`git add -A\` or \`git add .\`). \`internal/self-improve/IMPROVEMENTS.md\` and \`internal/self-improve/last-run.md\` and \`internal/self-improve/last-diff.patch\` are gitignored - they will not appear in \`git status\` and you do not need to stage them.
6. Commit, push, open the PR per the /ship skill.

On success, lead your final text response with \`SHIPPED: <PR URL>\` (or \`SHIPPED: pushed to <branch>\` if pushing to an existing PR).`,
    outputs: {},
  };
});
