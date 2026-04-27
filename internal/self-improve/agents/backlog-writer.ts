import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Merges prioritised findings into IMPROVEMENTS.md. Appends new entries; updates scores in place for re-encountered ones.",
  modelTier: "light",
  permissions: "full",
  tools: ["read", "write", "edit"],
  timeoutSeconds: 240,
  promptContext: [{ filepath: "IMPROVEMENTS.md" }],
  promptTemplate: ({ prioritiser_output }) => `
You receive the ranked findings from the prioritiser step:

PRIORITISER OUTPUT:
${prioritiser_output}

The current IMPROVEMENTS.md is in your context. The file format:

Each entry starts with:
\`### <slug> [<lens> · score <N>]\`
followed by 1-2 sentences of body, then:
\`- **Evidence:** path:line, path:line\`
\`- **Suggested change:** ...\`
followed by a \`---\` separator.

Procedure:
1. Locate the fenced JSON block in PRIORITISER OUTPUT and parse it. The shape is \`{ "ranked": [ ... ] }\`. If parsing fails, print a single line starting with \`ERROR:\` and stop without writing anything.
2. For each ranked finding, derive a slug from its title: lowercase, replace runs of non-alphanumeric chars with single dashes, strip leading/trailing dashes. Slugs must be unique across the file.
3. For each finding:
   a. If a matching entry exists (slug equals OR (lens equals AND any evidence_path overlaps - compare on the path component before any \`:line\` suffix)): do NOT add a new entry. If the score differs, update only the score in the heading of the existing entry. Leave body and evidence intact.
   b. Otherwise: append a new entry to the bottom of the file (after the last existing \`---\` separator). New entries are separated by \`---\` lines. Each new entry has the format:
      \`\`\`
      ### <slug> [<lens> · score <N>]

      <description>

      - **Evidence:** <path>, <path>
      - **Suggested change:** <suggested_change>

      ---
      \`\`\`
      For each new entry, derive the suggested change text from the finding's \`suggested_change_kind\` plus context, e.g. "Refactor to extract helper" / "Add test for the empty input case" / "Update README to reference build-project".
4. Write the updated file back to IMPROVEMENTS.md using the write or edit tool. Path: \`IMPROVEMENTS.md\` (resolved relative to work_dir which is internal/self-improve/, so the file you read in context is the file you write).
5. Print a one-line summary: \`Added N new entries; updated M scores; skipped K duplicates.\`

The header of the file (the lines above the first \`---\`) is fixed; do not modify it. The \`<!-- audit appends entries below this line -->\` comment may stay where it is or be removed once entries exist - your choice; pick the cleaner result.

You are full-permission only because you must write IMPROVEMENTS.md. Do not write any other file. Do not run bash. Do not write outside the IMPROVEMENTS.md file.`,
});
