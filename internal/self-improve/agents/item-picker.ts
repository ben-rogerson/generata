import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Reads IMPROVEMENTS.md and selects the highest-score unfinished item; emits structured fields for the improve pipeline.",
  modelTier: "light",
  permissions: "read-only",
  tools: [],
  timeoutSeconds: 120,
  promptContext: [{ filepath: "IMPROVEMENTS.md" }],
  outputs: {
    slug: "Kebab-case slug from the entry header",
    title: "Slug rendered as title-case-with-spaces",
    lens: "Lens label (quality, dx-api, docs, consistency, feature)",
    score: "Integer score, rendered as a string (e.g. '21')",
    description: "Prose under the heading",
    evidence_paths:
      "Comma-joined list of paths from the **Evidence:** line; no spaces around commas (e.g. 'packages/core/src/cli.ts:120-145,packages/core/src/init.ts:42')",
    suggested_change: "Text from the **Suggested change:** line",
  },
  promptTemplate: () => `
IMPROVEMENTS.md is in your context. Each entry header has the form:
\`### <slug> [<lens> · score <N>]\`

Procedure:
1. Enumerate every entry. For each, parse: slug, lens, score (integer), description (the prose under the heading), evidence_paths (parsed from the \`**Evidence:**\` line, comma-separated), suggested_change (the \`**Suggested change:**\` line text).
2. Pick the entry with the HIGHEST score. Ties broken by appearing earlier in the file (older items first when scores tie).
3. If no entries exist (file is empty below the header), halt the workflow with reason "IMPROVEMENTS.md is empty".

You are read-only. Do not edit files.`,
});
