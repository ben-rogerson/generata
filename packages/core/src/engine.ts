import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "fs";
import { dirname } from "path";
import { resolve } from "path";
import {
  WorkflowDef,
  WorkflowStep,
  CriticWorkflowStep,
  GlobalConfig,
  AgentMetrics,
  LLMAgentDef,
  StepParams,
} from "./schema.js";
import { runAgent, RunResult } from "./agent-runner.js";
import { buildRetryPreamble } from "./context-builder.js";
import { getTodayAndTime } from "./time.js";
import {
  logWorkflowStart,
  logStepStart,
  logStepDone,
  logStepRetry,
  logStreamEvent,
} from "./logger.js";
import { formatPrecheckReport, precheckWorkflow } from "./precheck.js";
import { resolveEnvProfile, EnvProfileError, type ResolvedEnv } from "./env-profile.js";

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
  args: Record<string, unknown> | ((params: StepParams) => Record<string, unknown>),
  params: Record<string, unknown>,
  stepOutputs: Record<string, string>,
): Record<string, unknown> {
  const stringParams: StepParams = Object.fromEntries(
    Object.entries({ ...params, ...stepOutputs }).map(([k, v]) => [k, String(v)]),
  );
  if (typeof args === "function") return { ...stringParams, ...args(stringParams) };
  return { ...stringParams, ...args };
}

export async function runWorkflow(
  workflow: WorkflowDef,
  params: Record<string, unknown>,
  config: GlobalConfig,
  workDir: string,
  promptLogFile?: string,
): Promise<WorkflowResult> {
  const workflowId = `${workflow.name}-${Date.now()}`;
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
  const requiredEnvKeys = [...new Set(workflow.steps.flatMap((s) => s.agent.envKeys ?? []))];
  let resolvedEnv: ResolvedEnv = {};
  try {
    resolvedEnv = resolveEnvProfile(requiredEnvKeys, profile);
  } catch (err) {
    if (err instanceof EnvProfileError) {
      console.error(`[workflow] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  // Inject today builtin so function args (e.g. daily-plan) can use today.
  // Local-TZ date to match the prompt-context date seen by agents.
  const _now = new Date();
  const _today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  params = { today: _today, ...params };

  // plan_name is deferred - the planner emits it at runtime
  let planName = "";

  // Purge stale verdict and params files from previous crashed runs
  try {
    const verdictPrefix = `verdict-${workflow.name}-`;
    const paramsPrefix = `params-${workflow.name}-`;
    const stale = readdirSync("/tmp").filter(
      (f: string) =>
        (f.startsWith(verdictPrefix) || f.startsWith(paramsPrefix)) && f.endsWith(".json"),
    );
    for (const f of stale) {
      try {
        unlinkSync(`/tmp/${f}`);
      } catch {}
    }
  } catch {}

  logWorkflowStart(workflow.name, workflow.steps.length);

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

        const stepIndex = workflow.steps.findIndex((s) => s.id === step.id) + 1;

        const resolvedArgs = resolveArgs(step.args, params, stepOutputs);

        // Compute workflow variables (static vars + derive) for this step.
        // Builtins and resolved step args are merged as input to derive().
        const { today: _stepToday, time: _stepTime } = getTodayAndTime();
        const workflowVariables = computeWorkflowVariables(workflow, {
          work_dir: resolve(workDir),
          today: _stepToday,
          time: _stepTime,
          ...Object.fromEntries(Object.entries(resolvedArgs).map(([k, v]) => [k, String(v)])),
        });

        logStepStart(stepIndex, totalSteps, step.id);

        // Helper: run an agent step with error-retry, log metrics, update stepOutputs.
        // Used for both the initial run and critic-triggered retries.
        const runAgentStep = async (
          targetStep: WorkflowStep,
          targetArgs: Record<string, unknown>,
          retryPreamble?: string,
        ): Promise<RunResult> => {
          const targetAgent = targetStep.agent as LLMAgentDef;
          let r: RunResult | undefined;
          let attempt = 0;
          while (true) {
            try {
              r = await runAgent({
                agent: targetAgent,
                args: targetArgs,
                config,
                workDir,
                workflowId,
                stepId: targetStep.id,
                stepOutputs,
                onEvent: (event) => logStreamEvent(event),
                promptLogFile,
                retryPreamble,
                workflowVariables,
                resolvedEnv,
              });
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

        let result = await runAgentStep(step, resolvedArgs);

        stepOutputs[step.id] = result.output;
        stepResults.push({
          stepId: step.id,
          output: result.output,
          metrics: result.metrics,
        });

        if (planName) {
          // Move plan into project folder once the executor has created the code dir.
          // Fires once: when code/ exists but the plan hasn't been moved yet.
          const projectDir = resolve(workDir, workflow.variables.output_dir ?? "", planName);
          const plansDir = workflow.variables.plans_dir ?? "plans";
          const planSrc = resolve(workDir, plansDir, `${planName}.md`);
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
        if (step.agent.type === "critic") {
          if (!result.verdict) {
            haltSignal = `Step '${step.id}' (${step.agent.name}): critic produced no verdict`;
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
                const execArgs = resolveArgs(executorStep.args, params, stepOutputs);
                const execResult = await runAgentStep(executorStep, execArgs, preamble);
                stepOutputs[executorStep.id] = execResult.output;

                const criticArgs = resolveArgs(step.args, params, stepOutputs);
                result = await runAgentStep(step, criticArgs);
                stepOutputs[step.id] = result.output;
              }
            }

            if (result.verdict?.verdict !== "approve") {
              const onRejectAgent = (step as CriticWorkflowStep).onReject;
              if (onRejectAgent) {
                await runAgentStep(
                  {
                    id: `${step.id}-cleanup`,
                    agent: onRejectAgent as any,
                    args: {},
                  } as WorkflowStep,
                  resolveArgs({}, params, stepOutputs),
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
        if (step.agent.type === "planner" && (effectiveDeps.get(step.id)?.length ?? 0) === 0) {
          if (!result.params) {
            haltSignal = "planner produced no params";
          } else {
            params = { ...params, ...result.params };
            planName = result.params.plan_name;
            const projDir = resolve(workDir, workflow.variables.output_dir ?? "", planName);
            mkdirSync(projDir, { recursive: true });
          }
        }

        completed.add(step.id);
      }),
    );
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
