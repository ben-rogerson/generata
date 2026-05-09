import { test } from "node:test";
import assert from "node:assert/strict";
import type { Handler, RunState } from "./handler.ts";

test("Handler is a function shape that accepts HandlerContext and returns a Promise", () => {
  // Type-level shape verification: this assignment compiles only if Handler matches HandlerContext.
  const h: Handler = async () => ({ ok: true });
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
