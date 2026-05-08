---
"@generata/serve": minor
---

Initial release. HTTP server for Generata workflow handlers: auto-discovers user-authored scripts under `serve/`, mounts each at `POST /<route>`, runs them in-process with Bearer auth, 202+status-URL async lifecycle via `runAsync`, and disk-persisted run state. v1 targets solo-dev / single-user automation; webhook signature verifiers and SSE deferred to a future release.
