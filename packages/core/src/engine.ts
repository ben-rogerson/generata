import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import {
  WorkflowDef,
  WorkflowStep,
  CriticWorkflowStep,
  GlobalConfig,
  AgentMetrics,
  LLMAgentDef,
  StepParams,
  WorktreeConfig,
} from "./schema.js";
import { runAgent as defaultRunAgent, RunResult, RunOptions } from "./agent-runner.js";
import { formatWeeklyMetricsLine } from "./metrics.js";
import { setupWorktree as defaultSetupWorktree } from "./worktree.js";
import type { SetupWorktreeOptions, SetupWorktreeResult } from "./worktree.js";

export interface EngineDeps {
  runAgent?: (options: RunOptions) => Promise<RunResult>;
  setupWorktree?: (opts: SetupWorktreeOptions) => Promise<SetupWorktreeResult>;
  // Tests can pre-resolve the git root rather than walking up from workDir.
  // Production CLI leaves this undefined and lets findGitRoot do the walk.
  mainProjectRoot?: string;
  isolationOverride?: "none" | "worktree";
}
import { buildRetryPreamble } from "./context-builder.js";
import { getTodayAndTime } from "./time.js";
import {
  logWorkflowStart,
  logStepStart,
  logStepDone,
  logStepRetry,
  logStreamEvent,
  type WorkflowIsolation,
} from "./logger.js";
import { formatPrecheckReport, precheckWorkflow } from "./precheck.js";
import { resolveEnvProfile, type ResolvedEnv } from "./env-profile.js";
import { isLoopStep, resolveStepShape } from "./step-shape.js";
import { runLoopStep } from "./loop/runner.js";

// Workers signal a structural halt by leading their output with `STATUS: halt`.
// The critic retry loop checks this to short-circuit retries that would re-hit
// the same conflict. Exported so the regex can be regression-tested in isolation.
export function isStructuralHalt(output: string): boolean {
  return /^STATUS:\s*halt\b/im.test(output);
}

function computeWorkflowVariables(
  workflow: WorkflowDef,
  builtinsAndArgs: Record<string, string>,
): Record<string, string> {
  const vars = { ...workflow.variables };
  if (workflow.derive) {
    const deriveInput = { ...builtinsAndArgs, ...vars };
    Object.assign(vars, workflow.derive(deriveInput));
  }
  return vars;
}

export interface StepResult {
  stepId: string;
  output: string;
  metrics: AgentMetrics;
  skipped?: boolean;
}

export interface WorkflowResult {
  workflowName: string;
  steps: StepResult[];
  success: boolean;
  totalCost: number;
  totalTokens: number;
  costWasReported: boolean;
  durationMs: number;
  halted?: boolean;
  haltReason?: string;
}

function resolveArgs(
  args: Record<string, unknown> | ((params: StepParams) => Record<string, unknown>) | undefined,
  params: Record<string, unknown>,
  stepOutputs: Record<string, string>,
): Record<string, unknown> {
  const stringParams: StepParams = Object.fromEntries(
    Object.entries({ ...params, ...stepOutputs }).map(([k, v]) => [k, String(v)]),
  );
  // Always-passthrough: builtins, vars, required, derived. Prior step outputs
  // are NOT auto-leaked — agents only see what an `args` fn explicitly returns.
  const passthrough: Record<string, unknown> = { ...params };
  if (typeof args === "function") return { ...passthrough, ...args(stringParams) };
  return { ...passthrough, ...args };
}

// Resolve a workflow step (agent-form or stepFn-form) to {agent, args} for
// the run loop. For stepFn-form, run the user's function with the current
// {params + stepOutputs} so it can map prior outputs into the agent factory.
function resolveStepForRun(
  step: WorkflowStep,
  params: Record<string, unknown>,
  stepOutputs: Record<string, string>,
): { agent: LLMAgentDef; args: Record<string, unknown> } {
  if (isLoopStep(step)) {
    throw new Error(
      `resolveStepForRun called on loop step '${step.id}' - loop step execution is not yet wired in the engine`,
    );
  }
  if ("stepFn" in step) {
    const stringParams: StepParams = Object.fromEntries(
      Object.entries({ ...params, ...stepOutputs }).map(([k, v]) => [k, String(v)]),
    );
    const inv = step.stepFn(stringParams);
    return { agent: inv.agent as LLMAgentDef, args: { ...params, ...inv.args } };
  }
  return { agent: step.agent as LLMAgentDef, args: resolveArgs(step.args, params, stepOutputs) };
}

function resolveIsolation(
  override: "none" | "worktree" | undefined,
  declared: "none" | WorktreeConfig,
): "none" | WorktreeConfig {
  if (override === "none") return "none";
  if (override === "worktree") {
    return declared === "none" ? WorktreeConfig.parse({}) : declared;
  }
  return declared;
}

function findGitRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(`${current}/.git`)) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `isolation: "worktree" requires a git repository (no .git found above ${start})`,
      );
    }
    current = parent;
  }
}

export async function runWorkflow(
  workflow: WorkflowDef,
  params: Record<string, unknown>,
  config: GlobalConfig,
  workDir: string,
  promptLogFile?: string,
  deps: EngineDeps = {},
): Promise<WorkflowResult> {
  const runAgent = deps.runAgent ?? defaultRunAgent;
  // Workflow names may contain `/` (path-derived from nested agents dirs). Strip
  // it so tmp-file paths built from this id stay flat, not nested subdirs.
  const workflowId = `${workflow.name.replace(/\//g, "-")}-${Date.now()}`;
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  const stepOutputs: Record<string, string> = {};
  const completed = new Set<string>();

  // Extract profile (built-in flag, not a required workflow arg) before precheck so env-key
  // validation can run under the correct profile. Tokens flow through subprocess env only.
  const profile = typeof params.profile === "string" ? params.profile : undefined;
  delete params.profile;

  // One static pass before any step fires - catches variable wiring, structural, context-path,
  // and env-key issues. Any issue aborts the run with zero LLM calls.
  const precheckIssues = precheckWorkflow(workflow, params, { profile, workDir });
  if (precheckIssues.length > 0) {
    console.error(formatPrecheckReport(workflow.name, precheckIssues));
    throw new Error(
      `Precheck failed for workflow '${workflow.name}' - ${precheckIssues.length} problem${precheckIssues.length === 1 ? "" : "s"}`,
    );
  }

  // Precheck confirmed env keys are resolvable; now materialise them.
  const requiredEnvKeys = [
    ...new Set(
      workflow.steps
        .filter((s) => !isLoopStep(s))
        .flatMap((s) => resolveStepShape(s).agent.envKeys ?? []),
    ),
  ];
  const resolvedEnv: ResolvedEnv = resolveEnvProfile(requiredEnvKeys, profile);

  // Inject today builtin so function args (e.g. daily-plan) can use today.
  // Local-TZ date to match the prompt-context date seen by agents.
  const _now = new Date();
  const _today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  params = { today: _today, ...params };

  // plan_name is deferred - the planner emits it at runtime
  let planName = "";

  // Purge stale verdict and params files from previous crashed runs
  try {
    const safeName = workflow.name.replace(/\//g, "-");
    const verdictPrefix = `verdict-${safeName}-`;
    const paramsPrefix = `params-${safeName}-`;
    const stale = readdirSync(tmpdir()).filter(
      (f: string) =>
        (f.startsWith(verdictPrefix) || f.startsWith(paramsPrefix)) && f.endsWith(".json"),
    );
    for (const f of stale) {
      try {
        unlinkSync(join(tmpdir(), f));
      } catch {}
    }
  } catch {}

  const isolationConfig = resolveIsolation(deps.isolationOverride, workflow.isolation ?? "none");
  let executionRoot = resolve(workDir);
  let worktreePath: string | undefined;
  let teardown: (() => Promise<void>) | undefined;
  let sigintHandler: (() => void) | undefined;
  let sigtermHandler: (() => void) | undefined;
  if (isolationConfig !== "none") {
    const mainProjectRoot = deps.mainProjectRoot ?? findGitRoot(workDir);
    const setup = deps.setupWorktree ?? defaultSetupWorktree;
    const setupResult = await setup({
      workflow,
      config: isolationConfig,
      mainProjectRoot,
      workDir,
      runId: workflowId,
      logsDir: config.logsDir,
      metricsDir: config.metricsDir,
    });
    executionRoot = setupResult.executionRoot;
    worktreePath = setupResult.worktreePath;
    if (isolationConfig.cleanup) {
      teardown = setupResult.cleanup;

      sigintHandler = () => {
        void (teardown?.() ?? Promise.resolve()).finally(() => process.kill(process.pid, "SIGINT"));
      };
      sigtermHandler = () => {
        void (teardown?.() ?? Promise.resolve()).finally(() =>
          process.kill(process.pid, "SIGTERM"),
        );
      };
      process.once("SIGINT", sigintHandler);
      process.once("SIGTERM", sigtermHandler);
    }
  }

  const weeklyMetrics = config.showWeeklyMetrics
    ? formatWeeklyMetricsLine(resolve(workDir, config.metricsDir), config.showPricing)
    : undefined;
  const isolationInfo: WorkflowIsolation = worktreePath
    ? { mode: "worktree", path: worktreePath }
    : { mode: "local" };
  logWorkflowStart(
    workflow.name,
    workflow.steps.length,
    promptLogFile,
    weeklyMetrics,
    isolationInfo,
  );

  // Execute DAG
  const pending = new Map(workflow.steps.map((s) => [s.id, s]));
  const totalSteps = workflow.steps.length;
  let haltSignal: string | null = null;

  // Pre-compute effective deps: undefined → sequential default (prev step or none for step 0)
  const effectiveDeps = new Map<string, string[]>();
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    effectiveDeps.set(
      step.id,
      step.dependsOn === undefined ? (i === 0 ? [] : [workflow.steps[i - 1].id]) : step.dependsOn,
    );
  }

  try {
    while (pending.size > 0) {
      if (haltSignal) break;
      // Find steps whose dependencies are all satisfied
      const runnable: WorkflowStep[] = [];
      for (const [, step] of pending) {
        if (effectiveDeps.get(step.id)!.every((dep) => completed.has(dep))) {
          runnable.push(step);
        }
      }

      if (runnable.length === 0) {
        throw new Error(
          `Workflow deadlock in '${workflow.name}' - no runnable steps. Pending: ${[...pending.keys()].join(", ")}`,
        );
      }

      // Run all runnable steps in parallel
      await Promise.all(
        runnable.map(async (step) => {
          pending.delete(step.id);

          if (isLoopStep(step)) {
            const stepIndex = workflow.steps.findIndex((s) => s.id === step.id) + 1;
            logStepStart(stepIndex, totalSteps, step.id);
            const { today: _t, time: _ti } = getTodayAndTime();
            const result = await runLoopStep(
              {
                outerWorkflowName: workflow.name,
                outerRunId: workflowId,
                step: {
                  id: step.id,
                  // schema validates subWorkflow shape via runtime refine, but the
                  // type is `unknown` to avoid a TS circular reference. Cast here.
                  subWorkflow: step.subWorkflow as WorkflowDef,
                  each: step.each,
                  as: step.as,
                  concurrency: step.concurrency ?? 1,
                  onFailure: step.onFailure ?? "halt",
                  onItemFail: step.onItemFail,
                  maxRetries: step.maxRetries,
                },
                outerParams: params,
                builtins: { work_dir: executionRoot, today: _t, time: _ti },
                config,
                workDir,
              },
              { runWorkflow },
            );
            params = { ...params, [`${step.id}_manifest`]: result.manifest_path };
            stepOutputs[step.id] = result.manifest_path;
            stepResults.push({
              stepId: step.id,
              output: result.manifest_path,
              metrics: {
                agent: "<loop>",
                model: "",
                model_tier: "",
                workflow_id: workflow.name,
                step_id: step.id,
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                duration_ms: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                estimated_cost_usd: 0,
                cost_was_reported: false,
                status: "success",
                exit_code: 0,
              },
            });
            completed.add(step.id);
            return;
          }

          const stepIndex = workflow.steps.findIndex((s) => s.id === step.id) + 1;

          const resolved = resolveStepForRun(step, params, stepOutputs);
          const stepAgent = resolved.agent;
          const resolvedArgs = resolved.args;

          // Compute workflow variables (static vars + derive) for this step.
          // Builtins and resolved step args are merged as input to derive().
          const { today: _stepToday, time: _stepTime } = getTodayAndTime();
          const workflowVariables = computeWorkflowVariables(workflow, {
            work_dir: executionRoot,
            today: _stepToday,
            time: _stepTime,
            ...Object.fromEntries(Object.entries(resolvedArgs).map(([k, v]) => [k, String(v)])),
          });

          logStepStart(stepIndex, totalSteps, step.id);

          // Helper: run an agent step with error-retry, log metrics, update stepOutputs.
          // Used for both the initial run and critic-triggered retries.
          const runAgentStep = async (
            targetStep: WorkflowStep,
            targetAgent: LLMAgentDef,
            targetArgs: Record<string, unknown>,
            retryPreamble?: string,
          ): Promise<RunResult> => {
            let r: RunResult | undefined;
            let attempt = 0;
            while (true) {
              try {
                r = await runAgent({
                  agent: targetAgent,
                  args: targetArgs,
                  config,
                  workDir,
                  cwd: executionRoot,
                  workflowId,
                  stepId: targetStep.id,
                  stepOutputs,
                  // verboseOutput=false swaps inline tool events for the per-agent spinner
                  // (agent-runner starts the spinner when onEvent is undefined). Caveat:
                  // parallel runnable steps will fight over the same TTY line - acceptable
                  // for now since most workflows are sequential.
                  onEvent: config.verboseOutput ? (event) => logStreamEvent(event) : undefined,
                  promptLogFile,
                  retryPreamble,
                  workflowVariables,
                  resolvedEnv,
                });
                // runAgent resolves even when the underlying claude call failed
                // or declared outputs were not emitted (status="failure" set in
                // metrics). Surface that as a thrown error so the retry/fail
                // path runs instead of advancing with undefined outputs that
                // crash the next step.
                if (r.metrics.status === "failure") {
                  throw new Error(
                    r.metrics.error || "agent reported failure with no error message",
                  );
                }
                break;
              } catch (err) {
                attempt++;
                if (attempt >= targetAgent.maxRetries) {
                  throw new Error(
                    `Step '${targetStep.id}' failed after ${attempt} attempts: ${String(err)}`,
                  );
                }
                logStepRetry(targetStep.id, attempt);
              }
            }
            // Failures throw above and are reported via the workflow-level
            // error path, so logStepDone is only ever reached for a non-failure
            // status here.
            logStepDone(
              targetStep.id,
              r!.metrics.duration_ms,
              r!.metrics.estimated_cost_usd,
              r!.metrics.model,
              r!.verdict,
              r!.metrics.cost_was_reported,
              r!.metrics.input_tokens + r!.metrics.output_tokens,
              config.showPricing,
            );
            return r!;
          };

          let result = await runAgentStep(step, stepAgent, resolvedArgs);

          stepOutputs[step.id] = result.output;
          stepResults.push({
            stepId: step.id,
            output: result.output,
            metrics: result.metrics,
          });

          // First-class halt: agent emitted `--halt "<reason>"` via the emit bin.
          // Set the workflow halt signal and skip remaining steps cleanly. No
          // metric failure - this is a deliberate, structured stop.
          if (result.halt) {
            haltSignal = `${step.id} halted: ${result.halt.reason}`;
          }

          // Merge typed `outputs` emitted by the agent into the runtime params
          // bag so downstream stepFns and derive can read them as named keys.
          // Last-wins on collisions (mirrors how the planner-emits-params merge
          // works further down).
          if (result.outputs) {
            params = { ...params, ...result.outputs };
          }

          if (planName) {
            // Move plan into project folder once the executor has created the code dir.
            // Fires once: when code/ exists but the plan hasn't been moved yet.
            // Anchored on executionRoot so worktree-isolated workflows see files agents
            // wrote inside the worktree (executionRoot === resolve(workDir) when not isolated).
            const projectDir = resolve(
              executionRoot,
              workflow.variables.output_dir ?? "",
              planName,
            );
            const plansDir = workflow.variables.plans_dir ?? "plans";
            const planSrc = resolve(executionRoot, plansDir, `${planName}.md`);
            const planDst = resolve(projectDir, plansDir, `${planName}.md`);
            if (existsSync(planSrc) && existsSync(resolve(projectDir, "code"))) {
              mkdirSync(dirname(planDst), { recursive: true });
              renameSync(planSrc, planDst);
            }
          }

          // Retry loop: when a critic rejects, re-run the upstream step with an
          // engine-built preamble listing the critic's issues, then re-run the
          // critic. Repeats up to maxRetries (step override) or
          // config.maxCriticRetries (global default). The upstream step must be
          // a worker or non-interactive planner; validate.ts enforces this.
          if (stepAgent.type === "critic") {
            // No-verdict retry loop: when the critic's CLI invocation produces no
            // verdict file (transient hang, empty stream, killed mid-call), re-run
            // just the critic - the worker output is fine. Burns up to maxRetries.
            if (!result.verdict) {
              const maxAttempts =
                "maxRetries" in step
                  ? (step.maxRetries ?? config.maxCriticRetries)
                  : config.maxCriticRetries;
              let retryAttempt = 0;
              while (retryAttempt < maxAttempts && !result.verdict) {
                retryAttempt++;
                logStepRetry(step.id, retryAttempt);
                const reResolved = resolveStepForRun(step, params, stepOutputs);
                result = await runAgentStep(step, reResolved.agent, reResolved.args);
                stepOutputs[step.id] = result.output;
              }
            }
            if (!result.verdict) {
              haltSignal = `Step '${step.id}' (${stepAgent.name}): critic produced no verdict`;
            } else if (result.verdict.verdict !== "approve") {
              const deps = effectiveDeps.get(step.id) ?? [];
              const executorStepId = deps[0];
              const executorStep = executorStepId
                ? workflow.steps.find((s) => s.id === executorStepId)
                : undefined;

              if (executorStep) {
                const maxAttempts =
                  "maxRetries" in step
                    ? (step.maxRetries ?? config.maxCriticRetries)
                    : config.maxCriticRetries;
                let retryAttempt = 0;

                while (retryAttempt < maxAttempts && result.verdict?.verdict !== "approve") {
                  retryAttempt++;
                  logStepRetry(executorStep.id, retryAttempt);

                  const preamble = buildRetryPreamble({
                    summary: result.verdict?.summary ?? "",
                    issues: result.verdict?.issues ?? [],
                  });
                  const execResolved = resolveStepForRun(executorStep, params, stepOutputs);
                  const execResult = await runAgentStep(
                    executorStep,
                    execResolved.agent,
                    execResolved.args,
                    preamble,
                  );
                  stepOutputs[executorStep.id] = execResult.output;

                  const criticResolved = resolveStepForRun(step, params, stepOutputs);
                  result = await runAgentStep(step, criticResolved.agent, criticResolved.args);
                  stepOutputs[step.id] = result.output;

                  // Structural-halt short-circuit: if the worker reports STATUS: halt
                  // the rerun won't make progress (the conflict is in the spec/plan, not
                  // the diff). Stop retrying and let the rejection propagate to haltSignal.
                  if (isStructuralHalt(execResult.output)) break;
                }
              }

              if (result.verdict?.verdict !== "approve") {
                const onRejectAgent = (step as CriticWorkflowStep).onReject;
                if (onRejectAgent) {
                  // Factory-form: call it with all available runtime state to
                  // get a freshly-resolved StepInvocation (closure interpolation
                  // bakes in real values, replacing the sentinel placeholders
                  // attached at definition time).
                  let rejectAgent: LLMAgentDef;
                  let rejectArgs: Record<string, unknown>;
                  if (typeof onRejectAgent === "function") {
                    const merged: Record<string, string> = Object.fromEntries(
                      Object.entries({ ...params, ...stepOutputs }).map(([k, v]) => [k, String(v)]),
                    );
                    const inv = onRejectAgent(merged);
                    rejectAgent = inv.agent as LLMAgentDef;
                    rejectArgs = { ...params, ...inv.args };
                  } else {
                    rejectAgent = onRejectAgent as LLMAgentDef;
                    rejectArgs = resolveArgs({}, params, stepOutputs);
                  }
                  await runAgentStep(
                    {
                      id: `${step.id}-cleanup`,
                      agent: rejectAgent,
                      args: {},
                    } as WorkflowStep,
                    rejectAgent,
                    rejectArgs,
                  );
                }
                haltSignal = result.verdict?.summary
                  ? `${step.id} rejected: ${result.verdict.summary}`
                  : `${step.id} rejected (no summary given)`;
              }
            }
          }

          // Merge planner params into runtime params and create project directory.
          // Only the initiator planner (no effective deps) emits params; non-initiator
          // planners like plan-creator just produce artifacts and don't call the params bin.
          if (stepAgent.type === "planner" && (effectiveDeps.get(step.id)?.length ?? 0) === 0) {
            if (!result.params) {
              haltSignal = "planner produced no params";
            } else {
              params = { ...params, ...result.params };
              planName = result.params.plan_name;
              // Anchored on executionRoot so worktree-isolated workflows create the
              // project dir inside the worktree (executionRoot === resolve(workDir) when not isolated).
              const projDir = resolve(executionRoot, workflow.variables.output_dir ?? "", planName);
              mkdirSync(projDir, { recursive: true });
            }
          }

          completed.add(step.id);
        }),
      );
    }
  } finally {
    if (sigintHandler) process.off("SIGINT", sigintHandler);
    if (sigtermHandler) process.off("SIGTERM", sigtermHandler);
    if (teardown) {
      try {
        await teardown();
        if (worktreePath) console.log(`[worktree] cleaned up ${worktreePath}`);
      } catch (err) {
        // Spec: teardown failure must not change the workflow's exit. The user
        // can recover via `generata worktree prune`.
        console.warn(
          `[worktree] teardown failed (run 'generata worktree prune' to recover): ${String(err)}`,
        );
      }
    } else if (worktreePath) {
      console.log(
        `[worktree] preserved at ${worktreePath} (cleanup: false). Run 'generata worktree prune' to remove.`,
      );
    }
  }

  const totalCost = stepResults.reduce((sum, r) => sum + (r.metrics?.estimated_cost_usd ?? 0), 0);
  const totalTokens = stepResults.reduce(
    (sum, r) => sum + (r.metrics?.input_tokens ?? 0) + (r.metrics?.output_tokens ?? 0),
    0,
  );
  const costWasReported = stepResults.some((r) => r.metrics?.cost_was_reported);
  const durationMs = Date.now() - startTime;
  const success = stepResults.every((r) => r.skipped || r.metrics?.status === "success");

  return {
    workflowName: workflow.name,
    steps: stepResults,
    success: success && !haltSignal,
    halted: haltSignal ? true : undefined,
    haltReason: haltSignal ?? undefined,
    totalCost,
    totalTokens,
    costWasReported,
    durationMs,
  };
}
