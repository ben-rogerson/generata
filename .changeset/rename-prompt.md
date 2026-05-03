---
"@generata/core": minor
---

Rename agent `promptTemplate` field to `prompt`. The shorter name reads naturally and matches the field's role - it's the prompt string the LLM sees, not a "template" in any generative sense (the factory's closure handles interpolation). Breaking for any code that references `agent.promptTemplate` or sets it on a `defineAgent` literal; pre-1.0, no published consumers, so a minor bump.
