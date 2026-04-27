---
"@generata/core": minor
---

Add `showPricing` config option (default `false`). When off, runtime logs and notifications hide USD costs and show token counts instead. The `generata metrics` subcommand still surfaces cost as before. Set `showPricing: true` in `defineConfig` to restore the previous behaviour.
