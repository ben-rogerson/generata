import { defineAgent } from "@generata/core";

export default defineAgent<{ ranked_json: string }>(({ ranked_json, work_dir }) => ({
  type: "worker",
  description:
    "Writes the ranked findings JSON to a temp file and runs the deterministic merge script to update IMPROVEMENTS.md.",
  modelTier: "light",
  permissions: "full",
  tools: ["write", "bash"],
  timeoutSeconds: 120,
  outputs: {},
  prompt: `
You receive the ranked findings as a JSON string from the prioritiser step:

RANKED_JSON:
${ranked_json}

Your job is mechanical, not analytical: hand the JSON to the deterministic merge script and report what it did. Do NOT edit IMPROVEMENTS.md yourself - the script handles all parsing, deduplication, score updates, and appends. The script will never delete or rewrite an existing entry's body.

Procedure:
1. Use the write tool to save the entire RANKED_JSON value verbatim to \`${work_dir}/.tmp-prioritiser-output.txt\`.
2. Use bash to run the merge script:
   \`\`\`
   cd ${work_dir} && pnpm --silent exec tsx scripts/merge-improvements.ts .tmp-prioritiser-output.txt
   \`\`\`
   The script writes to IMPROVEMENTS.md (resolved relative to its own location) and prints a single summary line of the form: \`Added N new entries; updated M scores; skipped K duplicates.\`
3. Use bash to delete \`${work_dir}/.tmp-prioritiser-output.txt\`.
4. If the script exited non-zero, halt with reason "merge script failed: <one-line stderr summary>" and paste the full stderr in your text response.
5. On success, print the script's summary line as your final text response.

Do not run any other bash commands. Do not edit IMPROVEMENTS.md directly. Do not write any file other than the temp file in step 1.`,
}));
