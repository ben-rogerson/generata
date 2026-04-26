---
"@generata/core": minor
---

Workflow runs now print the final agent's text output below the step-done line, mirroring how single-agent runs (`generata agent ...`) display their result. Skips empty output, the interactive-session placeholder, and critic last-steps (whose verdict summary already prints). Applies to both static workflows and supervisor-generated workflows.
