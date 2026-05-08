---
"@generata/core": patch
---

Capture kill reason and signal in agent metrics. When a timeout fires the runner records `killReason`, the OS signal, and any abnormal close-delay in `metrics.error`, and sets `status: "timeout"`. Previously a SIGTERM kill left only the benign "no stdin data received in 3s" warning and a generic "failure" status, making it impossible to distinguish timeout from crash.
