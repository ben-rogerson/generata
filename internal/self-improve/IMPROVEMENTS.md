# Improvements backlog

Maintained by the `audit` workflow. Items are removed by `improve` when shipped.
Order is roughly chronological (newest at bottom). The picker sorts by score at runtime.

Lenses: `quality` · `dx-api` · `docs` · `consistency` · `feature`

---

### workflow-list-omits-descriptions [dx-api · score 14]

`generata agent --list` prints name, type, and description; `generata workflow --list` prints only the name. Users browsing workflows lack context that `help workflows` provides.

- **Evidence:** packages/core/src/cli.ts
- **Suggested change:** Add description field to `generata workflow --list` output.

---

### with-defaults-and-template-alias-duplicated [consistency · score 14]

withDefaults and the manifestName.replace template alias logic are reproduced verbatim in init.ts and add.ts. Should extract into a shared module to prevent silent drift.

- **Evidence:** packages/core/src/cli/init.ts, packages/core/src/cli/add.ts
- **Suggested change:** Extract withDefaults and templateAlias logic into a shared module.

---

### coding-template-tools-noop-declarations [consistency · score 14]

Six coding-template agents declare permissions: 'full' and narrow tools[] arrays. Since the engine ignores tools[] under full perms, they teach an ineffective pattern to new authors.

- **Evidence:** packages/templates/coding/agents/end-tidier.ts, packages/templates/coding/agents/spec-creator.ts, packages/templates/coding/agents/code-writer.ts
- **Suggested change:** Remove tools[] declarations from full-permission agents in the coding template.

---

### node-protocol-import-drift [consistency · score 12]

Most modules use node:fs/node:path but seven core files still import from bare specifiers (fs, path, child_process). Should pick one style and normalize.

- **Evidence:** packages/core/src/engine.ts, packages/core/src/agent-runner.ts, packages/core/src/context-builder.ts
- **Suggested change:** Normalize bare imports to node: protocol imports across all core modules.

---

### tmp-verdict-purge-races-concurrent-runs [quality · score 12]

Every workflow unconditionally deletes /tmp/verdict-<workflow>-*.json and /tmp/params-<workflow>-*.json on start. Two concurrent runs of the same workflow will silently delete each other's files mid-run.

- **Evidence:** packages/core/src/engine.ts
- **Suggested change:** Scope temp filenames to a per-run ID to make concurrent purges safe.

---

### help-agents-silent-when-empty-help-workflows-errors [quality · score 10]

helpWorkflows prints a red error when no workflows exist; helpAgents in the same file silently prints an empty list for the same situation. Should unify the empty-state UX.

- **Evidence:** packages/core/src/cli/help.ts
- **Suggested change:** Add empty-state error message to helpAgents matching helpWorkflows' pattern.

---

### starter-postinstall-points-at-renamed-readme [docs · score 10]

The starter's postInstall message says 'See README.md' but init renames it to README-starter.md on install, leaving the user with a broken or incorrect pointer.

- **Evidence:** packages/templates/starter/generata.template.json, packages/core/src/cli/init.ts
- **Suggested change:** Update postInstall message to reference README-starter.md instead of README.md.

---

### metrics-cli-branch-duplication [quality · score 8]

The metrics today|week|expensive|agent branches in cli.ts contain ~90 lines of nearly-identical formatting logic. Should extract into a shared renderer.

- **Evidence:** packages/core/src/cli.ts
- **Suggested change:** Extract shared formatting logic from metrics branches into a helper function.

---

### no-middle-permission-tier [feature · score 8]

Permissions only has 'full' (everything), 'read-only' (declared tools only), or 'none'. There's no way to grant write/edit but withhold bash, despite tools[] hinting at restrictions.

- **Evidence:** packages/core/src/schema.ts, packages/core/src/agent-runner.ts
- **Suggested change:** Add 'restricted' permission tier that honors tools[] restrictions between read-only and full.

---
