---
"@generata/core": patch
---

Place `outputs` at the bottom of agent definitions, after `promptTemplate`. Convention only - no behavioural change. The prompt is what the author writes; the outputs are the contract for the next step. Reading top-to-bottom: type/description/model/tools/timeout, then prompt, then "and here is what flows out".
