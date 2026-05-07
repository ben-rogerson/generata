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
import { buildPromptLogPath } from "./cli/prompt-log-path.js";
import { makeRunId } from "./time.js";
import { callerName } from "./caller-name.js";
import { basename, dirname, join } from "node:path";

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
      logPrompts: true,
      showPricing: false,
      showWeeklyMetrics: false,
      verboseOutput: false,
      maxCriticRetries: 3,
    };
    return { config: fallback, cwd };
  }
}

// Mirrors the CLI's logPrompts flow (cli.ts:130-134, 184-191) so programmatic
// runs land prompt logs in the same place as `generata <name>`. The path is
// surfaced as a clickable `file://` line on stderr regardless of whether the
// caller wired onEvent - this is the single source for the link, so consoleSink
// no longer prints it from workflow-start / agent-welcome.
function resolvePromptLogFile(
  config: GlobalConfig,
  kind: "agent" | "workflow",
  name: string,
  override: string | undefined,
): string | undefined {
  let path: string | undefined;
  if (override !== undefined) {
    path = override;
  } else if (config.logPrompts) {
    const built = buildPromptLogPath(config.workDir, config.logsDir, kind, name, makeRunId());
    // buildPromptLogPath collapses `name` to its basename for the filename stem,
    // so the caller-script prefix has to be applied here rather than threaded
    // through `name`. Empty fallback signals "no caller could be resolved" (e.g.
    // CLI flow, where every frame above is framework-internal); skip the prefix.
    const caller = callerName("");
    path = caller ? join(dirname(built), `${caller}-${basename(built)}`) : built;
  }
  if (path) process.stderr.write(`Full log: file://${path}\n\n`);
  return path;
}

// Header for silent-mode programmatic runs: tells the user which workflow/agent
// is running. Suppressed when the caller wires onEvent, since they're driving
// display themselves (e.g. CLI's consoleSink emits the rich workflow-start /
// agent-welcome lines).
function printRunHeader(kind: "workflow", def: WorkflowDef): void;
function printRunHeader(kind: "agent", def: AgentDef): void;
function printRunHeader(kind: "workflow" | "agent", def: WorkflowDef | AgentDef): void {
  if (kind === "workflow") {
    const wf = def as WorkflowDef;
    const n = wf.steps.length;
    process.stderr.write(`workflow: ${wf.name} (${n} step${n === 1 ? "" : "s"})\n`);
  } else {
    const a = def as AgentDef;
    process.stderr.write(`agent: ${a.name} [${a.type}]\n`);
  }
}

export async function runWorkflow(
  workflow: WorkflowDef,
  args: Record<string, string>,
  options: RunWorkflowOptions = {},
): Promise<WorkflowResult> {
  const { config, cwd } = await resolveConfigAndCwd(options);
  const sink: EventSink = options.onEvent ?? noopSink;
  if (options.onEvent === undefined) printRunHeader("workflow", workflow);
  const promptLogFile = resolvePromptLogFile(
    config,
    "workflow",
    workflow.name,
    options.promptLogFile,
  );

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

  const result = await executeWorkflow(workflow, args, config, cwd, promptLogFile, {
    ...options.deps,
    sink,
    signal: options.signal,
    isolationOverride,
  });

  return result;
}

export async function runAgent(
  agent: AgentDef,
  args: Record<string, string>,
  options: RunAgentOptions = {},
): Promise<AgentResult> {
  const { config, cwd } = await resolveConfigAndCwd(options);
  const sink: EventSink = options.onEvent ?? noopSink;
  if (options.onEvent === undefined) printRunHeader("agent", agent);
  const promptLogFile = resolvePromptLogFile(config, "agent", agent.name, options.promptLogFile);

  const opts: RunOptions = {
    agent,
    args,
    config,
    workDir: cwd,
    cwd,
    onEvent: options.onEvent
      ? (event) => sink({ type: "agent-stream", stepId: null, event })
      : undefined,
    promptLogFile,
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
