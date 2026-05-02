import { defineAgent } from "@generata/core";

export default defineAgent<{ picker_output: string }>(({ picker_output, today, work_dir }) => ({
  type: "worker",
  description:
    "Writes a spec for the picked improvement, sized to the change (trivial / small / substantial).",
  modelTier: "standard",
  permissions: "full",
  tools: ["write"],
  timeoutSeconds: 300,
  promptTemplate: `
You receive the picked item from the picker step:

PICKER OUTPUT:
${picker_output}

If PICKER OUTPUT contains the literal string \`NO_ITEMS\`, print \`NO_ITEMS\` on a single line and stop. Do not write a spec. Do not call any tool. The workflow will halt.

Otherwise:

Sizing rule (decide which applies, then write to that size):
- TRIVIAL (typo, one-line fix, doc tweak): spec is 1-3 sentences total, no headings.
- SMALL (single-file change, no new public API): spec is one short section, ~150 words.
- SUBSTANTIAL (multi-file, new exports, behavioural change): full multi-section spec with Goal, Non-goals, Approach, Open questions.

When in doubt between two sizes, pick the SMALLER. The plan-creator can escalate if needed; downsizing later wastes spec output.

Procedure:
1. Locate the fenced JSON block in PICKER OUTPUT and parse it. Read slug, description, evidence_paths, suggested_change. If you cannot parse a JSON block AND PICKER OUTPUT does not contain \`NO_ITEMS\`, print exactly \`PICKER PARSE ERROR: <one-line reason>\` and stop. Do not write a spec.
2. Read the evidence files (using read/grep tools) to ground the spec in current code. Skim around the cited line ranges to confirm the issue is real.
3. Decide trivial / small / substantial based on the suggested_change scope and what you read.
4. Write the spec to: \`${work_dir}/../../docs/superpowers/specs/${today}-<slug>-design.md\` where \`<slug>\` is the slug from the picker. The path traverses up from work_dir (\`internal/self-improve/\`) to the repo root, then into \`docs/superpowers/specs/\`. (That directory is gitignored - the spec is local scaffolding, not committed.)
5. The first line of the spec file must be exactly \`SIZE: trivial\`, \`SIZE: small\`, or \`SIZE: substantial\` - no markdown formatting, no heading prefix, no surrounding whitespace, no \`SIZE:\` inside a code fence. Second line is blank, then the spec body begins. Downstream agents grep for this exact format.
6. Lead your final response with: \`SPEC WRITTEN: <absolute path>\` then a one-line summary.

Constraints: the only file you may create is the spec at the path in step 4. If the spec would benefit from a companion file (fixture, snippet, etc.), describe it inline in the spec instead of creating it. Do not write outside docs/superpowers/specs/. Do not run bash. Do not edit existing source files.`,
}));
