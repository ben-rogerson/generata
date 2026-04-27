import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Reads IMPROVEMENTS.md and selects the highest-score unfinished item; emits structured fields for the improve pipeline.",
  modelTier: "light",
  permissions: "read-only",
  tools: ["read"],
  timeoutSeconds: 120,
  promptContext: [{ filepath: "IMPROVEMENTS.md" }],
  promptTemplate: () => `
IMPROVEMENTS.md is in your context. Each entry header has the form:
\`### <slug> [<lens> · score <N>]\`

Procedure:
1. Enumerate every entry. For each, parse: slug, lens, score (integer), description (the prose under the heading), evidence_paths (parsed from the \`**Evidence:**\` line, comma-separated), suggested_change (the \`**Suggested change:**\` line text).
2. Pick the entry with the HIGHEST score. Ties broken by appearing earlier in the file (older items first when scores tie).
3. If no entries exist (file is empty below the header), print \`NO_ITEMS\` on a single line and stop. The workflow will halt.
4. Otherwise, print a single fenced JSON block:
   \`\`\`json
   { "slug": "...", "title": "<slug rendered as title-case-with-spaces>", "lens": "...", "score": N, "description": "...", "evidence_paths": [...], "suggested_change": "..." }
   \`\`\`

You are read-only. Do not edit files.`,
});
