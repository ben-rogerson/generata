---
"@generata/core": minor
---

Add `runScript`, a driver-script harness for the programmatic API. It wraps a script's main function with the canonical lifecycle contract: first SIGINT aborts the provided `signal` (second SIGINT hard-kills), an escaping `AbortError` prints `<script> cancelled` and exits 130, and any other error prints `<script> failed: <message>` and exits 1. The script name is derived from the calling file's basename, matching the prompt-log prefix convention.
