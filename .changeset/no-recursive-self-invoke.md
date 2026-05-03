---
"@generata/core": patch
---

Prevent sub-agents from recursively invoking their own workflow. Generated slash commands matching an agent's task description (via `generata skills sync`) combined with global "always invoke skills" directives caused agents to launch the workflow they were already inside. The role prefix now forbids skill/sub-agent invocation, and the engine throws on `metrics.status="failure"` so missing-outputs surface clearly instead of crashing downstream steps.
