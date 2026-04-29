import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Scores audit findings (impact x effort), drops out-of-scope and already-tracked ones, outputs a ranked JSON list.",
  modelTier: "standard",
  permissions: "read-only",
  tools: [],
  timeoutSeconds: 300,
  promptContext: [{ filepath: "IMPROVEMENTS.md", optional: true }],
  promptTemplate: ({ scanner_output }) => `
You receive the raw stdout of the previous \`repo-scanner\` step in the variable below. It is expected to contain a single fenced JSON block of shape \`{ "findings": [...] }\`, but may include surrounding prose - tolerate that.

If a current IMPROVEMENTS.md backlog is provided in your context above, treat every entry already in that file as already-tracked: future audit runs must not re-surface the same finding under a new title. If no backlog context is provided (first run on a fresh checkout), there are no already-tracked entries and step 5 below is a no-op.

SCANNER OUTPUT:
${scanner_output}

Procedure:
1. Locate the fenced JSON block (\`\`\`json ... \`\`\`) inside SCANNER OUTPUT and parse it. If no fenced block is present, attempt to parse the largest \`{...}\` substring. If parsing still fails, print a single line starting with \`ERROR:\` describing what was wrong and stop. Do not emit a JSON block.
2. For each finding, assign:
   - impact (1-5): 5 = significantly improves DX/correctness for many users, 1 = marginal nicety
   - effort (1-5): 5 = multi-day refactor with risk, 1 = one-line fix
   Then compute base_score = impact * (6 - effort). Range: 5..25 (max when impact=5 and effort=1).
3. Apply lens weighting: multiply base_score by 1.2 if lens is "dx-api" or "consistency"; otherwise 1.0. Round to the nearest integer to produce the final \`score\`. This is the only score downstream sees; do not emit \`base_score\`.
4. Drop any finding whose evidence_paths reference an out-of-scope location. Compare on the path component before any \`:line\` suffix:
   - .changeset/, CHANGELOG.md, package.json (any version field)
   - .github/workflows/
   - internal/self-improve/
5. Drop any finding that is already tracked in IMPROVEMENTS.md. Treat a finding as already-tracked if any of these hold against any existing entry in the backlog:
   a. Slug match: derive a slug from the finding's title (lowercase; runs of non-alphanumeric chars become single dashes; strip leading/trailing dashes) and compare against the existing entry's slug.
   b. Evidence overlap: any of the finding's evidence_paths (compare on the path component before any \`:line\` suffix) appears in the existing entry's Evidence line.
   c. Subject overlap: the finding describes the same underlying issue as an existing entry - same file region, same symptom, even if the title or framing differs. Be moderately strict here: if a careful reader would say "this is the same bug we already logged," drop it.
6. Dedup near-duplicates within the remaining findings: if two share a lens AND any evidence path (compare on the path component before any \`:line\` suffix), keep the higher-scored one.
7. Sort descending by \`score\`. Tie-breakers in order: lower \`effort\` first; then lens priority (\`dx-api\` > \`consistency\` > \`quality\` > \`docs\` > \`feature\`); then original order in the scanner output. The output must be deterministic across re-runs given identical input.
8. Print the result as a single fenced JSON block with shape:
   \`\`\`json
   { "ranked": [ { "lens": "...", "title": "...", "description": "...", "evidence_paths": [...], "suggested_change_kind": "...", "impact": N, "effort": N, "score": N, "reasoning": "one line" } ] }
   \`\`\`
   Nothing outside the fenced block. Preserve all original fields (lens, title, description, evidence_paths, suggested_change_kind) verbatim from the scanner finding; add only impact, effort, score, and reasoning.

If every finding is dropped (out-of-scope or already-tracked), emit \`{ "ranked": [] }\` inside the fenced block. The downstream merge step is a no-op in that case.

You are read-only. Do not edit files.`,
});
