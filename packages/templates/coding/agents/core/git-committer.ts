import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description: "Create a git commit with a well-structured message",
  modelTier: "light",
  tools: ["bash"],
  permissions: "full",
  timeoutSeconds: 120,
  promptContext: [],
  promptTemplate: () => `
  Create a git commit for the work done on this task, then push the branch. Steps:
  1. Run \`git status\` to see what changed
  2. Run \`git diff --stat\` to understand the scope
  3. Stage the relevant files with \`git add\`
  4. Write a commit message following conventional commits format:
    - type(scope): short description (50 chars max)
    - Blank line
    - Body: what changed and why (wrap at 72 chars)
  5. Commit with the message
  6. Determine the current branch: \`BRANCH=$(git rev-parse --abbrev-ref HEAD)\`
  7. If the branch is \`main\` or \`master\`, SKIP the push and output: "SKIPPED PUSH: on protected branch $BRANCH"
  8. Otherwise push and set upstream: \`git push -u origin "$BRANCH"\`
  9. Output a single line first: "COMMITTED: [hash] [type(scope): message]", then on the next line either "PUSHED: $BRANCH" or "SKIPPED PUSH: on protected branch $BRANCH", then any further notes.

  Commit types: feat, fix, refactor, docs, test, chore, build
  Do NOT use --no-verify.`,
});
