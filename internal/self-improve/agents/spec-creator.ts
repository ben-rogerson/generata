import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Writes a spec for the picked improvement, sized to the change (trivial / small / substantial).",
  modelTier: "standard",
  permissions: "full",
  tools: ["read", "write", "glob", "grep"],
  timeoutSeconds: 300,
  promptTemplate: ({ picker_output, today, work_dir }) => `
You receive the picked item from the picker step:

PICKER OUTPUT:
${picker_output}

If PICKER OUTPUT contains the literal string \`NO_ITEMS\`, print \`NO_ITEMS\` on a single line and stop. Do not write a spec. Do not call any tool. The workflow will halt.

Otherwise:

Sizing rule (decide which applies, then write to that size):
- TRIVIAL (typo, one-line fix, doc tweak): spec is 1-3 sentences total, no headings.
- SMALL (single-file change, no new public API): spec is one short section, ~150 words.
- SUBSTANTIAL (multi-file, new exports, behavioural change): full multi-section spec with Goal, Non-goals, Approach, Open questions.

Procedure:
1. Locate the fenced JSON block in PICKER OUTPUT and parse it. Read slug, description, evidence_paths, suggested_change.
2. Read the evidence files (using read/grep tools) to ground the spec in current code. Skim around the cited line ranges to confirm the issue is real.
3. Decide trivial / small / substantial based on the suggested_change scope and what you read.
4. Write the spec to: \`${work_dir}/../../docs/superpowers/specs/${today}-<slug>-design.md\` where \`<slug>\` is the slug from the picker. The path traverses up from work_dir (\`internal/self-improve/\`) to the repo root, then into \`docs/superpowers/specs/\`. (That directory is gitignored - the spec is local scaffolding, not committed.)
5. The spec must include the line \`SIZE: trivial\` (or \`small\` / \`substantial\`) on its first line - downstream agents read this to scale their own output.
6. Lead your final response with: \`SPEC WRITTEN: <absolute path>\` then a one-line summary.

Do not write outside docs/superpowers/specs/. Do not run bash. Do not edit existing source files.`,
});
