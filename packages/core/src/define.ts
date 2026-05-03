import { z } from "zod";
import {
  AgentDef,
  LLMAgentDef,
  WorkflowDef,
  WorktreeConfig as WorktreeConfigSchema,
  GlobalConfig,
  PromptFn,
  BUILTIN_ARGS,
  type BuiltinPromptArgs,
  type StepInvocation,
} from "./schema.js";

// Branded so only `worktree()` produces an assignable value. Without this brand,
// users could pass a raw object literal to `isolation`, bypassing the helper.
declare const _worktreeBrand: unique symbol;
export type WorktreeConfig = z.infer<typeof WorktreeConfigSchema> & {
  readonly [_worktreeBrand]: true;
};

// z.custom<PromptFn> breaks contextual typing through discriminated union inference,
// so we override just that field. Everything else derives from the Zod schema.
//
// promptTemplate accepts string OR function:
//  - function: receives prompt args at runtime, returns the prompt string
//  - string:   pre-resolved (typically built via factory closure interpolation)
type AgentInput =
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "critic" }>, "promptTemplate"> & {
      promptTemplate: PromptFn | string;
    })
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "worker" }>, "promptTemplate"> & {
      promptTemplate: PromptFn | string;
    })
  | (Omit<Extract<z.input<typeof AgentDef>, { type: "planner" }>, "promptTemplate"> & {
      promptTemplate: PromptFn | string;
    });

// Brand that distinguishes factory-form agents from object-form. The bare-agent
// step slot rejects branded values so a factory can't be passed without calling
// it (which would silently use the sentinel-resolved promptTemplate at runtime).
declare const _factoryBrand: unique symbol;

// Factory-form return: callable that produces StepInvocations. Static agent
// metadata is attached as own properties so callers (registry, help, precheck)
// can introspect without invoking the factory. promptTemplate is intentionally
// omitted: the static value is a sentinel-laced placeholder; the real one is
// rebuilt per invocation inside the StepInvocation.
//
// TOutputs reflects the agent's `outputs` declaration so the chain builder can
// read it back via the StepInvocation return type and extend downstream params.
export type AgentCallable<
  TInputs extends Record<string, string>,
  TOutputs extends Record<string, string> = Record<never, string>,
> = ((inputs: TInputs) => StepInvocation<TOutputs>) & {
  kind: "agent";
  __inputs: TInputs;
  readonly [_factoryBrand]: true;
} & Omit<AgentDef, "kind" | "promptTemplate">;

// Object form: existing API. Factory form: declares typed inputs, called per
// invocation by the engine via the returned callable.
//
// `const T` preserves the literal `outputs` keys so the chain builder can
// thread them downstream the same way it does for factory-form agents.
export function defineAgent<const T extends AgentInput>(
  def: T,
): Extract<AgentDef, { type: T["type"] }> &
  (T extends { outputs: infer O extends Record<string, string> } ? { outputs: O } : unknown);
// Default TInputs to an empty record so omitting the generic narrows `args` to
// just BuiltinPromptArgs - destructuring an unknown key then errors at the call
// site, instead of silently typing every key as string.
//
// Two factory-form overloads: the first (with explicit `outputs: TOutputs` in
// the return) binds TOutputs from the factory's outputs map and exposes it on
// the AgentCallable so the chain builder can read it. The second is the
// no-outputs case. Splitting this way side-steps an inference failure where
// TOutputs was bound to the union default when outputs was just an optional
// field of the discriminated AgentInput.
export function defineAgent<
  TInputs extends Record<string, string> = Record<never, string>,
  const TOutputs extends Record<string, string> = Record<string, string>,
>(
  factory: (args: TInputs & BuiltinPromptArgs) => AgentInput & { outputs: TOutputs },
): AgentCallable<TInputs, TOutputs>;
export function defineAgent<TInputs extends Record<string, string> = Record<never, string>>(
  factory: (args: TInputs & BuiltinPromptArgs) => AgentInput,
): AgentCallable<TInputs>;
export function defineAgent(
  defOrFactory: AgentInput | ((args: Record<string, string>) => AgentInput),
): AgentDef | AgentCallable<Record<string, string>> {
  if (typeof defOrFactory === "function") {
    // Factory form. Call once with sentinels to extract static config; record
    // which keys the factory destructured to expose them as `__inputs` for
    // precheck and registry introspection.
    const inputProbe = new Set<string>();
    const probe = new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const k = String(key);
        if (!BUILTIN_ARGS.includes(k as (typeof BUILTIN_ARGS)[number])) inputProbe.add(k);
        return `__placeholder_${k}__`;
      },
      has: () => true,
    });
    const staticConfig = defOrFactory(probe);
    const parsed = AgentDef.parse(staticConfig) as AgentDef;
    const inputKeys = [...inputProbe];

    // The closure-form promptTemplate is the critical bit: rather than baking
    // builtins (today, work_dir, ...) into the prompt at invocation time —
    // when only the user's inputs are known — we defer to engine call time
    // when the full args bag (builtins + workflow context + inputs) is
    // available, then re-run the factory with everything in scope.
    const callable = ((inputs: Record<string, string>): StepInvocation => {
      const promptTemplate = (runtimeArgs: Record<string, string>): string => {
        const fullArgs = { ...runtimeArgs, ...inputs };
        const resolved = defOrFactory(fullArgs);
        return typeof resolved.promptTemplate === "string"
          ? resolved.promptTemplate
          : (resolved.promptTemplate as PromptFn)(fullArgs as never);
      };
      // Read callable.name at invocation time: the registry stamps it on the
      // callable AFTER definition, so closure-captured `parsed` doesn't have it.
      // Without this, agent.name is undefined at runtime for factory-form steps.
      return {
        kind: "step-invocation",
        agent: {
          ...(parsed as object),
          promptTemplate,
          name: callable.name,
        } as unknown as AgentDef,
        args: inputs,
      };
    }) as AgentCallable<Record<string, string>>;
    Object.assign(callable, parsed, {
      kind: "agent" as const,
      __inputs: Object.fromEntries(inputKeys.map((k) => [k, ""])),
    });
    // Function .name is read-only by default; the registry stamps a derived
    // name onto agents after loading, so make it writable.
    Object.defineProperty(callable, "name", { value: "", writable: true, configurable: true });
    return callable;
  }
  // Object form
  const parsed = AgentDef.parse(defOrFactory) as AgentDef;
  (parsed as unknown as { kind: "agent" }).kind = "agent";
  return parsed;
}

// Workflow construction: chain-builder pattern. defineWorkflow takes a config
// object (description, isolation, vars, required, derive) and returns a
// Builder. Each .step() returns a new Builder generic with the step's id added
// to the prior-ids union — this is what gives the next .step's stepFn proper
// contextual typing without a separate `ids: [...]` declaration. The terminal
// .build() validates and emits the WorkflowDef the engine consumes.
type BuiltinArgs = { work_dir: string; today: string; time: string };

// Bare slot rejects factory-form agents via the brand check. Factories must be
// called inside a step function with their inputs — passing one bare would let
// the engine consume a sentinel-laced promptTemplate.
type StepValue<TParams> =
  | (AgentDef & { readonly [_factoryBrand]?: never })
  | ((params: TParams) => StepInvocation<Record<string, string>>);

// Pulls the declared output keys back out of a step value's type.
// - Bare AgentDef: the value's `outputs` field (if declared) carries the keys.
// - stepFn: the StepInvocation it returns is generic on TOutputs (set by
//   AgentCallable when the factory's `outputs` map is declared); pluck it via
//   `infer`.
type StepValueOutputs<V> = V extends (
  ...args: never
) => StepInvocation<infer TO extends Record<string, string>>
  ? { [K in keyof TO]: string }
  : V extends { outputs: infer O extends Record<string, string> }
    ? { [K in keyof O]: string }
    : Record<never, string>;

type StepOptions<TParams = Record<string, string>> = {
  maxRetries?: number;
  dependsOn?: string[];
  // Bare object-form agent OR a stepFn returning a StepInvocation. The engine
  // calls the function (if any) with the same {builtins + vars + prior step
  // outputs} bag the step's main fn sees, so the user can wrap a factory and
  // map prior outputs to the factory's typed inputs symmetrically with .step().
  onReject?:
    | (LLMAgentDef & { readonly [_factoryBrand]?: never })
    | ((params: TParams) => StepInvocation);
};

type WorktreeConfigInput = z.input<typeof WorktreeConfigSchema>;

export function worktree(input: WorktreeConfigInput): WorktreeConfig {
  return WorktreeConfigSchema.parse(input) as WorktreeConfig;
}

// Internal step shape used by the engine. Either `agent` (bare) or `stepFn`
// (function form) is set; the engine dispatches at runtime.
type InternalStep = {
  id: string;
  agent?: AgentDef;
  stepFn?: (params: Record<string, string>) => StepInvocation;
  dependsOn?: string[];
  maxRetries?: number;
  // Stored loose because either an object agent or a callable factory may be
  // passed; the engine narrows by `typeof === "function"` at rejection time.
  onReject?: LLMAgentDef | ((inputs: Record<string, string>) => StepInvocation);
};

type WorkflowConfigInput<
  TRequired extends readonly string[] = readonly [],
  TVars extends Record<string, string> = Record<never, string>,
  TDerived extends Record<string, string> = Record<never, string>,
> = {
  description: string;
  required?: TRequired;
  variables?: TVars;
  derive?: (args: BuiltinArgs & TVars & Record<TRequired[number], string>) => TDerived;
  isolation?: "none" | WorktreeConfig;
};

// Each .step() returns a Builder with TPrior expanded by the new step's id and
// TBaseParams extended with any `outputs` declared on the step's agent. The
// agent's emit values reach downstream stepFns as named string params.
export type WorkflowBuilder<TBaseParams, TPrior extends string> = {
  step<const Id extends string, V extends StepValue<TBaseParams & Record<TPrior, string>>>(
    id: Id,
    value: V,
    options?: StepOptions<TBaseParams & Record<TPrior, string>>,
  ): WorkflowBuilder<TBaseParams & StepValueOutputs<V>, TPrior | Id>;
  build(): WorkflowDef;
};

export function defineWorkflow<
  const TRequired extends readonly string[] = readonly [],
  TVars extends Record<string, string> = Record<never, string>,
  TDerived extends Record<string, string> = Record<never, string>,
>(
  config: WorkflowConfigInput<TRequired, TVars, TDerived>,
): WorkflowBuilder<
  // Builtins (work_dir/today/time) are intentionally NOT exposed to step fn
  // params - they're already available inside agent factories via
  // BuiltinPromptArgs, so step fns shouldn't need to thread them through.
  TVars & Record<TRequired[number], string> & { [K in keyof TDerived]: string },
  never
> {
  const steps: InternalStep[] = [];

  const builder = {
    step(
      id: string,
      value: AgentDef | ((p: Record<string, string>) => StepInvocation),
      options?: StepOptions,
    ) {
      if (steps.some((s) => s.id === id)) {
        throw new Error(`defineWorkflow: duplicate step id '${id}'`);
      }
      const internal: InternalStep = { id, ...options };
      if (typeof value === "function") {
        // Factory-form agents are callable AND carry kind: "agent". Passing one
        // bare would skip the input mapping and run with a sentinel template.
        // Type-level: the brand on AgentCallable rejects this slot. Runtime
        // guard catches anyone bypassing types (e.g. via `as any`).
        if ((value as { kind?: unknown }).kind === "agent") {
          const fnName = (value as { name?: string }).name || "<factory>";
          throw new Error(
            `Step '${id}': factory-form agent '${fnName}' cannot be passed bare. ` +
              `Call it inside a step fn: .step("${id}", ({...}) => ${fnName}({...inputs}))`,
          );
        }
        internal.stepFn = value as InternalStep["stepFn"];
      } else {
        internal.agent = value as AgentDef;
      }
      steps.push(internal);
      return builder;
    },
    build(): WorkflowDef {
      if (steps.length === 0) {
        throw new Error(`defineWorkflow: at least one .step() is required before .build()`);
      }
      const parsed = WorkflowDef.parse({ ...config, steps });
      (parsed as unknown as { kind: "workflow" }).kind = "workflow";
      return parsed as WorkflowDef;
    },
  };

  return builder as unknown as WorkflowBuilder<
    TVars & Record<TRequired[number], string> & { [K in keyof TDerived]: string },
    never
  >;
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
  StepInvocation,
} from "./schema.js";
