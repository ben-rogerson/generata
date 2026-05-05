import { existsSync } from "fs";
import { resolve } from "path";
import { BUILTIN_ARGS, LLMAgentDef, WorkflowDef } from "./schema.js";
import { extractPromptParams } from "./context-builder.js";
import { EnvProfileError, resolveEnvProfile } from "./env-profile.js";
import { isLoopStep, resolveStepShape } from "./step-shape.js";

export interface PrecheckIssue {
  stepId?: string;
  agentName?: string;
  message: string;
}

export interface PrecheckOptions {
  /** Enable disk existence check on fully-resolved context file paths. */
  checkFiles?: boolean;
  /** Required with checkFiles to resolve paths against the project workDir. */
  workDir?: string;
  /** Active env profile (from `--profile`). Extracted from params before the precheck runs. */
  profile?: string;
}

const INTERPOLATION = /\{\{(\w+)\}\}/g;
const PROJECT_PARAMS: ReadonlySet<string> = new Set(["project", "plan_name"]);

function extractInterpolations(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(INTERPOLATION)) names.push(match[1]);
  return names;
}

function introspectFn<T>(fn: (arg: never) => T): {
  reads: string[];
  result: T | undefined;
} {
  const reads = new Set<string>();
  const proxy = new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key === "string") reads.add(key);
        return "";
      },
      has() {
        return true;
      },
    },
  );
  let result: T | undefined;
  try {
    result = fn(proxy as never);
  } catch {
    result = undefined;
  }
  return { reads: [...reads], result };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = Array.from({ length: n + 1 }, () => 0);
  let curr: number[] = Array.from({ length: n + 1 }, () => 0);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function suggest(name: string, available: Iterable<string>): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const candidate of available) {
    const d = levenshtein(name, candidate);
    if (d > 0 && d <= 2 && (!best || d < best.d)) best = { name: candidate, d };
  }
  return best?.name;
}

function missingMessage(name: string, available: ReadonlySet<string>): string {
  const s = suggest(name, available);
  return s ? `'${name}' not supplied - did you mean '${s}'?` : `'${name}' not supplied`;
}

/**
 * Runs every static check on a workflow before any step fires. Returns the
 * full list of issues - empty means clean. Folds structural, variable-wiring,
 * context-path, and env-key checks into a single pass so the caller prints
 * one report.
 */
export function precheckWorkflow(
  workflow: WorkflowDef,
  params: Record<string, unknown>,
  options: PrecheckOptions = {},
): PrecheckIssue[] {
  const issues: PrecheckIssue[] = [];
  const stepIds = new Set(workflow.steps.map((s) => s.id));

  // No constraint on the first step's agent type: a worker can legitimately open a workflow
  // (e.g. jira-ticket-reader, slack-thread-reader) when plan_name is supplied via derive()
  // or required params rather than the initiator planner's params-emission mechanism.
  // Any downstream step that relies on an unsupplied plan_name will still be caught by the
  // variable-wiring check below.

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (isLoopStep(step)) {
      // Loop-specific structural checks (each shape, as: requirements,
      // concurrency) ran at workflow build time. Validate dependsOn
      // references here for symmetry with the regular branch.
      for (const dep of step.dependsOn ?? []) {
        if (!stepIds.has(dep)) {
          issues.push({ stepId: step.id, message: `dependsOn references unknown step '${dep}'` });
        }
      }
      continue;
    }
    const { agent } = resolveStepShape(step);

    if (agent.type === "planner" && agent.interactive && i !== 0) {
      issues.push({
        stepId: step.id,
        agentName: agent.name,
        message: `interactive planner '${agent.name}' can only be the first step in a workflow`,
      });
    }

    if (agent.type === "critic") {
      if (step.dependsOn !== undefined && step.dependsOn.length !== 1) {
        issues.push({
          stepId: step.id,
          agentName: agent.name,
          message: `critic must depend on exactly one step - retry on rejection targets a single upstream step`,
        });
      }
      const dep = step.dependsOn === undefined ? workflow.steps[i - 1]?.id : step.dependsOn[0];
      const depStep = dep ? workflow.steps.find((s) => s.id === dep) : undefined;
      // A critic depending on a loop step is non-retryable - loop iterations
      // can't be safely re-run as a single upstream invocation.
      const depAgent =
        depStep && !isLoopStep(depStep) ? resolveStepShape(depStep).agent : undefined;
      const retryable =
        depAgent?.type === "worker" || (depAgent?.type === "planner" && !depAgent.interactive);
      if (!retryable) {
        issues.push({
          stepId: step.id,
          agentName: agent.name,
          message: `critic must depend on a worker or non-interactive planner - interactive planners can't be safely re-run on rejection`,
        });
      }
    }

    for (const dep of step.dependsOn ?? []) {
      if (!stepIds.has(dep)) {
        issues.push({
          stepId: step.id,
          message: `dependsOn references unknown step '${dep}'`,
        });
      }
    }
  }

  for (const p of workflow.required.filter((p) => !(p in params))) {
    issues.push({
      message: `workflow requires param '${p}' - provide via --${p}`,
    });
  }

  // --- Variable wiring (symbolic walk) ---

  const deriveIntrospection = workflow.derive ? introspectFn(workflow.derive) : undefined;
  const derivedKeys =
    deriveIntrospection?.result && typeof deriveIntrospection.result === "object"
      ? Object.keys(deriveIntrospection.result)
      : [];

  const base = new Set<string>();
  for (const b of BUILTIN_ARGS) base.add(b);
  for (const p of workflow.required) base.add(p);
  for (const k of Object.keys(workflow.variables ?? {})) base.add(k);
  for (const k of derivedKeys) base.add(k);
  for (const k of Object.keys(params)) base.add(k);

  // Initiator planner (step 0) emits plan_name and instructions at runtime via the
  // params shell bin (see generata/bin/params + RunResult.params in agent-runner.ts).
  // `derive` runs per-step, so it sees these from step 1 onward - add them to the base
  // so derive reads of plan_name/instructions don't trip the precheck.
  if (
    !isLoopStep(workflow.steps[0]) &&
    resolveStepShape(workflow.steps[0]).agent.type === "planner"
  ) {
    base.add("plan_name");
    base.add("instructions");
  }

  if (workflow.derive && deriveIntrospection) {
    const derivedSet = new Set(derivedKeys);
    for (const r of deriveIntrospection.reads) {
      if (derivedSet.has(r)) continue;
      if (!base.has(r)) {
        issues.push({
          message: `workflow.derive reads '${r}' - not in variables, required params, or builtins`,
        });
      }
    }
  }

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];

    // Available set = base + every prior step id + every prior step's declared
    // outputs keys (the engine merges those into the params bag at runtime).
    // For prior loop steps, expose `<id>_manifest` instead - that's the only
    // output a loop step contributes to the params bag.
    const available = new Set(base);
    for (let j = 0; j < i; j++) {
      const prior = workflow.steps[j];
      available.add(prior.id);
      if (isLoopStep(prior)) {
        available.add(`${prior.id}_manifest`);
        continue;
      }
      const priorAgent = resolveStepShape(prior).agent;
      if (priorAgent.outputs) for (const k of Object.keys(priorAgent.outputs)) available.add(k);
    }

    // Loop steps have no readable prompt/args at this layer - the sub-workflow
    // is prechecked when each iteration fires (each iteration is its own
    // runWorkflow call which runs its own precheck).
    if (isLoopStep(step)) continue;

    const { agent, args } = resolveStepShape(step);

    // For stepFn-form steps, also introspect the stepFn body for unavailable reads
    // (matches the old behaviour of flagging args fns that read missing keys).
    if ("stepFn" in step) {
      const { reads } = introspectFn(step.stepFn);
      for (const r of reads) {
        if (!available.has(r)) {
          issues.push({
            stepId: step.id,
            agentName: agent.name,
            message: `step fn reads ${missingMessage(r, available)}`,
          });
        }
      }
    }

    const argKeys = new Set<string>();

    const checkString = (value: string, label: string) => {
      for (const ref of extractInterpolations(value)) {
        if (!available.has(ref)) {
          issues.push({
            stepId: step.id,
            agentName: agent.name,
            message: `${label} ${missingMessage(ref, available)}`,
          });
        }
      }
    };

    if (typeof args === "function") {
      const { reads, result } = introspectFn(args);
      for (const r of reads) {
        if (!available.has(r)) {
          issues.push({
            stepId: step.id,
            agentName: agent.name,
            message: `step args fn reads ${missingMessage(r, available)}`,
          });
        }
      }
      if (result && typeof result === "object") {
        for (const [k, v] of Object.entries(result)) {
          argKeys.add(k);
          if (typeof v === "string") checkString(v, `step arg '${k}'`);
        }
      }
    } else if (args) {
      for (const [k, v] of Object.entries(args)) {
        argKeys.add(k);
        if (typeof v === "string") checkString(v, `step arg '${k}'`);
      }
    }

    if ("prompt" in agent) {
      const effective = new Set(available);
      for (const k of argKeys) effective.add(k);

      for (const r of extractPromptParams(agent.prompt)) {
        if (!effective.has(r)) {
          issues.push({
            stepId: step.id,
            agentName: agent.name,
            message: `prompt template reads ${missingMessage(r, effective)}`,
          });
        }
      }

      for (let ci = 0; ci < agent.promptContext.length; ci++) {
        const ctx = agent.promptContext[ci];
        let refs: string[] = [];
        let resolved: string | undefined;
        if (typeof ctx.filepath === "function") {
          const out = introspectFn(ctx.filepath);
          refs = out.reads;
          if (typeof out.result === "string") resolved = out.result;
        } else {
          resolved = ctx.filepath;
        }
        for (const r of refs) {
          if (!effective.has(r)) {
            issues.push({
              stepId: step.id,
              agentName: agent.name,
              message: `promptContext[${ci}].filepath ${missingMessage(r, effective)}`,
            });
          }
        }
        if (
          options.checkFiles &&
          options.workDir &&
          resolved &&
          !ctx.optional &&
          refs.every((r) => effective.has(r))
        ) {
          const full = resolve(options.workDir, resolved);
          if (!existsSync(full)) {
            issues.push({
              stepId: step.id,
              agentName: agent.name,
              message: `promptContext[${ci}].filepath '${resolved}' not found on disk`,
            });
          }
        }
      }
    }
  }

  // --- Env keys (one entry per unique agent) ---

  const envByAgent = new Map<string, Set<string>>();
  for (const step of workflow.steps) {
    if (isLoopStep(step)) continue;
    const { agent } = resolveStepShape(step);
    const keys = agent.envKeys ?? [];
    if (keys.length === 0) continue;
    const bucket = envByAgent.get(agent.name) ?? new Set<string>();
    for (const k of keys) bucket.add(k);
    envByAgent.set(agent.name, bucket);
  }
  for (const [agentName, keys] of envByAgent) {
    try {
      resolveEnvProfile([...keys], options.profile);
    } catch (err) {
      if (err instanceof EnvProfileError) {
        issues.push({ agentName, message: err.message });
      } else {
        throw err;
      }
    }
  }

  return issues;
}

export function formatPrecheckReport(workflowName: string, issues: PrecheckIssue[]): string {
  const lines: string[] = [`[precheck] ${workflowName}`];
  for (const issue of issues) {
    const prefix = issue.stepId
      ? `step '${issue.stepId}'${issue.agentName ? ` (${issue.agentName})` : ""}: `
      : issue.agentName
        ? `agent '${issue.agentName}': `
        : "";
    lines.push(`\u2717 ${prefix}${issue.message}`);
  }
  lines.push("");
  lines.push(`${issues.length} problem${issues.length === 1 ? "" : "s"}. No steps ran.`);
  return lines.join("\n");
}

export interface ValidateAgentArgsOptions {
  checkProjectExists?: boolean;
  workDir?: string;
}

/**
 * Per-agent arg check used by the standalone `agent` CLI path, where a full workflow
 * precheck doesn't apply. Returns human-readable error strings (empty = valid).
 */
export function validateAgentArgs(
  agent: LLMAgentDef,
  args: Record<string, unknown>,
  options: ValidateAgentArgsOptions = {},
): string[] {
  const errors: string[] = [];
  const required = extractPromptParams(agent.prompt);
  for (const p of required.filter((p) => !args[p])) {
    errors.push(`requires --${p}`);
  }
  if (
    options.checkProjectExists &&
    options.workDir &&
    !(agent.type === "planner" && agent.interactive)
  ) {
    for (const param of required.filter((p) => PROJECT_PARAMS.has(p))) {
      const val = String(args[param] ?? "");
      if (val && !existsSync(resolve(options.workDir, "projects", val))) {
        errors.push(`project '${val}' not found in projects/`);
      }
    }
  }
  return errors;
}
