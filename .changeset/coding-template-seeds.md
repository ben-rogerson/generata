---
"@generata/core": patch
---

Refresh the `coding` template's starter ideas and fix recency-biased idea selection. NOTES.md now ships with three modern, immediately-runnable TypeScript seeds (a terminal weather card via Open-Meteo, a markdown slide deck built on Ink, and a Carbon-style code screenshot generator using shiki + sharp) instead of the previous five utilitarian CLIs. The `build-project` workflow now seeds a random integer into spec-creator, which picks the unbuilt idea at `random_pick mod N` rather than the LLM's subjective notion of "most compelling" - removing the bug where the agent reliably chose the last item in NOTES.md. The post-install message in the manifest is updated to match.
