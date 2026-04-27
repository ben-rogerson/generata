import { z } from "zod";

export const Tool = z.enum([
  "read",
  "write",
  "bash",
  "glob",
  "grep",
  "edit",
  "web-search",
  "web-fetch",
]);
export type Tool = z.infer<typeof Tool>;

export const LLMTier = z.enum(["heavy", "standard", "light"]);
export type LLMTier = z.infer<typeof LLMTier>;

export const ModelTier = LLMTier;
export type ModelTier = LLMTier;

export const Permissions = z.enum(["full", "read-only", "none"]);
export type Permissions = z.infer<typeof Permissions>;

export type ContextVars = Record<string, string>;

export const ContextSource = z.object({
  filepath: z.custom<string | ((vars: ContextVars) => string)>(
    (val) => typeof val === "string" || typeof val === "function",
    "filepath must be a string or a function",
  ),
  tail: z.number().optional(),
  // When true, a missing file produces no tag and no warning. Use for files that
  // are expected to be absent on fresh systems (e.g. memory/progress.txt).
  optional: z.boolean().optional(),
});
export type ContextSource = z.infer<typeof ContextSource>;

// Shared base across all agent types
const AgentBase = z.object({
  description: z.string(),
  timeoutSeconds: z.number().default(600),
  envKeys: z.array(z.string()).default([]),
});

export const BUILTIN_ARGS = ["work_dir", "today", "time"] as const;
export type BuiltinPromptArgs = Record<(typeof BUILTIN_ARGS)[number], string>;
export type PromptArgs = BuiltinPromptArgs & Record<string, string>;
export type PromptFn = (args: PromptArgs) => string;

// Shared base for all LLM-backed agent types
const LLMAgentBase = AgentBase.extend({
  modelTier: LLMTier,
  modelOverride: z.string().optional(),
  promptTemplate: z.custom<PromptFn>(
    (val) => typeof val === "function",
    "promptTemplate must be a function",
  ),
  promptContext: z.array(ContextSource).default([]),
  tools: z.array(Tool).default([]),
  maxRetries: z.number().default(1),
});

export const AgentDef = z.discriminatedUnion("type", [
  // critic: read-only analysis; supports per-arg model switching
  LLMAgentBase.extend({
    type: z.literal("critic"),
    permissions: z.literal("read-only").default("read-only"),
    modelTierOverrides: z.record(z.string(), LLMTier).optional(),
  }).strict(),
  // worker: full-permission agent that reads/writes/runs code
  // .strict() rejects unknown fields so removed fields (e.g. promptRetryTemplate) fail loudly
  // instead of being silently stripped.
  LLMAgentBase.extend({
    type: z.literal("worker"),
    permissions: Permissions.default("full"),
  }).strict(),
  // planner: produces plans or acts as workflow initiator (interactive: true = terminal takeover)
  LLMAgentBase.extend({
    type: z.literal("planner"),
    permissions: Permissions.default("full"),
    interactive: z.boolean().default(false),
  }).strict(),
]);
export type AgentDef = z.infer<typeof AgentDef> & { kind: "agent"; name: string };
export type LLMAgentDef = AgentDef;

// AgentType derived from the union rather than a separate enum
export type AgentType = AgentDef["type"];

export type StepParams = Record<string, string>;

const CriticWorkflowStep = z.object({
  id: z.string(),
  agent: z.custom<Extract<AgentDef, { type: "critic" }>>(
    (val) =>
      typeof val === "object" &&
      val !== null &&
      "type" in val &&
      (val as { type: unknown }).type === "critic",
  ),
  args: z
    .custom<Record<string, unknown> | ((params: StepParams) => Record<string, unknown>)>(
      (val) => (typeof val === "object" && val !== null) || typeof val === "function",
    )
    .default({}),
  dependsOn: z.array(z.string()).optional(),
  maxRetries: z.number().optional(),
  onReject: z
    .custom<LLMAgentDef>(
      (val) =>
        typeof val === "object" &&
        val !== null &&
        "type" in val &&
        ["worker", "planner", "critic"].includes((val as { type: unknown }).type as string),
      "onReject must be an LLM agent definition",
    )
    .optional(),
});

const NonCriticWorkflowStep = z.object({
  id: z.string(),
  agent: z.custom<Exclude<AgentDef, { type: "critic" }>>(
    (val) =>
      typeof val === "object" &&
      val !== null &&
      "type" in val &&
      ["worker", "planner"].includes((val as { type: unknown }).type as string),
  ),
  args: z
    .custom<Record<string, unknown> | ((params: StepParams) => Record<string, unknown>)>(
      (val) => (typeof val === "object" && val !== null) || typeof val === "function",
    )
    .default({}),
  dependsOn: z.array(z.string()).optional(),
});

export type CriticWorkflowStep = z.infer<typeof CriticWorkflowStep>;

export const WorkflowStep = z.union([CriticWorkflowStep, NonCriticWorkflowStep]);
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export type DeriveFn = (args: Record<string, string>) => Record<string, string>;

export const WorkflowDef = z.object({
  description: z.string(),
  required: z.array(z.string()).default([]),
  variables: z.record(z.string(), z.string()).default({}),
  derive: z
    .custom<DeriveFn>(
      (val) => val === undefined || typeof val === "function",
      "derive must be a function that returns Record<string, string>",
    )
    .optional(),
  steps: z.array(WorkflowStep).min(1),
}).strict();
export type WorkflowDef = z.infer<typeof WorkflowDef> & { kind: "workflow"; name: string };

export const GlobalConfig = z.object({
  modelTiers: z.object({
    heavy: z.string(),
    standard: z.string(),
    light: z.string(),
  }),
  workDir: z.string(),
  agentsDir: z.string().default("agents"),
  metricsDir: z.string().default("metrics"),
  logsDir: z.string().default("logs"),
  notifications: z.boolean().default(true),
  agentSummaries: z.boolean().default(true),
  logPrompts: z.boolean().default(false),
  showPricing: z.boolean().default(false),
  verboseOutput: z.boolean().default(false),
  maxCriticRetries: z.number().default(3),
  telegram: z
    .object({
      botToken: z.string(),
      chatId: z.string(),
    })
    .optional(),
});
export type GlobalConfig = z.infer<typeof GlobalConfig>;

export type AgentStreamEvent =
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | { type: "text"; text: string };

export interface AgentMetrics {
  agent: string;
  model: string;
  model_tier: string;
  workflow_id: string | null;
  step_id: string | null;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_cost_usd: number;
  cost_was_reported: boolean;
  status: "success" | "failure" | "timeout" | "retry";
  error?: string;
  exit_code: number;
}
