// packages/core/src/run.ts
import type { AgentDef, GlobalConfig, WorkflowDef, WorktreeConfig } from "./schema.js";
import type {
  StepResult as InternalStepResult,
  WorkflowResult as InternalWorkflowResult,
  EngineDeps,
} from "./engine.js";
import { executeWorkflow } from "./engine.js";
import { runAgent as internalRunAgent, type RunResult, type RunOptions } from "./agent-runner.js";
import { type EngineEvent, type EventSink, noopSink } from "./event-sink.js";
import { findProjectRoot } from "./find-project-root.js";
import { loadConfig } from "./config.js";

export type WorkflowResult = InternalWorkflowResult;

export type { InternalStepResult as StepResult };

export interface AgentResult {
  output: string;
  metrics: RunResult["metrics"];
  outputs?: Record<string, string>;
  halt?: { reason: string };
}

export interface RunWorkflowOptions {
  config?: GlobalConfig;
  cwd?: string;
  isolation?: "inherit" | "none" | WorktreeConfig;
  onEvent?: (event: EngineEvent) => void;
  promptLogFile?: string;
  signal?: AbortSignal;
  // Internal: tests inject stubs. Not part of the documented surface.
  deps?: Pick<EngineDeps, "runAgent" | "setupWorktree" | "mainProjectRoot">;
}

export type RunAgentOptions = Omit<RunWorkflowOptions, "isolation">;

async function resolveConfigAndCwd(opts: {
  config?: GlobalConfig;
  cwd?: string;
}): Promise<{ config: GlobalConfig; cwd: string }> {
  if (opts.config) {
    return { config: opts.config, cwd: opts.cwd ?? opts.config.workDir ?? process.cwd() };
  }
  // Best-effort discovery. If no project root, fall back to process.cwd() and
  // a minimal default config so scripts outside a generata project still work.
  try {
    const root = findProjectRoot(opts.cwd ?? process.cwd());
    const config = await loadConfig(root);
    return { config, cwd: opts.cwd ?? config.workDir };
  } catch {
    const cwd = opts.cwd ?? process.cwd();
    // Fallback for callers running outside a generata project. Keep these defaults
    // aligned with GlobalConfig's schema when fields are added/changed.
    const fallback: GlobalConfig = {
      modelTiers: {
        heavy: "claude-opus-4-7",
        standard: "claude-sonnet-4-6",
        light: "claude-haiku-4-5-20251001",
      },
      workDir: cwd,
      agentsDir: "agents",
      metricsDir: ".generata/metrics",
      logsDir: ".generata/logs",
      notifications: false,
      logPrompts: false,
      showPricing: false,
      showWeeklyMetrics: false,
      verboseOutput: false,
      maxCriticRetries: 3,
    };
    return { config: fallback, cwd };
  }
}

export async function runWorkflow(
  workflow: WorkflowDef,
  args: Record<string, string>,
  options: RunWorkflowOptions = {},
): Promise<WorkflowResult> {
  const { config, cwd } = await resolveConfigAndCwd(options);
  const sink: EventSink = options.onEvent ?? noopSink;

  // Map "inherit"/"none"/WorktreeConfig to engine's EngineDeps.isolationOverride
  // shape (which now accepts the same union after Task 5 step 2).
  let isolationOverride: EngineDeps["isolationOverride"];
  if (options.isolation === undefined || options.isolation === "inherit") {
    isolationOverride = undefined;
  } else if (options.isolation === "none") {
    isolationOverride = "none";
  } else {
    isolationOverride = options.isolation;
  }

  const result = await executeWorkflow(
    workflow,
    args,
    config,
    cwd,
    options.promptLogFile,
    {
      ...options.deps,
      sink,
      signal: options.signal,
      isolationOverride,
    },
  );

  return result;
}

export async function runAgent(
  agent: AgentDef,
  args: Record<string, string>,
  options: RunAgentOptions = {},
): Promise<AgentResult> {
  const { config, cwd } = await resolveConfigAndCwd(options);
  const sink: EventSink = options.onEvent ?? noopSink;

  const opts: RunOptions = {
    agent,
    args,
    config,
    workDir: cwd,
    cwd,
    onEvent: options.onEvent
      ? (event) => sink({ type: "agent-stream", stepId: null, event })
      : undefined,
    promptLogFile: options.promptLogFile,
    sink,
    signal: options.signal,
  };
  const r = await internalRunAgent(opts);
  return {
    output: r.output,
    metrics: r.metrics,
    outputs: r.outputs,
    halt: r.halt,
  };
}
