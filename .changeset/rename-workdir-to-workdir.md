---
"@generata/core": patch
---

Rename the `workdir` field in `generata.config.ts` to `workDir` to match the camelCase convention of the other directory fields (`agentsDir`, `workflowsDir`, `metricsDir`, `logsDir`). The internal `work_dir` Jinja template builtin is unchanged.

**Breaking:** existing config files must rename `workdir:` to `workDir:`. The init scaffolder now generates the new spelling.
