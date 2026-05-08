# @generata/serve

HTTP server for Generata workflow handlers. Auto-discovers user-authored handler scripts under `serve/`, mounts each at `POST /<route>`, and runs them in-process with Bearer auth, async run lifecycle (202 + status URL), and disk-persisted run state.

## Install

```bash
pnpm add @generata/serve
```

## Quickstart

1. Drop a handler script under `serve/` in your project:

```ts
// serve/review.ts
import type { Handler } from "@generata/serve";
import { reviewWorkflow } from "../workflows/review.ts";

const handler: Handler = async ({ body, runAsync }) => {
  return runAsync(reviewWorkflow, { pr: String(body.pr_number) });
};

export default handler;
```

2. Set the auth token and start the server:

```bash
export GENERATA_SERVE_TOKEN=$(openssl rand -hex 32)
pnpm generata-serve --port 3000
```

3. Fire a request:

```bash
curl -X POST http://127.0.0.1:3000/review \
  -H "Authorization: Bearer $GENERATA_SERVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pr_number": 123}'
# → 202 with { "runId": "..." } and Location: /runs/<id>

curl http://127.0.0.1:3000/runs/<id> \
  -H "Authorization: Bearer $GENERATA_SERVE_TOKEN"
# → { "runId": "...", "status": "pending"|"completed"|"failed", ... }
```

## Handler shapes

Sync (200 response, blocks until done):

```ts
import type { Handler } from "@generata/serve";

const handler: Handler = async ({ body, runWorkflow }) => {
  const result = await runWorkflow(myWorkflow, { input: String(body.input) });
  return { ok: true, summary: result.steps.summary?.output };
};
export default handler;
```

Async (202 response, run continues in background):

```ts
import type { Handler } from "@generata/serve";

const handler: Handler = async ({ body, runAsync }) => {
  return runAsync(myWorkflow, { input: String(body.input) });
};
export default handler;
```

`runAsync` takes `(workflow, args, options?)` matching `runWorkflow`'s 3-arg signature.

## CLI

```
generata-serve [options]

  --port <number>          Listen port (default 3000)
  --host <string>          Listen host (default 127.0.0.1)
  --serve-dir <path>       Override serveDir from config
  --token-env <name>       Env var name for the auth token (default GENERATA_SERVE_TOKEN)
  --shutdown-timeout <s>   Drain timeout on SIGTERM (default 30)
  --help                   Show help
```

## Config

Serve options live outside `defineConfig` (which belongs to `@generata/core` and does not accept a `serve` key). Configure via CLI flags or by passing a `ServeConfig`-shaped object directly if you invoke `createServer` programmatically:

```ts
import { resolveServeConfig, createServer } from "@generata/serve";

const cfg = resolveServeConfig({
  serveDir: "serve",
  port: 3000,
  host: "127.0.0.1",
  tokenEnv: "GENERATA_SERVE_TOKEN",
  bodyLimitBytes: 1024 * 1024,
  shutdownTimeoutSec: 30,
  runStoreDir: ".generata/runs",
});
```

CLI flags override config; config overrides built-in defaults.

## Webhook signature verification

Built-in HMAC verification (GitHub, Slack, Stripe, etc.) is intentionally out of scope for v1. Two recommended patterns:

**Reverse-proxy** (Caddy example for GitHub):

```caddy
example.com {
  reverse_proxy /webhook 127.0.0.1:3000 {
    header_up Authorization "Bearer {env.GENERATA_SERVE_TOKEN}"
  }
}
```

(Pair with a Caddy plugin or sidecar that verifies `X-Hub-Signature-256` before forwarding.)

**In-handler** verification: do it inside the handler itself by reading the relevant header from `body` (after JSON-parsing) plus a known secret. Note that `body` is parsed from the request - if you need byte-level signature verification you'll want a reverse proxy in front.

## Limitations

- v1 is single-process and in-memory + disk-persisted. No multi-tenant isolation, no rate limiting.
- Handlers run in the daemon's Node process; one bad handler can affect concurrent requests in the same process.
- Token rotation requires daemon restart.
- Run state is never auto-evicted (infinite TTL by design - delete files under `.generata/runs/` to reclaim disk).
