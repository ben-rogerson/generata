import { test } from "node:test";
import assert from "node:assert/strict";
import { runAsync, isRunAsyncSentinel } from "./run-async.js";
import type { WorkflowDef, RunWorkflowOptions } from "@generata/core";

const fakeWorkflow = { kind: "workflow", name: "fake" } as unknown as WorkflowDef;
const fakeOpts = { inputs: {} } as unknown as RunWorkflowOptions;

test("runAsync returns a sentinel carrying workflow and options", () => {
  const s = runAsync(fakeWorkflow, fakeOpts);
  assert.equal(s.workflow, fakeWorkflow);
  assert.equal(s.options, fakeOpts);
});

test("isRunAsyncSentinel recognises sentinels by brand", () => {
  const s = runAsync(fakeWorkflow, fakeOpts);
  assert.equal(isRunAsyncSentinel(s), true);
  assert.equal(isRunAsyncSentinel({}), false);
  assert.equal(isRunAsyncSentinel(null), false);
  assert.equal(isRunAsyncSentinel(undefined), false);
  assert.equal(isRunAsyncSentinel("string"), false);
});
