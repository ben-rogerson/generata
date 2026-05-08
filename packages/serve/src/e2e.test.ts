import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverHandlers } from "./discovery.js";
import { createBearerAuth } from "./auth.js";
import { createRunStore } from "./run-store.js";
import { createServer } from "./server.js";

const here = resolve(fileURLToPath(import.meta.url), "..");
const fixtures = resolve(here, "../test/fixtures/e2e-serve-dir");

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "generata-e2e-"));
}

test("e2e: sync handler returns 200 with JSON", async () => {
  const dir = tmp();
  try {
    const routes = await discoverHandlers(fixtures);
    const auth = createBearerAuth({ token: "secret" });
    const runStore = await createRunStore({ dir });
    const server = createServer({ routes, auth, runStore, bodyLimitBytes: 1024 * 1024 });
    const httpServer = await server.listen(0, "127.0.0.1");
    const addr = httpServer.address();
    if (typeof addr !== "object" || !addr) throw new Error("no address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const r = await fetch(`${base}/echo`, {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: JSON.stringify({ msg: "hi" }),
      });
      assert.equal(r.status, 200);
      const body = (await r.json()) as { echo: { msg: string } };
      assert.deepEqual(body, { echo: { msg: "hi" } });
    } finally {
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("e2e: async handler returns 202 + Location, run state observable via /runs/:id", async () => {
  const dir = tmp();
  try {
    const routes = await discoverHandlers(fixtures);
    const auth = createBearerAuth({ token: "secret" });
    const runStore = await createRunStore({ dir });
    const server = createServer({ routes, auth, runStore, bodyLimitBytes: 1024 * 1024 });
    const httpServer = await server.listen(0, "127.0.0.1");
    const addr = httpServer.address();
    if (typeof addr !== "object" || !addr) throw new Error("no address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const post = await fetch(`${base}/kick`, {
        method: "POST",
        headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(post.status, 202);
      const { runId } = (await post.json()) as { runId: string };
      assert.match(runId, /^[0-9a-f-]{36}$/);

      let state: { status: string } | undefined;
      for (let i = 0; i < 50; i++) {
        const get = await fetch(`${base}/runs/${runId}`, {
          headers: { Authorization: "Bearer secret" },
        });
        assert.equal(get.status, 200);
        state = (await get.json()) as { status: string };
        if (state.status !== "pending") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(state && state.status !== "pending", "run did not settle within 2.5s");
    } finally {
      await server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("e2e: run state survives server restart", async () => {
  const dir = tmp();
  try {
    const auth = createBearerAuth({ token: "secret" });

    // Server #1: create a run, complete it, close.
    {
      const routes = await discoverHandlers(fixtures);
      const runStore = await createRunStore({ dir });
      await runStore.create("persisted-1");
      await runStore.complete("persisted-1", { ok: true });
      const server = createServer({ routes, auth, runStore, bodyLimitBytes: 1024 * 1024 });
      const httpServer = await server.listen(0, "127.0.0.1");
      await server.close();
      void httpServer;
    }

    // Server #2: fresh process state, same dir, run-id should still be readable.
    {
      const routes = await discoverHandlers(fixtures);
      const runStore = await createRunStore({ dir });
      const server = createServer({ routes, auth, runStore, bodyLimitBytes: 1024 * 1024 });
      const httpServer = await server.listen(0, "127.0.0.1");
      const addr = httpServer.address();
      if (typeof addr !== "object" || !addr) throw new Error("no address");
      const base = `http://127.0.0.1:${addr.port}`;
      try {
        const get = await fetch(`${base}/runs/persisted-1`, {
          headers: { Authorization: "Bearer secret" },
        });
        assert.equal(get.status, 200);
        const state = (await get.json()) as { status: string; result: { ok: boolean } };
        assert.equal(state.status, "completed");
        assert.deepEqual(state.result, { ok: true });
      } finally {
        await server.close();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
