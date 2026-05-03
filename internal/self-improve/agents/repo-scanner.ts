import { defineAgent } from "@generata/core";

export default defineAgent({
  type: "worker",
  description:
    "Scans the generata repo for candidate improvements across five lenses; emits a JSON-encoded findings array.",
  modelTier: "heavy",
  permissions: "read-only",
  tools: [],
  timeoutSeconds: 600,
  promptContext: [{ filepath: "../../README.md" }],
  outputs: {
    findings_json:
      'JSON-encoded array of findings, e.g. \'[{"lens":"...","title":"...","description":"...","evidence_paths":["path:line"],"suggested_change_kind":"refactor"}]\'. Each finding object has: lens (one of: quality, dx-api, docs, consistency, feature), title (max 60 chars, kebab-case-friendly), description (1-2 sentences), evidence_paths (array of 1-3 strings; each "path", "path:line", or "path:line-line"), suggested_change_kind (one of: refactor, doc-update, bug-fix, new-feature, rename, test-add).',
  },
  promptTemplate: () => `
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
1. README.md is in your context above. Consult it for the public contract before scanning.
2. Use \`glob\` and \`read\` to walk in-scope files. Be thorough but not exhaustive - 15-25 high-quality findings is better than 60 weak ones.
3. For each candidate improvement, capture: lens, title, description, evidence_paths, suggested_change_kind (see the findings_json output description for shape and allowed values).

You are read-only. Do not edit files. Do not run bash. Use only read/glob/grep tools.`,
});
