---
"@generata/core": minor
---

Add shorthand for running workflows: `generata <name>` is now equivalent to `generata workflow <name>`. The first positional argument is treated as a workflow name unless it matches a reserved subcommand (`init`, `add`, `agent`, `workflow`, `run`, `validate`, `metrics`, `skills`, `help`). The longer form keeps working unchanged.
