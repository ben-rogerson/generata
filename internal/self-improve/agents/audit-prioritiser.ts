import { defineAgent } from "@generata/core";

export default defineAgent<{}>(({ work_dir }) => ({
  type: "worker",
  description:
    "Reads IMPROVEMENTS.md, scores each unscored entry, and edits the header in place to add the score.",
  modelTier: "standard",
  permissions: "read-only",
  tools: ["edit"],
  timeoutSeconds: 600,
  promptContext: [{ filepath: "IMPROVEMENTS.md", optional: true }],
  prompt: `
The backlog file is \`${work_dir}/IMPROVEMENTS.md\` (absolute path - use it verbatim with the Edit tool; do not write to any other location). It is in your context above. The repo-scanner has appended new entries with headers of the form:
  \`### <slug> [<lens>]\`

Your job is to score each such unscored entry. Entries already scored have headers of the form \`### <slug> [<lens> · score <N>]\` - leave those untouched.

For each unscored entry:
1. Choose impact (1-5): 5 = significantly improves DX/correctness for many users, 1 = marginal nicety.
2. Choose effort (1-5): 5 = multi-day refactor with risk, 1 = one-line fix.
3. Compute base_score = impact * (6 - effort). Range: 5..25.
4. Apply lens weighting: multiply base_score by 1.2 if lens is "dx-api" or "consistency"; otherwise 1.0. Round to the nearest integer to produce \`score\`.
5. Use the Edit tool to rewrite the entry header exactly:
     from: \`### <slug> [<lens>]\`
     to:   \`### <slug> [<lens> · score <N>]\`
   Do not modify any other line of the entry. Do not delete or merge entries.

You may only Edit \`${work_dir}/IMPROVEMENTS.md\`. Do not edit any other file.

If \`${work_dir}/IMPROVEMENTS.md\` has no unscored entries, halt with reason "no unscored entries to rank".`,
  outputs: {},
}));
