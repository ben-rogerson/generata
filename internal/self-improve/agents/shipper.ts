import { defineAgent } from "@generata/core";

export default defineAgent<{ summariser_output: string }>(({ summariser_output, work_dir }) => ({
  type: "worker",
  description:
    "Runs the /ship procedure (branch, commit, changeset, push, PR) using the bump and commit message from last-run.md.",
  modelTier: "light",
  permissions: "full",
  tools: ["write", "edit", "bash"],
  timeoutSeconds: 900,
  promptTemplate: `
You ship the change that the previous step just summarised.

SUMMARISER OUTPUT:
${summariser_output}

If SUMMARISER OUTPUT does not begin with \`SHIPPED:\`, the run halted - report \`SKIPPED: nothing to ship\` and stop. Do not run any git, gh, or pnpm commands.

Otherwise, execute the /ship skill at \`${work_dir}/../../.claude/skills/ship/SKILL.md\`. Read it before acting. Run all git/gh/pnpm commands from repo root (\`cd ${work_dir}/../..\`).

Decisions are pre-made in \`${work_dir}/last-run.md\` - read it and use these values rather than re-deciding:
- **Slug**: from the H1 (\`# Last run: <slug>\`). Use it as the branch description: \`<type>/<slug>\`.
- **Commit message**: use the fenced block under "Commit message draft" verbatim. Derive \`<type>\` from its conventional-commit prefix (\`feat\`, \`fix\`, \`chore\`, \`docs\`, \`refactor\`, \`test\`, \`ci\`).
- **Changeset bump**: from the "Suggested changeset bump" section. Apply per /ship's table:
  - \`patch\` or \`minor\`: write the changeset and commit it as a separate \`chore: add changeset\` commit.
  - \`none\`: skip the changeset step entirely.
  - \`major\`: halt with \`FAILED: major bump needs human review\`. Do not push.

Staging guidance:
- \`internal/self-improve/IMPROVEMENTS.md\` and \`internal/self-improve/last-run.md\` are gitignored - they will not appear in \`git status\` and you do not need to stage them.
- Stage only the code-writer's changes by explicit path. Never \`git add -A\` or \`git add .\`.

If \`pnpm typecheck\` or \`pnpm test\` fails, halt with \`FAILED: <reason>\` and paste the error. Do not push broken work. Do not skip hooks. Do not amend or force-push.

On success, lead your final response with \`SHIPPED: <PR URL>\` (or \`SHIPPED: pushed to <branch>\` if pushing to an existing PR).`,
}));
