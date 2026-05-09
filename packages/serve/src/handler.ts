import type {
  runWorkflow as runWorkflowFn,
  RunWorkflowOptions,
  WorkflowDef,
  EventSink,
} from "@generata/core";

declare const _runAsyncBrand: unique symbol;

export type RunAsyncSentinel = {
  readonly [_runAsyncBrand]: true;
  readonly workflow: WorkflowDef;
  readonly args: Record<string, string>;
  readonly options?: RunWorkflowOptions;
};

export type HandlerLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type HandlerContext = {
  body: unknown;
  runId: string;
  runWorkflow: typeof runWorkflowFn;
  runAsync: (
    workflow: WorkflowDef,
    args: Record<string, string>,
    options?: RunWorkflowOptions,
  ) => RunAsyncSentinel;
  eventSink: EventSink;
  logger: HandlerLogger;
  signal: AbortSignal;
};

export type Handler = (ctx: HandlerContext) => Promise<unknown>;

export type RunState =
  | { runId: string; status: "pending"; startedAt: string }
  | {
      runId: string;
      status: "completed";
      startedAt: string;
      finishedAt: string;
      result: unknown;
    }
  | {
      runId: string;
      status: "failed";
      startedAt: string;
      finishedAt: string;
      error: { code: string; message: string };
    };
