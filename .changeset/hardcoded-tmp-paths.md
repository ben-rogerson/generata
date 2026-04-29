---
"@generata/core": patch
---

Replace hardcoded /tmp paths with os.tmpdir() for cross-platform portability. Engine and agent-runner now work on Windows and systems with non-POSIX temp directories.
