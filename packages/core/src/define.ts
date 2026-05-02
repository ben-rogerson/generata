import { z } from "zod";
import {
  AgentDef,
  LLMAgentDef,
  WorkflowDef,
  WorktreeConfig as WorktreeConfigSchema,
  GlobalConfig,
  PromptFn,
  StepParams,
} from "./schema.js";

// Branded so only `worktree()` produces an assignable value. Without this brand,
// users could pass a raw object literal to `isolation`, bypassing the helper.
declare const _worktreeBrand: unique symbol;
export type WorktreeConfig = z.infer<typeof WorktreeConfigSchema> & {
  readonly [_worktreeBrand]: true;
};

// z.custom<PromptFn> breaks contextual typing through discriminated union inference,
// so we override just that field. Everything else derives from the Zod schema.
type AgentInput =
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "critic" }>, "promptTemplate"> & {
      promptTemplate: PromptFn;
    })
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "worker" }>, "promptTemplate"> & {
      promptTemplate: PromptFn;
    })
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "planner" }>, "promptTemplate"> & {
      promptTemplate: PromptFn;
    });

export function defineAgent<T extends AgentInput>(def: T): Extract<AgentDef, { type: T["type"] }> {
  const parsed = AgentDef.parse(def) as Extract<AgentDef, { type: T["type"] }>;
  (parsed as unknown as { kind: "agent" }).kind = "agent";
  return parsed;
}

// z.custom<fn> breaks contextual typing (same issue as promptTemplate above).
// Define WorkflowInput explicitly so workflow files get correct type inference.
type CriticStepInput = {
  id: string;
  agent: Extract<AgentDef, { type: "critic" }>;
  args?: Record<string, unknown> | ((params: StepParams) => Record<string, unknown>);
  dependsOn?: string[];
  maxRetries?: number;
  onReject?: LLMAgentDef;
};

type NonCriticStepInput = {
  id: string;
  agent: Exclude<AgentDef, { type: "critic" }>;
  args?: Record<string, unknown> | ((params: StepParams) => Record<string, unknown>);
  dependsOn?: string[];
  maxRetries?: never;
};

type WorkflowStepInput = CriticStepInput | NonCriticStepInput;

type BuiltinArgs = { work_dir: string; today: string; time: string };

type WorktreeConfigInput = z.input<typeof WorktreeConfigSchema>;

export function worktree(input: WorktreeConfigInput): WorktreeConfig {
  return WorktreeConfigSchema.parse(input) as WorktreeConfig;
}

type WorkflowInput<
  TRequired extends readonly string[],
  TVars extends Record<string, string>,
  TDerived extends Record<string, string>,
> = {
  description: string;
  required?: TRequired;
  variables?: TVars;
  derive?: (args: BuiltinArgs & TVars & Record<TRequired[number], string>) => TDerived;
  isolation?: "none" | WorktreeConfig;
  steps: WorkflowStepInput[];
};

export function defineWorkflow<
  const TRequired extends readonly string[],
  TVars extends Record<string, string>,
  TDerived extends Record<string, string>,
>(def: WorkflowInput<TRequired, TVars, TDerived>): WorkflowDef {
  const parsed = WorkflowDef.parse(def);
  (parsed as unknown as { kind: "workflow" }).kind = "workflow";
  return parsed as WorkflowDef;
}

type DefineConfigInput = Omit<z.input<typeof GlobalConfig>, "workDir"> & {
  workDir?: string;
};

export function defineConfig(config: DefineConfigInput): GlobalConfig {
  // workDir is optional here - loadConfig back-fills it with the directory
  // containing generata.config.ts, and validates the full shape at load time.
  return config as unknown as GlobalConfig;
}

// Public type re-exports for consumers. Internals (engine, registry, runner)
// stay private.
export type {
  AgentDef,
  LLMAgentDef,
  WorkflowDef,
  GlobalConfig,
  PromptFn,
  StepParams,
} from "./schema.js";
