import { test } from "node:test";
import assert from "node:assert/strict";
import { runAsync, isRunAsyncSentinel } from "./run-async.js";
import type { WorkflowDef } from "@generata/core";

const fakeWorkflow = { kind: "workflow", name: "fake" } as unknown as WorkflowDef;
const fakeArgs: Record<string, string> = {};
const fakeOpts = {};

test("runAsync returns a sentinel carrying workflow, args and options", () => {
  const s = runAsync(fakeWorkflow, fakeArgs, fakeOpts);
  assert.equal(s.workflow, fakeWorkflow);
  assert.equal(s.args, fakeArgs);
  assert.equal(s.options, fakeOpts);
});

test("runAsync defaults options to undefined when omitted", () => {
  const s = runAsync(fakeWorkflow, fakeArgs);
  assert.equal(s.options, undefined);
});

test("isRunAsyncSentinel recognises sentinels by brand", () => {
  const s = runAsync(fakeWorkflow, fakeArgs);
  assert.equal(isRunAsyncSentinel(s), true);
  assert.equal(isRunAsyncSentinel({}), false);
  assert.equal(isRunAsyncSentinel(null), false);
  assert.equal(isRunAsyncSentinel(undefined), false);
  assert.equal(isRunAsyncSentinel("string"), false);
});
