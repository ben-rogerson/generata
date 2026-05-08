import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStore } from "./run-store.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "generata-runstore-"));
}

test("create() persists a pending run readable via get()", async () => {
  const dir = tmp();
  try {
    const store = await createRunStore({ dir });
    const state = await store.create("abc");
    assert.equal(state.status, "pending");
    assert.equal(state.runId, "abc");
    const read = await store.get("abc");
    assert.deepEqual(read, state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("complete() and fail() transition state and write atomically", async () => {
  const dir = tmp();
  try {
    const store = await createRunStore({ dir });
    await store.create("ok-1");
    const completed = await store.complete("ok-1", { hello: "world" });
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.result, { hello: "world" });

    await store.create("fail-1");
    const failed = await store.fail("fail-1", { code: "workflow-error", message: "boom" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.error.message, "boom");

    const files = readdirSync(dir);
    assert.ok(files.includes("ok-1.json"));
    assert.ok(files.includes("fail-1.json"));
    assert.ok(!files.some((f) => f.endsWith(".tmp")), "no leftover tmp files");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cold-start rehydrates from disk and demotes pending to failed/orphaned", async () => {
  const dir = tmp();
  try {
    writeFileSync(
      join(dir, "stale.json"),
      JSON.stringify({ runId: "stale", status: "pending", startedAt: "2026-05-09T00:00:00Z" }),
    );
    writeFileSync(
      join(dir, "done.json"),
      JSON.stringify({
        runId: "done",
        status: "completed",
        startedAt: "2026-05-09T00:00:00Z",
        finishedAt: "2026-05-09T00:00:01Z",
        result: { ok: true },
      }),
    );

    const store = await createRunStore({ dir });
    const stale = await store.get("stale");
    assert.equal(stale?.status, "failed");
    if (stale?.status === "failed") {
      assert.equal(stale.error.code, "orphaned");
    }
    const done = await store.get("done");
    assert.equal(done?.status, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt JSON files are skipped with a warning, not a crash", async () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, "bad.json"), "{not-json");
    writeFileSync(
      join(dir, "good.json"),
      JSON.stringify({ runId: "good", status: "pending", startedAt: "2026-05-09T00:00:00Z" }),
    );
    const warnings: string[] = [];
    const store = await createRunStore({ dir, logger: { warn: (m: unknown) => warnings.push(String(m)) } });
    assert.ok(warnings.some((w) => w.includes("bad.json")));
    const good = await store.get("good");
    assert.equal(good?.status, "failed"); // demoted from pending → orphaned
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("get() returns undefined for unknown runId", async () => {
  const dir = tmp();
  try {
    const store = await createRunStore({ dir });
    assert.equal(await store.get("nope"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
