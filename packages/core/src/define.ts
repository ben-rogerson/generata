import { z } from "zod";
import {
  AgentDef,
  LLMAgentDef,
  WorkflowDef,
  GlobalConfig,
  PromptFn,
  StepParams,
} from "./schema.js";

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
    })
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "supervisor" }>, "promptTemplate"> & {
      promptTemplate: PromptFn;
    });

export function defineAgent<T extends AgentInput>(def: T): Extract<AgentDef, { type: T["type"] }> {
  return AgentDef.parse(def) as Extract<AgentDef, { type: T["type"] }>;
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

type WorkflowInput<
  TRequired extends readonly string[],
  TVars extends Record<string, string>,
  TDerived extends Record<string, string>,
> = {
  name: string;
  description: string;
  required?: TRequired;
  variables?: TVars;
  derive?: (args: BuiltinArgs & TVars & Record<TRequired[number], string>) => TDerived;
  steps: WorkflowStepInput[];
};

export function defineWorkflow<
  const TRequired extends readonly string[],
  TVars extends Record<string, string>,
  TDerived extends Record<string, string>,
>(def: WorkflowInput<TRequired, TVars, TDerived>): WorkflowDef {
  return WorkflowDef.parse(def);
}

export function defineConfig(config: z.input<typeof GlobalConfig>): GlobalConfig {
  return GlobalConfig.parse(config);
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
