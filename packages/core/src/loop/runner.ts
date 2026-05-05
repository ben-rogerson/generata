import type {
  BuiltinPromptArgs,
  GlobalConfig,
  WorkflowDef,
  LLMAgentDef,
  EachSource,
} from "../schema.js";
import type { WorkflowResult } from "../engine.js";
import { materialiseSource } from "./sources.js";
import { bindItems } from "./binding.js";
import {
  loopManifestPath,
  writeManifest,
  type LoopManifest,
  type LoopManifestItem,
} from "./manifest.js";

export interface LoopStep {
  id: string;
  subWorkflow: WorkflowDef;
  each: EachSource;
  as: string | undefined;
  concurrency: number;
  onFailure: "halt" | "continue";
  onItemFail?: LLMAgentDef | ((inputs: Record<string, string> & { error: string }) => unknown);
  maxRetries?: number;
}

export interface LoopStepInput {
  outerWorkflowName: string;
  outerRunId: string;
  step: LoopStep;
  outerParams: Record<string, unknown>;
  builtins: BuiltinPromptArgs;
  config: GlobalConfig;
  workDir: string;
}

export interface LoopRunnerDeps {
  runWorkflow: (
    workflow: WorkflowDef,
    params: Record<string, unknown>,
    config: GlobalConfig,
    workDir: string,
  ) => Promise<WorkflowResult>;
}

function sourceKind(source: EachSource): "glob" | "json" | "items" {
  if ("glob" in source) return "glob";
  if ("json" in source) return "json";
  return "items";
}

function sourceSpec(source: EachSource): string {
  if ("glob" in source) return source.glob;
  if ("json" in source) return source.json;
  return "<function>";
}

export async function runLoopStep(
  input: LoopStepInput,
  deps: LoopRunnerDeps,
): Promise<{ manifest_path: string }> {
  const { step, outerParams, builtins, config, workDir, outerWorkflowName, outerRunId } = input;
  const startedAt = new Date().toISOString();

  const items = await materialiseSource(step.each, builtins);

  const required = step.subWorkflow.required ?? [];
  const binding = bindItems(items, { as: step.as, required });
  if (binding.errors.length > 0) {
    throw new Error(`Loop step '${step.id}': ${binding.errors.join("; ")}`);
  }

  const total = binding.vars.length;
  const manifestItems: LoopManifestItem[] = Array.from({ length: total });
  let halted = false;
  let haltError: Error | undefined;

  // Worker pool: pull from a shared index counter; each worker awaits one
  // sub-run at a time. Source order is preserved in the manifest via the
  // index field, regardless of completion order.
  let next = 0;
  const launchOne = async (): Promise<void> => {
    while (true) {
      if (halted) return;
      const i = next++;
      if (i >= total) return;
      const vars = binding.vars[i];
      const subRunId = `${outerRunId}-${step.id}-${i}`;
      let attempts = 0;
      const maxAttempts = (step.maxRetries ?? 0) + 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempts++;
        try {
          const result = await deps.runWorkflow(
            step.subWorkflow,
            { ...outerParams, ...vars },
            config,
            workDir,
          );
          const outputs: Record<string, string> = {};
          for (const s of result.steps) outputs[s.stepId] = s.output;
          manifestItems[i] = {
            index: i,
            vars,
            status: "ok",
            runId: subRunId,
            outputs,
          };
          break;
        } catch (err) {
          if (attempts < maxAttempts) continue;
          const msg = err instanceof Error ? err.message : String(err);
          manifestItems[i] = {
            index: i,
            vars,
            status: "failed",
            runId: subRunId,
            error: msg,
            attempts,
          };
          if (step.onItemFail) {
            if (typeof step.onItemFail === "function") {
              const fn = step.onItemFail;
              try {
                await fn({ ...vars, error: msg });
              } catch (handlerErr) {
                console.warn(
                  `Loop step '${step.id}': onItemFail handler threw: ${handlerErr instanceof Error ? handlerErr.message : String(handlerErr)}`,
                );
              }
            } else {
              throw new Error(
                `Loop step '${step.id}': onItemFail bare-agent form is not yet supported by the runner - wrap in a step fn`,
              );
            }
          }
          if (step.onFailure === "halt") {
            halted = true;
            if (!haltError) haltError = err as Error;
          }
          break;
        }
      }
    }
  };

  const concurrency = Math.min(step.concurrency, Math.max(total, 1));
  const workers = Array.from({ length: concurrency }, () => launchOne());
  await Promise.all(workers);

  const finishedAt = new Date().toISOString();
  // Compact the array: slots remain `undefined` if halt fired before they ran.
  const items_out = manifestItems.filter((m) => m !== undefined);
  const manifest: LoopManifest = {
    workflow: outerWorkflowName,
    step: step.id,
    subWorkflow: step.subWorkflow.name,
    runId: outerRunId,
    startedAt,
    finishedAt,
    source: { kind: sourceKind(step.each), spec: sourceSpec(step.each), count: total },
    concurrency,
    onFailure: step.onFailure,
    items: items_out,
  };
  const path = loopManifestPath(workDir, outerWorkflowName, step.id, outerRunId);
  writeManifest(path, manifest);

  if (haltError) throw haltError;
  return { manifest_path: path };
}
