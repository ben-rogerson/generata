import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Writes last-run.md (summary + bump + commit msg draft) and removes the shipped item from IMPROVEMENTS.md.",
  modelTier: "light",
  permissions: "full",
  tools: ["read", "write", "edit", "bash"],
  timeoutSeconds: 300,
  promptTemplate: ({ picker_output, code_writer_output, work_dir }) => `
You finalise an improve run. Inputs:

PICKER OUTPUT:
${picker_output}

CODE WRITER OUTPUT:
${code_writer_output}

If either output contains a halt sentinel (\`NO_ITEMS\`, \`PICKER PARSE ERROR\`, \`SPEC SIZE MISSING\`), or if CODE WRITER OUTPUT starts with \`STATUS: halt\` / \`STATUS: partial\`, write a brief \`${work_dir}/last-run.md\` capturing what halted and why (one paragraph) and stop. Do not modify IMPROVEMENTS.md - the item was not shipped.

Otherwise (i.e. CODE WRITER OUTPUT begins with \`STATUS: complete\`):

Procedure:
1. Parse the picker JSON to get the slug.
2. From repo root (\`cd ${work_dir}/../..\`), run \`git diff --stat\` to see what changed.
3. Decide the changeset bump per AGENTS.md rules:
   - **patch** = bug fix, internal refactor, doc tweak with no behaviour change
   - **minor** = new feature, new flag, new export
   - **major** = breaking change to the public API (\`packages/core/src/define.ts\` exports)
   - **none** = CI/internal-only changes, fixture-only, test-only
4. Write \`${work_dir}/last-run.md\` (overwrite if exists) with these sections (markdown):
   - **Summary** (one paragraph: what was changed and why)
   - **Files changed** (the \`git diff --stat\` output as a fenced block)
   - **Suggested changeset bump** (\`patch\` / \`minor\` / \`major\` / \`none\` with one-sentence reasoning)
   - **Commit message draft** (conventional-commit format: \`<type>: <subject>\` then a body paragraph)
5. Edit \`${work_dir}/IMPROVEMENTS.md\` to remove the entry whose slug matches the picker's slug. Remove the heading line, body lines, evidence/suggested-change bullets, and the trailing \`---\` separator (or leading, if it's the first entry - leave the file with one less entry and one less separator). Leave the file header (everything above the first entry) intact.
6. Lead your final response with: \`SHIPPED: <slug>\` then a one-line summary.

Do not run \`git commit\`, \`git push\`, or \`gh\`. The human runs \`/ship\` after reviewing last-run.md. \`last-run.md\` is gitignored - it is local scratch, not committed.`,
});
