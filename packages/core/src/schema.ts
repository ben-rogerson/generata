import { z } from "zod";

export const Tool = z.enum(["write", "bash", "edit", "web-search", "web-fetch"]);
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
  // string is allowed for the factory-form `defineAgent(({inputs}) => ({...}))`
  // pattern, where the template is built per-invocation via closure interpolation
  // and reaches the engine as a fully-resolved string.
  prompt: z.custom<PromptFn | string>(
    (val) => typeof val === "function" || typeof val === "string",
    "prompt must be a function or string",
  ),
  promptContext: z.array(ContextSource).default([]),
  tools: z.array(Tool).default([]),
  maxRetries: z.number().default(1),
  // Declares typed string outputs the agent emits via `emit` bin at end of run.
  // Map: emission key -> human-readable description (rendered into prompt footer).
  // Engine surfaces parsed values into the runtime params bag for downstream stepFns.
  outputs: z.record(z.string(), z.string()).optional(),
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

// Returned by an AgentCallable (factory-form agent) when invoked from a stepFn.
// Engine consumes it directly: agent + resolved args.
// TOutputs is a phantom generic so the chain builder can pull declared outputs
// keys back out of the stepFn's return type and extend TBaseParams accordingly.
// It carries no runtime value.
export type StepInvocation<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TOutputs extends Record<string, string> = Record<never, string>,
> = {
  kind: "step-invocation";
  agent: AgentDef;
  args: Record<string, unknown>;
};

// Function-step shape: chain builder's `.step(id, (params) => agent(...))` form.
// The fn receives prior step outputs + builtins/vars and returns a StepInvocation.
const FnWorkflowStep = z.object({
  id: z.string(),
  stepFn: z.custom<(params: StepParams) => StepInvocation>(
    (val) => typeof val === "function",
    "stepFn must be a function returning a StepInvocation",
  ),
  dependsOn: z.array(z.string()).optional(),
  maxRetries: z.number().optional(),
  // Accepts either an object-form AgentDef or a function (stepFn / factory)
  // returning a StepInvocation. The engine narrows by typeof at rejection time.
  onReject: z
    .custom<LLMAgentDef | ((inputs: Record<string, string>) => StepInvocation)>((val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "function") return true;
      return (
        typeof val === "object" &&
        "type" in val &&
        ["worker", "planner", "critic"].includes((val as { type: unknown }).type as string)
      );
    }, "onReject must be an LLM agent definition or a function returning a StepInvocation")
    .optional(),
});

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
  // Accepts either an object-form AgentDef or a function (stepFn / factory)
  // returning a StepInvocation. The engine narrows by typeof at rejection time.
  onReject: z
    .custom<LLMAgentDef | ((inputs: Record<string, string>) => StepInvocation)>((val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "function") return true;
      return (
        typeof val === "object" &&
        "type" in val &&
        ["worker", "planner", "critic"].includes((val as { type: unknown }).type as string)
      );
    }, "onReject must be an LLM agent definition or a function returning a StepInvocation")
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
export type FnWorkflowStep = z.infer<typeof FnWorkflowStep>;

const EachGlob = z.object({ glob: z.string().min(1) }).strict();
const EachJson = z.object({ json: z.string().min(1) }).strict();
const EachItems = z
  .object({
    items: z.custom<(b: BuiltinPromptArgs) => unknown[] | Promise<unknown[]>>(
      (val) => typeof val === "function",
      "each.items must be a function",
    ),
  })
  .strict();

export const EachSource = z.union([EachGlob, EachJson, EachItems]);
export type EachSource = z.infer<typeof EachSource>;

const LoopStepOptionsBase = z.object({
  concurrency: z.number().int().positive().default(1),
  onFailure: z.enum(["halt", "continue"]).default("halt"),
  onItemFail: z
    .custom<LLMAgentDef | ((inputs: Record<string, string>) => StepInvocation)>((val) => {
      if (val === null || val === undefined) return false;
      if (typeof val === "function") return true;
      return (
        typeof val === "object" &&
        "type" in val &&
        ["worker", "planner", "critic"].includes((val as { type: unknown }).type as string)
      );
    }, "onItemFail must be an LLM agent definition or a function returning a StepInvocation")
    .optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  dependsOn: z.array(z.string()).optional(),
});

// Runtime predicate for subWorkflow shape - we validate `kind === "workflow"`
// only, since fully recursing into WorkflowDef here would create a TS circular
// reference (WorkflowDef -> WorkflowStep -> LoopWorkflowStep -> WorkflowDef).
const isWorkflowDef = (val: unknown): boolean =>
  typeof val === "object" && val !== null && (val as { kind?: unknown }).kind === "workflow";

// Discriminated by source so glob requires `as:` and json/items reject it at parse time.
export const LoopWorkflowStep = z.union([
  LoopStepOptionsBase.extend({
    id: z.string(),
    subWorkflow: z.unknown().refine(isWorkflowDef, "subWorkflow must be a WorkflowDef"),
    each: EachGlob,
    as: z.string().min(1),
  }).strict(),
  LoopStepOptionsBase.extend({
    id: z.string(),
    subWorkflow: z.unknown().refine(isWorkflowDef, "subWorkflow must be a WorkflowDef"),
    each: z.union([EachJson, EachItems]),
    as: z.string().optional(),
  }).strict(),
]);
export type LoopWorkflowStep = z.infer<typeof LoopWorkflowStep>;

export const WorkflowStep = z.union([
  CriticWorkflowStep,
  NonCriticWorkflowStep,
  FnWorkflowStep,
  LoopWorkflowStep,
]);
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export type DeriveFn = (args: Record<string, string>) => Record<string, string>;

const SharedPathEntry = z.string().refine(
  (s) => {
    if (s.length === 0) return false;
    if (s.startsWith("/")) return false;
    if (s === ".git" || s.startsWith(".git/")) return false;
    // No `..` segment anywhere in the path
    if (s.split("/").some((seg) => seg === "..")) return false;
    return true;
  },
  {
    message:
      "sharedPaths entries must be relative, must not contain '..', and must not target .git",
  },
);

const BaseRef = z
  .string()
  .min(1)
  .refine((s) => !s.startsWith("/") && !s.endsWith("/"), {
    message:
      "baseRef must be a local branch (e.g. 'main') or '<remote>/<branch>' (e.g. 'origin/main')",
  });

export const WorktreeConfig = z
  .object({
    worktreeSetup: z
      .array(z.string())
      .min(1, "worktreeSetup must be a non-empty argv array")
      .optional(),
    sharedPaths: z.array(SharedPathEntry).default([]),
    worktreeDir: z.string().min(1).optional(),
    baseRef: BaseRef.optional(),
    // When true, the worktree and its generata/wt-<runId> branch are removed
    // after the workflow finishes (or on SIGINT/SIGTERM). Default false: leave
    // the worktree on disk for inspection. Setup-failure cleanup is unconditional.
    cleanup: z.boolean().default(false),
  })
  .strict();
export type WorktreeConfig = z.infer<typeof WorktreeConfig>;

export const WorkflowDef = z
  .object({
    description: z.string(),
    required: z.array(z.string()).default([]),
    variables: z.record(z.string(), z.string()).default({}),
    derive: z
      .custom<DeriveFn>(
        (val) => val === undefined || typeof val === "function",
        "derive must be a function that returns Record<string, string>",
      )
      .optional(),
    isolation: z.union([z.literal("none"), WorktreeConfig]).default("none"),
    steps: z.array(WorkflowStep).min(1),
  })
  .strict();
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
  logPrompts: z.boolean().default(false),
  showPricing: z.boolean().default(false),
  showWeeklyMetrics: z.boolean().default(true),
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
