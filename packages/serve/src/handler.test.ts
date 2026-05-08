import { test } from "node:test";
import assert from "node:assert/strict";
import type { Handler, HandlerContext, RunState } from "./handler.ts";

test("Handler is callable with HandlerContext and returns Promise<unknown>", () => {
  const h: Handler = async (ctx: HandlerContext) => {
    assert.ok(typeof ctx.runId === "string");
    assert.ok(typeof ctx.body !== "undefined");
    assert.ok(typeof ctx.runWorkflow === "function");
    assert.ok(typeof ctx.runAsync === "function");
    assert.ok(ctx.signal instanceof AbortSignal);
    assert.ok(typeof ctx.logger.info === "function");
    return { ok: true };
  };
  assert.equal(typeof h, "function");
});

test("RunState discriminates on status", () => {
  const pending: RunState = { runId: "a", status: "pending", startedAt: "2026-05-09T00:00:00Z" };
  const completed: RunState = {
    runId: "b",
    status: "completed",
    startedAt: "2026-05-09T00:00:00Z",
    finishedAt: "2026-05-09T00:00:01Z",
    result: { ok: true },
  };
  const failed: RunState = {
    runId: "c",
    status: "failed",
    startedAt: "2026-05-09T00:00:00Z",
    finishedAt: "2026-05-09T00:00:01Z",
    error: { code: "workflow-error", message: "boom" },
  };
  assert.equal(pending.status, "pending");
  assert.equal(completed.status, "completed");
  assert.equal(failed.status, "failed");
});
