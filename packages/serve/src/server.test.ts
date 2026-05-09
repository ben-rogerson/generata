import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBearerAuth } from "./auth.js";
import { createRunStore } from "./run-store.js";
import { createServer } from "./server.js";
import { runAsync } from "./run-async.js";
import type { Handler } from "./handler.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "generata-server-"));
}

async function withServer(
  routes: Map<string, Handler>,
  fn: (baseUrl: string) => Promise<void>,
  bodyLimitBytes = 1024 * 1024,
) {
  const dir = tmp();
  try {
    const auth = createBearerAuth({ token: "secret" });
    const runStore = await createRunStore({ dir });
    const server = createServer({ routes, auth, runStore, bodyLimitBytes });
    const httpServer = await server.listen(0, "127.0.0.1");
    const addr = httpServer.address();
    if (typeof addr !== "object" || !addr) throw new Error("no address");
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    try {
      await fn(baseUrl);
    } finally {
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("returns 401 with WWW-Authenticate when token is missing or wrong", async () => {
  const routes = new Map<string, Handler>([["x", async () => ({ ok: true })]]);
  await withServer(routes, async (base) => {
    const r1 = await fetch(`${base}/x`, { method: "POST" });
    assert.equal(r1.status, 401);
    assert.equal(r1.headers.get("WWW-Authenticate"), 'Bearer realm="generata"');
    const r2 = await fetch(`${base}/x`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(r2.status, 401);
    assert.equal(r2.headers.get("WWW-Authenticate"), 'Bearer realm="generata"');
  });
});

test("returns 404 for unknown routes", async () => {
  const routes = new Map<string, Handler>();
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/missing`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 404);
  });
});

test("returns 200 with JSON for sync handlers", async () => {
  const routes = new Map<string, Handler>([["echo", async ({ body }) => ({ got: body })]]);
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ hi: 1 }),
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { got: { hi: number } };
    assert.deepEqual(body, { got: { hi: 1 } });
  });
});

test("returns 202 + Location for runAsync handlers", async () => {
  const routes = new Map<string, Handler>([
    [
      "kick",
      async () => runAsync({ kind: "workflow", name: "fake" } as never, {} as never, {} as never),
    ],
  ]);
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/kick`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 202);
    const body = (await r.json()) as { runId: string };
    assert.match(body.runId, /^[0-9a-f-]{36}$/);
    const location = r.headers.get("Location");
    assert.equal(location, `/runs/${body.runId}`);
  });
});

test("returns 400 on malformed JSON body", async () => {
  const routes = new Map<string, Handler>([["x", async () => ({ ok: true })]]);
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/x`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(r.status, 400);
  });
});

test("returns 500 with no stack trace when handler throws", async () => {
  const routes = new Map<string, Handler>([
    [
      "boom",
      async () => {
        throw new Error("internal-detail");
      },
    ],
  ]);
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/boom`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 500);
    const text = await r.text();
    assert.ok(!text.includes("internal-detail"), "stack/error message must not leak");
    const body = JSON.parse(text) as { error: string; runId: string };
    assert.equal(body.error, "handler-error");
    assert.match(body.runId, /^[0-9a-f-]{36}$/);
  });
});

test("GET /runs/:id returns the run state", async () => {
  const routes = new Map<string, Handler>([
    [
      "kick",
      async () => runAsync({ kind: "workflow", name: "fake" } as never, {} as never, {} as never),
    ],
  ]);
  await withServer(routes, async (base) => {
    const post = await fetch(`${base}/kick`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: "{}",
    });
    const { runId } = (await post.json()) as { runId: string };
    const get = await fetch(`${base}/runs/${runId}`, {
      headers: { Authorization: "Bearer secret" },
    });
    assert.equal(get.status, 200);
    const state = (await get.json()) as { runId: string; status: string };
    assert.equal(state.runId, runId);
    assert.ok(["pending", "completed", "failed"].includes(state.status));
  });
});

test("GET /healthz works without auth", async () => {
  const routes = new Map<string, Handler>();
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/healthz`);
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

test("GET /runs/:id returns 404 for unknown runId", async () => {
  const routes = new Map<string, Handler>();
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/runs/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: "Bearer secret" },
    });
    assert.equal(r.status, 404);
    const body = (await r.json()) as { error: string };
    assert.equal(body.error, "not-found");
  });
});

test("returns 500 with precheck-failed and issues when handler throws GenerataPrecheckError", async () => {
  const { GenerataPrecheckError } = await import("@generata/core");
  const issues = [
    { kind: "missing-arg", agent: "fake", message: "missing required arg X" },
  ] as never;

  const routes = new Map<string, Handler>([
    [
      "preflight",
      async () => {
        throw new GenerataPrecheckError("fake-workflow", issues);
      },
    ],
  ]);
  await withServer(routes, async (base) => {
    const r = await fetch(`${base}/preflight`, {
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 500);
    const body = (await r.json()) as { error: string; issues: unknown };
    assert.equal(body.error, "precheck-failed");
    assert.deepEqual(body.issues, issues);
  });
});

test("returns 413 on oversized body", async () => {
  const routes = new Map<string, Handler>([["x", async () => ({ ok: true })]]);
  await withServer(
    routes,
    async (base) => {
      const big = "x".repeat(200);
      const r = await fetch(`${base}/x`, {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ pad: big }),
      });
      assert.equal(r.status, 413);
    },
    64,
  );
});
