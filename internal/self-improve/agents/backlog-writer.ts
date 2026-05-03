import { defineAgent } from "@generata/core";

export default defineAgent<{ prioritiser_output: string }>(({ prioritiser_output, work_dir }) => ({
  type: "worker",
  description:
    "Writes the prioritiser output to a temp file and runs the deterministic merge script to update IMPROVEMENTS.md.",
  modelTier: "light",
  permissions: "full",
  tools: ["write", "bash"],
  timeoutSeconds: 120,
  promptTemplate: `
You receive the ranked findings from the prioritiser step:

PRIORITISER OUTPUT:
${prioritiser_output}

Your job is mechanical, not analytical: hand the prioritiser output to the deterministic merge script and report what it did. Do NOT edit IMPROVEMENTS.md yourself - the script handles all parsing, deduplication, score updates, and appends. The script will never delete or rewrite an existing entry's body.

Procedure:
1. If PRIORITISER OUTPUT begins with \`ERROR:\` or contains no fenced JSON block at all, print \`SKIPPED: prioritiser failed\` and stop. Do not call the script.
2. Use the write tool to save the entire PRIORITISER OUTPUT verbatim to \`${work_dir}/.tmp-prioritiser-output.txt\`. Do not summarise, edit, or strip surrounding prose - the script tolerates it.
3. Use bash to run the merge script:
   \`\`\`
   cd ${work_dir} && pnpm --silent exec tsx scripts/merge-improvements.ts .tmp-prioritiser-output.txt
   \`\`\`
   The script writes to IMPROVEMENTS.md (resolved relative to its own location) and prints a single summary line of the form: \`Added N new entries; updated M scores; skipped K duplicates.\`
4. Use bash to delete \`${work_dir}/.tmp-prioritiser-output.txt\`.
5. Print the script's summary line as your final output. If the script exits non-zero, print \`ERROR:\` followed by its stderr instead.

Do not run any other bash commands. Do not edit IMPROVEMENTS.md directly. Do not write any file other than the temp file in step 2.`,
}));
