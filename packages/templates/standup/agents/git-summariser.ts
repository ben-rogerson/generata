import { defineAgent } from "@generata/core";

export default defineAgent<{ repo: string }>(({ repo, work_dir }) => ({
  type: "worker",
  description: "Reads recent git activity and emits a terse list of what happened",
  modelTier: "light",
  tools: ["bash"],
  permissions: "read-only",
  timeoutSeconds: 60,
  promptTemplate: `
Summarise yesterday's git activity in ${repo || work_dir}.

Steps:
1. cd to ${repo || work_dir}
2. Run: git log --since="1 day ago" --pretty=format:"%h %s" --no-merges
3. Also run: git log --since="1 day ago" --shortstat --pretty=format:"%h" --no-merges
4. Summarise as a bullet list of what was done. Group related commits (e.g. "rewrote auth (4 commits, +120/-80)").
5. Keep it under 8 bullets. If nothing happened, say so explicitly.

Output ONLY the bullet list - no preamble, no closing remarks.
`,
}));
