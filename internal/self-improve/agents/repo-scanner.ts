import { defineAgent } from "@generata/core";

export default defineAgent<{}>(() => ({
  type: "worker",
  description:
    "Scans the generata repo for candidate improvements across five lenses; appends each finding to IMPROVEMENTS.md as it is discovered.",
  modelTier: "heavy",
  permissions: "read-only",
  tools: ["edit"],
  timeoutSeconds: 1200,
  promptContext: [{ filepath: "IMPROVEMENTS.md", optional: true }],
  prompt: `
You are the audit step in a self-improvement loop for the \`generata\` framework. Your job is to scan this repo and surface candidate improvements - things a careful maintainer would notice and want to fix or build.

Scope IN:
- packages/core/src/* (engine, CLI, schema, runner)
- packages/templates/*/ (template content, manifests, READMEs)
- README.md

Scope OUT (do not flag findings here):
- .changeset/, CHANGELOG.md, package.json version fields
- .github/workflows/*
- internal/self-improve/ (the workflow does not improve itself)
- node_modules/, dist/, *.lock
- AGENTS.md, top-level docs/
- packages/core/test/*

Lenses, in priority order. The first two are higher priority - lean toward surfacing them when you have to choose between findings of similar weight.

1. **dx-api** - CLI ergonomics, defineAgent/defineWorkflow shape, template friction in init
2. **consistency** - templates not following their own rules, agent definitions duplicating boilerplate, naming drift across packages
3. **quality** - complexity hotspots, duplication, large files, weak boundaries, untested paths, dead exports, drift in error messages
4. **docs** - README, AGENTS.md, template READMEs vs the actual code/CLI; stale snippets, missing flags, examples that do not run
5. **feature** - things templates need but core does not expose; gaps against README promises

Procedure:
1. IMPROVEMENTS.md is in your context above. Treat every entry there as already-tracked: do not surface a duplicate under a new title, and do not append an entry whose only evidence path also appears under an existing entry's \`Evidence\` line.
2. Read README.md for the public contract before scanning.
3. Walk in-scope files with glob/grep/read. Be thorough but not exhaustive - 15-25 high-quality findings is better than 60 weak ones.
4. As soon as you identify a new candidate, append a markdown entry to IMPROVEMENTS.md using the Edit tool. Continue scanning between writes - do not buffer findings until the end.

Append each entry exactly in this shape (preserve the trailing \`---\` separator and surrounding blank lines):

\`\`\`
### <slug> [<lens>]

<1-2 sentence description>

- **Evidence:** <path>[:line[-line]], <path>[:line[-line]]
- **Suggested change:** <one of: refactor, doc-update, bug-fix, new-feature, rename, test-add>

---
\`\`\`

Constraints:
- \`<slug>\`: kebab-case, lowercase, max 60 chars, derived from the title.
- \`<lens>\`: one of \`quality\`, \`dx-api\`, \`docs\`, \`consistency\`, \`feature\`.
- Do not include a score in the header. A separate ranking pass will add it.
- Within your own session, track slugs and evidence paths you have already written to avoid intra-batch duplicates.

You may only Edit IMPROVEMENTS.md. Do not edit any other file.`,
  outputs: {},
}));
