import { defineAgent } from "@generata/core";

export default defineAgent<{
  slug: string;
  bump: string;
  commit_subject: string;
  commit_body: string;
}>(({ slug, bump, commit_subject, commit_body, work_dir }) => ({
  type: "worker",
  description:
    "Runs the /ship procedure (branch, commit, changeset, push, PR) using the typed bump and commit values from change-summariser.",
  modelTier: "light",
  permissions: "full",
  tools: ["write", "edit", "bash"],
  timeoutSeconds: 900,
  // outputs: {} declared so the engine wires the emit bin for the halt path.
  // Success is signalled via text leader (SHIPPED: <PR URL>) - no typed
  // outputs flow downstream because shipper is the last step.
  outputs: {},
  prompt: `
You ship the change that the previous step just summarised. The values to use:

SLUG:           ${slug}
BUMP:           ${bump}
COMMIT SUBJECT: ${commit_subject}
COMMIT BODY:    ${commit_body}

Execute the /ship skill at \`${work_dir}/../../.claude/skills/ship/SKILL.md\`. Read it before acting. Run all git/gh/pnpm commands from repo root (\`cd ${work_dir}/../..\`).

Use the typed values above directly:
- **Branch description**: \`<type>/${slug}\`. Derive \`<type>\` from the COMMIT SUBJECT's conventional-commit prefix (\`feat\`, \`fix\`, \`chore\`, \`docs\`, \`refactor\`, \`test\`, \`ci\`).
- **Commit message**: COMMIT SUBJECT as the subject line; COMMIT BODY as the body paragraph. Use exactly these strings - do not rephrase.
- **Changeset bump**: BUMP. Apply per /ship's table:
  - \`patch\` or \`minor\`: write the changeset and commit it as a separate \`chore: add changeset\` commit.
  - \`none\`: skip the changeset step entirely.
  - \`major\`: halt with reason "major bump needs human review". Do not push.

Staging guidance:
- \`internal/self-improve/IMPROVEMENTS.md\` and \`internal/self-improve/last-run.md\` are gitignored - they will not appear in \`git status\` and you do not need to stage them.
- Stage only the code-writer's changes by explicit path. Never \`git add -A\` or \`git add .\`.

If \`pnpm typecheck\` or \`pnpm test\` fails, halt with reason "typecheck/test failed: <one-line summary>" and paste the full error in your text response. Do not push broken work. Do not skip hooks. Do not amend or force-push.

On success, lead your final text response with \`SHIPPED: <PR URL>\` (or \`SHIPPED: pushed to <branch>\` if pushing to an existing PR).`,
}));
