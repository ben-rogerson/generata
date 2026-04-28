import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Scores audit findings (impact x effort), drops out-of-scope ones, outputs a ranked JSON list.",
  modelTier: "standard",
  permissions: "read-only",
  tools: ["read"],
  timeoutSeconds: 300,
  promptTemplate: ({ scanner_output }) => `
You receive the raw stdout of the previous \`repo-scanner\` step in the variable below. It is expected to contain a single fenced JSON block of shape \`{ "findings": [...] }\`, but may include surrounding prose - tolerate that.

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
5. Dedup near-duplicates: if two findings share a lens AND any evidence path (compare on the path component before any \`:line\` suffix), keep the higher-scored one.
6. Sort descending by \`score\`. Tie-breakers in order: lower \`effort\` first; then lens priority (\`dx-api\` > \`consistency\` > \`quality\` > \`docs\` > \`feature\`); then original order in the scanner output. The output must be deterministic across re-runs given identical input.
7. Print the result as a single fenced JSON block with shape:
   \`\`\`json
   { "ranked": [ { "lens": "...", "title": "...", "description": "...", "evidence_paths": [...], "suggested_change_kind": "...", "impact": N, "effort": N, "score": N, "reasoning": "one line" } ] }
   \`\`\`
   Nothing outside the fenced block. Preserve all original fields (lens, title, description, evidence_paths, suggested_change_kind) verbatim from the scanner finding; add only impact, effort, score, and reasoning.

You are read-only. Do not edit files.`,
});
