import { defineAgent } from "@generata/core";

export default defineAgent<{ slug: string; code_writer_output: string }>(
  ({ slug, code_writer_output, work_dir }) => ({
    type: "worker",
    description:
      "Writes last-run.md (human-readable summary) and emits typed slug/bump/commit fields for the shipper. Removes the shipped item from IMPROVEMENTS.md.",
    modelTier: "light",
    permissions: "full",
    tools: ["write", "edit", "bash"],
    timeoutSeconds: 300,
    outputs: {
      slug: "Kebab-case slug of the shipped item (echo the input slug verbatim)",
      bump: "One of: patch, minor, major, none",
      commit_subject: "Conventional-commit subject line: <type>: <subject> (single line)",
      commit_body:
        "Commit message body paragraph (single line; use \\\\n for paragraph breaks if needed)",
    },
    promptTemplate: `
You finalise an improve run.

SHIPPED SLUG: ${slug}

CODE WRITER OUTPUT (for the summary text):
${code_writer_output}

Procedure:
1. From repo root (\`cd ${work_dir}/../..\`), run \`git diff --stat HEAD\` to see what changed (captures both staged and unstaged).
2. Decide the changeset bump per AGENTS.md rules:
   - **patch** = bug fix, internal refactor, doc tweak with no behaviour change
   - **minor** = new feature, new flag, new export
   - **major** = breaking change to anything exported from \`@generata/core\` (consult \`packages/core/package.json\` \`exports\` field for the public surface; \`define.ts\` and the types it re-exports from \`schema.ts\` are the typical surface)
   - **none** = CI/internal-only changes, fixture-only, test-only, internal/self-improve/ changes
3. Write \`${work_dir}/last-run.md\` (overwrite if exists) with these sections (markdown). This is a human-readable artifact; the shipper does not parse it.
   - **Summary** (one paragraph: what was changed and why)
   - **Files changed** (the \`git diff --stat HEAD\` output as a fenced block)
   - **Suggested changeset bump** (\`patch\` / \`minor\` / \`major\` / \`none\` with one-sentence reasoning)
   - **Commit message draft** (conventional-commit format: \`<type>: <subject>\` then a body paragraph)
4. Edit \`${work_dir}/IMPROVEMENTS.md\` to remove the entry whose slug matches \`${slug}\`. Remove the entry plus exactly one adjacent \`---\` separator (the one immediately after it, or - if it is the last entry in the file - the one immediately before it). If it is the only entry, no separator exists - just remove the entry's lines. Leave the file header (everything above the first entry) intact.
Do not run \`git commit\`, \`git push\`, or \`gh\` - the next step (\`ship\`) does that, using the typed values you produce. \`last-run.md\` is gitignored - it is local scratch, not committed.`,
  }),
);
