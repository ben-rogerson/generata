---
"@generata/core": patch
---

Render engine bin invocations (emit, verdict, params) in plain English in verbose stream output instead of raw `Bash: /abs/path/bin/... --flag "..."` lines. Now shows e.g. `Halted with reason: "..."`, `Verdict: approve`, `Outputs emitted: spec_filepath="..."`, so it's clearer what the agent actually did.
