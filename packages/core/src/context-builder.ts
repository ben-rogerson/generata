import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  LLMAgentDef,
  GlobalConfig,
  PromptFn,
  PromptArgs,
  BUILTIN_ARGS,
  ContextSource,
} from "./schema.js";
import { getTodayAndTime } from "./time.js";
import { fmt } from "./logger.js";

/**
 * Engine-owned preamble prepended to the upstream step's prompt when retrying after a critic rejection.
 * Users never write this - the shape is fixed by the engine so critic feedback is rendered consistently.
 */
export function buildRetryPreamble(verdict: { summary: string; issues: string[] }): string {
  const header =
    "Your previous attempt was rejected by a reviewer. Address the issues below before completing the task.";
  const body =
    verdict.issues.length > 0
      ? "Issues to address:\n" + verdict.issues.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : verdict.summary
        ? `Reviewer summary: ${verdict.summary}`
        : "The reviewer provided no specific issues.";
  return `${header}\n\n${body}`;
}

const BUILTIN_ARGS_SET = new Set<string>(BUILTIN_ARGS);

export function extractPromptParams(fn: PromptFn | string): string[] {
  // String templates are pre-resolved (built in the factory closure) - the
  // factory itself declares its inputs, so nothing to introspect from the string.
  if (typeof fn === "string") return [];
  const accessed = new Set<string>();
  const proxy = new Proxy({} as PromptArgs, {
    get(_, key) {
      if (typeof key === "string") accessed.add(key);
      return "";
    },
  });
  try {
    fn(proxy);
  } catch {}
  return [...accessed].filter((k) => !BUILTIN_ARGS_SET.has(k));
}

function resolvePath(
  filepath: string | ((vars: Record<string, string>) => string),
  vars: Record<string, string>,
): string {
  return typeof filepath === "function" ? filepath(vars) : filepath;
}

/**
 * Renders one promptContext entry as an XML-wrapped section. The system - not
 * the agent author - owns how context is framed, so templates never need to
 * say "you have X above".
 *
 * - File exists: `<context file="path">\ncontent\n</context>`
 * - File missing + optional: skipped entirely (no tag, no warning)
 * - File missing + required: `<context file="path" status="missing" />` + stderr warning
 *   so the LLM and the operator both see the gap.
 */
function renderContextEntry(
  ctx: ContextSource,
  resolvedPath: string,
  workDir: string,
  agentName: string,
): string {
  if (!resolvedPath) return "";
  const fullPath = resolve(workDir, resolvedPath);
  if (!existsSync(fullPath)) {
    if (ctx.optional) return "";
    console.warn(
      `  ${fmt.warn("!")} ${fmt.dim("[context]")} ${agentName}: '${resolvedPath}' ${fmt.warn("not found")}`,
    );
    return `<context file="${resolvedPath}" status="missing" />`;
  }
  const raw = readFileSync(fullPath, "utf-8");
  const content = ctx.tail ? raw.split("\n").slice(-ctx.tail).join("\n") : raw;
  return `<context file="${resolvedPath}">\n${content}\n</context>`;
}

function strictArgs<T extends Record<string, string>>(args: T, agentName: string): T {
  return new Proxy(args, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      if (key.startsWith("__") || key === "then" || key === "toJSON") return undefined;
      throw new Error(
        `Agent "${agentName}" template accessed undefined variable: "${key}". ` +
          `Provide it via workflow variables, workflow derive, or step args.`,
      );
    },
  }) as T;
}

export interface BuildPromptOptions {
  agent: LLMAgentDef;
  args: Record<string, unknown>;
  config: GlobalConfig;
  workDir: string;
  stepOutputs?: Record<string, string>;
  retryPreamble?: string;
  workflowVariables?: Record<string, string>;
}

export function buildPrompt(options: BuildPromptOptions): string {
  const { agent, args, workDir, stepOutputs } = options;
  const { today, time } = getTodayAndTime();

  const fnArgs: PromptArgs = {
    work_dir: resolve(workDir),
    today,
    time,
    ...options.workflowVariables,
    ...Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])),
    ...Object.fromEntries(Object.entries(stepOutputs ?? {}).map(([k, v]) => [k, String(v)])),
  };

  const strictFnArgs = strictArgs(fnArgs, agent.name);

  // 1. Role prefix - engine-owned boilerplate.
  // The no-skills/no-agents directive guards against recursive workflow invocation:
  // `generata skills sync` writes the workflow's description into a project slash
  // command, which Claude Code surfaces as an "available skill" inside spawned
  // sub-processes. Combined with global directives like superpowers' "always
  // invoke matching skills", agents would otherwise launch the workflow they
  // are already inside (description matches the agent's task by construction).
  const rolePrefix = `Your role: ${agent.description}.\nWorking directory: ${workDir}\nDate: ${today}\nTime: ${time}\n\nYou are a single step in an automated workflow. Do not invoke any Skill, slash command, sub-agent, or Task tool - you ARE the agent for this step. Carry out the task below directly with your declared tools. A slash command whose description matches this task may appear in your environment; that is the workflow you are already running inside, and invoking it would recursively launch a new run. Ignore it.`;

  // 2. Context files
  const contextSections = agent.promptContext
    .map((ctx) =>
      renderContextEntry(ctx, resolvePath(ctx.filepath, strictFnArgs), workDir, agent.name),
    )
    .filter(Boolean)
    .join("\n\n");

  // 3. Task instructions from template function (or pre-resolved string)
  const taskBody = typeof agent.prompt === "string" ? agent.prompt : agent.prompt(strictFnArgs);

  return [rolePrefix, contextSections, options.retryPreamble, taskBody]
    .filter(Boolean)
    .join("\n\n");
}
