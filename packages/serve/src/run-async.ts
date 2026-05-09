import type { WorkflowDef, RunWorkflowOptions } from "@generata/core";
import type { RunAsyncSentinel } from "./handler.js";

const RUN_ASYNC_BRAND = Symbol.for("@generata/serve/run-async");

type BrandedSentinel = RunAsyncSentinel & { [RUN_ASYNC_BRAND]: true };

export function runAsync(
  workflow: WorkflowDef,
  args: Record<string, string>,
  options?: RunWorkflowOptions,
): RunAsyncSentinel {
  const sentinel = {
    workflow,
    args,
    options,
    [RUN_ASYNC_BRAND]: true,
  } as unknown as BrandedSentinel;
  return Object.freeze(sentinel);
}

export function isRunAsyncSentinel(value: unknown): value is RunAsyncSentinel {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[RUN_ASYNC_BRAND] === true
  );
}
