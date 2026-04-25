---
"@generata/core": minor
---

Added two new catalog templates alongside `@generata/coding`:

- **`@generata/starter`** - bare-minimum scaffold (one worker agent, one workflow). Designed to be edited or thrown away as users build their own pipeline. Good for learning the model without inheriting a use case.
- **`@generata/standup`** - daily standup generator. Reads yesterday's git activity and drafts a 3-section update (yesterday / today / blockers). Two agents demonstrating two-step composition.

Both appear in `generata help templates` and `generata init` (no args) listings.
