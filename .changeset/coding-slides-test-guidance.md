---
"@generata/core": patch
---

Add test guidance to the `coding` template's markdown-slide-deck starter idea in NOTES.md. The seed now spells out the Ink testing approach (use `ink-testing-library` with `lastFrame()` and `stdin.write` rather than driving the built binary via `expect`/`script`) and requires a sample deck at `examples/intro.md` that doubles as the test fixture and README demo, exercising every splitter rule (`---` separators, top-level `#` headings, fenced code blocks for `cli-highlight`, lists, and inline emphasis).
