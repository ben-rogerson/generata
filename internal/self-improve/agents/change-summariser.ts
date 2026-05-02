import { defineAgent } from "@generata/core";

export default defineAgent<{ picker_output: string; code_writer_output: string }>(
  ({ picker_output, code_writer_output, work_dir }) => ({
    type: "worker",
    description:
      "Writes last-run.md (summary + bump + commit msg draft) and removes the shipped item from IMPROVEMENTS.md.",
    modelTier: "light",
    permissions: "full",
    tools: ["write", "edit", "bash"],
    timeoutSeconds: 300,
    promptTemplate: `
You finalise an improve run. Inputs:

PICKER OUTPUT:
${picker_output}

CODE WRITER OUTPUT:
${code_writer_output}

If either output contains a halt sentinel (\`NO_ITEMS\`, \`PICKER PARSE ERROR\`, \`SPEC SIZE MISSING\`), or if CODE WRITER OUTPUT starts with \`STATUS: halt\` / \`STATUS: partial\`, write a brief \`${work_dir}/last-run.md\` capturing what halted and why (one paragraph) and stop. Do not modify IMPROVEMENTS.md - the item was not shipped.

Otherwise (i.e. CODE WRITER OUTPUT begins with \`STATUS: complete\`):

Procedure:
1. Locate the fenced JSON block in PICKER OUTPUT and parse it to get the slug.
2. From repo root (\`cd ${work_dir}/../..\`), run \`git diff --stat HEAD\` to see what changed (captures both staged and unstaged).
3. Decide the changeset bump per AGENTS.md rules:
   - **patch** = bug fix, internal refactor, doc tweak with no behaviour change
   - **minor** = new feature, new flag, new export
   - **major** = breaking change to anything exported from \`@generata/core\` (consult \`packages/core/package.json\` \`exports\` field for the public surface; \`define.ts\` and the types it re-exports from \`schema.ts\` are the typical surface)
   - **none** = CI/internal-only changes, fixture-only, test-only, internal/self-improve/ changes
4. Write \`${work_dir}/last-run.md\` (overwrite if exists) with these sections (markdown):
   - **Summary** (one paragraph: what was changed and why)
   - **Files changed** (the \`git diff --stat HEAD\` output as a fenced block)
   - **Suggested changeset bump** (\`patch\` / \`minor\` / \`major\` / \`none\` with one-sentence reasoning)
   - **Commit message draft** (conventional-commit format: \`<type>: <subject>\` then a body paragraph)
5. Edit \`${work_dir}/IMPROVEMENTS.md\` to remove the entry whose slug matches the picker's slug. Remove the entry plus exactly one adjacent \`---\` separator (the one immediately after it, or - if it is the last entry in the file - the one immediately before it). If it is the only entry, no separator exists - just remove the entry's lines. Leave the file header (everything above the first entry) intact.
6. Lead your final response with: \`SHIPPED: <slug>\` then a one-line summary.

Do not run \`git commit\`, \`git push\`, or \`gh\` - the next step (\`ship\`) does that, using the bump and commit message you write here. \`last-run.md\` is gitignored - it is local scratch, not committed.`,
  }),
);
