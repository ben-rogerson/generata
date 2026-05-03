import { spawn } from "child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { LLMAgentDef, GlobalConfig, AgentMetrics, AgentStreamEvent, Tool } from "./schema.js";

const TOOL_NAME_MAP: Partial<Record<Tool, string>> = {
  bash: "Bash",
  write: "Write",
  edit: "Edit",
  "web-search": "WebSearch",
  "web-fetch": "WebFetch",
};
import { buildPrompt } from "./context-builder.js";
import { writeMetrics, formatWeeklyMetricsLine } from "./metrics.js";
import { logAgentModel, logAgentWelcome, startSpinner, pickTagline } from "./logger.js";

export interface RunOptions {
  agent: LLMAgentDef;
  args: Record<string, unknown>;
  config: GlobalConfig;
  workDir: string;
  cwd?: string;
  workflowId?: string | null;
  stepId?: string | null;
  stepOutputs?: Record<string, string>;
  onEvent?: (event: AgentStreamEvent) => void;
  promptLogFile?: string;
  retryPreamble?: string;
  workflowVariables?: Record<string, string>;
  resolvedEnv?: Record<string, string>;
}

export interface RunResult {
  output: string;
  metrics: AgentMetrics;
  interactive?: boolean;
  verdict?: { verdict: string; summary: string; issues: string[] };
  params?: { plan_name: string; instructions: string };
  outputs?: Record<string, string>;
  // Set when the agent emitted `--halt "<reason>"` via the emit bin. The engine
  // treats this as a structured workflow stop: no metric failure, no retry,
  // downstream steps are skipped, haltSignal carries the reason.
  halt?: { reason: string };
}

function resolveModel(
  agent: LLMAgentDef,
  args: Record<string, unknown>,
  config: GlobalConfig,
): string {
  if (agent.modelOverride) return agent.modelOverride;
  // per-arg model tier overrides are only available on critic agents
  if (agent.type === "critic" && agent.modelTierOverrides) {
    for (const [key, tier] of Object.entries(agent.modelTierOverrides)) {
      const eqIdx = key.indexOf("=");
      if (eqIdx === -1) continue;
      const argKey = key.slice(0, eqIdx);
      const argVal = key.slice(eqIdx + 1);
      if (String(args[argKey]) === argVal) {
        return config.modelTiers[tier];
      }
    }
  }
  return config.modelTiers[agent.modelTier];
}

async function runInteractive(options: RunOptions): Promise<RunResult> {
  const { agent, args, config, workDir, stepOutputs } = options;
  const basePrompt = buildPrompt({
    agent,
    args,
    config,
    workDir,
    stepOutputs,
    workflowVariables: options.workflowVariables,
  });
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const interactiveModel = resolveModel(agent, args, config);
  const weeklyMetrics = config.showWeeklyMetrics
    ? formatWeeklyMetricsLine(resolve(workDir, config.metricsDir), config.showPricing)
    : undefined;
  logAgentWelcome(
    agent.name,
    agent.type,
    agent.description,
    `${interactiveModel} (interactive)`,
    args,
    options.promptLogFile,
    weeklyMetrics,
  );

  // Set up params file for interactive planners - same mechanism as non-interactive
  let paramsFile: string | null = null;
  let prompt = basePrompt;
  if (agent.type === "planner" && agent.interactive) {
    const paramsBin = resolve(fileURLToPath(new URL("../bin/params", import.meta.url)));
    const fileId = `${options.workflowId ?? "standalone"}-${options.stepId ?? "agent"}`;
    paramsFile = join(tmpdir(), `params-${fileId}.json`);
    prompt = `${basePrompt}\n\n---\nTo emit workflow params, run: ${paramsBin} <plan_name> <instructions>`;
  }

  const spawnEnv: Record<string, string | undefined> = { ...process.env };
  if (paramsFile) spawnEnv.PARAMS_FILE = paramsFile;
  if (options.resolvedEnv) {
    for (const [key, value] of Object.entries(options.resolvedEnv)) {
      spawnEnv[key] = value;
    }
  }

  return new Promise((resolve_p, reject) => {
    const proc = spawn(
      "claude",
      ["--append-system-prompt", prompt, "Let's get this interview started"],
      {
        env: spawnEnv,
        stdio: "inherit",
        cwd: options.cwd,
      },
    );

    proc.on("close", async (code: number | null) => {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 0;

      const metrics: AgentMetrics = {
        agent: agent.name,
        model: resolveModel(agent, args, config),
        model_tier: agent.modelTier,
        workflow_id: options.workflowId ?? null,
        step_id: options.stepId ?? null,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        estimated_cost_usd: 0,
        cost_was_reported: false,
        status: exitCode === 0 ? "success" : "failure",
        exit_code: exitCode,
      };
      writeMetrics(metrics, resolve(workDir, config.metricsDir));

      // Read params file for interactive planners
      let paramsData: { plan_name: string; instructions: string } | undefined;
      if (paramsFile && existsSync(paramsFile)) {
        try {
          paramsData = JSON.parse(readFileSync(paramsFile, "utf8"));
          unlinkSync(paramsFile);
        } catch {}
      }

      resolve_p({
        output: "[interactive session completed]",
        metrics,
        interactive: true,
        params: paramsData,
      });
    });

    proc.on("error", (err: Error) => reject(err));
  });
}

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const { agent, args, config, workDir, stepOutputs, retryPreamble } = options;

  if (agent.type === "planner" && agent.interactive) {
    return runInteractive(options);
  }

  const model = resolveModel(agent, args, config);
  const basePrompt = buildPrompt({
    agent,
    args,
    config,
    workDir,
    stepOutputs,
    retryPreamble,
    workflowVariables: options.workflowVariables,
  });

  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  if (!options.workflowId) {
    const weeklyMetrics = config.showWeeklyMetrics
      ? formatWeeklyMetricsLine(resolve(workDir, config.metricsDir), config.showPricing)
      : undefined;
    logAgentWelcome(
      agent.name,
      agent.type,
      agent.description,
      model,
      args,
      options.promptLogFile,
      weeklyMetrics,
    );
  } else {
    logAgentModel(agent.name, agent.type, model);
  }

  const { onEvent } = options;
  // Spinner only when not streaming - live tool events are better feedback
  const stopSpinner = onEvent ? () => {} : startSpinner(pickTagline(agent.type));

  // Per-agent emission bins. Each gets its own tmp file (read+unlinked post-run)
  // and a surgical Bash(<bin>:*) permission so the LLM can call exactly that
  // binary without the agent's user-declared `tools` being widened.
  let verdictFile: string | null = null;
  let paramsFile: string | null = null;
  let outputsFile: string | null = null;
  let verdictBin: string | null = null;
  let paramsBin: string | null = null;
  let outputsBin: string | null = null;
  let prompt = basePrompt;
  const fileId = `${options.workflowId ?? "standalone"}-${options.stepId ?? "agent"}`;
  if (agent.type === "critic") {
    verdictBin = resolve(fileURLToPath(new URL("../bin/verdict", import.meta.url)));
    verdictFile = join(tmpdir(), `verdict-${fileId}.json`);
    prompt = `${prompt}\n\n---\nTo record your verdict, run ONE of:\n  ${verdictBin} approve\n  ${verdictBin} reject "<one-line summary>" "<issue 1>" "<issue 2>" ...\n\nWhen rejecting, each issue must be a specific, actionable one-sentence statement the upstream agent can address - one issue per failure, not concatenated. If you have nothing specific to flag, approve instead.`;
  } else if (agent.type === "planner") {
    paramsBin = resolve(fileURLToPath(new URL("../bin/params", import.meta.url)));
    paramsFile = join(tmpdir(), `params-${fileId}.json`);
    prompt = `${prompt}\n\n---\nTo emit workflow params, run: ${paramsBin} <plan_name> <instructions>`;
  }
  if (agent.outputs) {
    outputsBin = resolve(fileURLToPath(new URL("../bin/emit", import.meta.url)));
    outputsFile = join(tmpdir(), `outputs-${fileId}.json`);
    const successPath =
      Object.keys(agent.outputs).length > 0
        ? `As your final action, emit the workflow outputs by running:\n  ${outputsBin} ${Object.keys(
            agent.outputs,
          )
            .map((k) => `--${k} "<value>"`)
            .join(" ")}\n\nFlags:\n${Object.entries(agent.outputs)
            .map(([k, desc]) => `  --${k} "<value>"   # ${desc}`)
            .join(
              "\n",
            )}\n\nAll listed flags are required. Pass each value as a single shell-escaped string.`
        : `As your final action, signal completion to the workflow by running:\n  ${outputsBin}\n(no flags - this agent declares no typed outputs)`;
    prompt = `${prompt}\n\n---\n${successPath}\n\nIf you cannot complete the work (e.g. precondition unmet, ambiguous input, external blocker), halt the workflow cleanly by running:\n  ${outputsBin} --halt "<one-line reason>"\nWhen you halt, do not also emit success values. The workflow stops and the reason is propagated.`;
  }

  if (options.promptLogFile) {
    const header = `${"=".repeat(80)}\nSTEP: ${options.stepId ?? "standalone"} | AGENT: ${agent.name} | ${new Date().toISOString()}\n${"=".repeat(80)}\n\n`;
    mkdirSync(dirname(options.promptLogFile), { recursive: true });
    appendFileSync(options.promptLogFile, header + prompt + "\n\n");
  }

  const claudeArgs = [
    "-p",
    prompt,
    "--model",
    model,
    "--output-format",
    "stream-json",
    "--verbose",
  ];

  // Surgical bin permissions: lets the LLM invoke the specific verdict/params/
  // emit bins without widening the agent's declared `tools` to general Bash.
  // `Bash(<abs path>:*)` is the Claude Code syntax for "this binary only".
  const binPermissions: string[] = [];
  if (verdictBin) binPermissions.push(`Bash(${verdictBin}:*)`);
  if (paramsBin) binPermissions.push(`Bash(${paramsBin}:*)`);
  if (outputsBin) binPermissions.push(`Bash(${outputsBin}:*)`);

  // Apply tool permissions
  if (agent.permissions === "read-only") {
    const extraTools = agent.tools.flatMap((t) => {
      const mapped = TOOL_NAME_MAP[t as Tool];
      return mapped ? [mapped] : [];
    });
    const baseTools = ["Read", "Glob", "Grep"];
    claudeArgs.push("--allowedTools", [...baseTools, ...extraTools, ...binPermissions].join(","));
  } else if (agent.permissions === "none") {
    // Even with no tools, the agent may need to call its emission bins.
    claudeArgs.push("--allowedTools", binPermissions.join(","));
  } else {
    // permissions === "full": trust the agent with every tool, including WebSearch/WebFetch.
    // Non-interactive CLI mode otherwise denies tools that would require a permission prompt.
    if (agent.tools.length > 0 || binPermissions.length > 0) {
      const extraTools = agent.tools.flatMap((t) => {
        const mapped = TOOL_NAME_MAP[t as Tool];
        return mapped ? [mapped] : [];
      });
      const baseTools = ["Read", "Glob", "Grep"];
      claudeArgs.push("--allowedTools", [...baseTools, ...extraTools, ...binPermissions].join(","));
    }
    claudeArgs.push("--dangerously-skip-permissions");
  }

  const spawnEnv: Record<string, string | undefined> = { ...process.env };
  if (verdictFile) spawnEnv.VERDICT_FILE = verdictFile;
  if (paramsFile) spawnEnv.PARAMS_FILE = paramsFile;
  if (outputsFile) spawnEnv.EMIT_FILE = outputsFile;
  if (options.resolvedEnv) {
    for (const [key, value] of Object.entries(options.resolvedEnv)) {
      spawnEnv[key] = value;
    }
  }

  return new Promise((resolve_p, reject) => {
    const proc = spawn("claude", claudeArgs, { env: spawnEnv, cwd: options.cwd });

    // Two-stage timeout: SIGTERM at timeoutSeconds, SIGKILL 10s later if it
    // hasn't exited. Node's built-in spawn timeout only sends SIGTERM, which
    // the Claude CLI has been observed to ignore - leaving the parent waiting.
    let exited = false;
    const sigtermTimer = setTimeout(() => {
      if (!exited) proc.kill("SIGTERM");
    }, agent.timeoutSeconds * 1000);
    const sigkillTimer = setTimeout(
      () => {
        if (!exited) proc.kill("SIGKILL");
      },
      agent.timeoutSeconds * 1000 + 10_000,
    );
    proc.once("exit", () => {
      exited = true;
      clearTimeout(sigtermTimer);
      clearTimeout(sigkillTimer);
    });

    let stdoutBuffer = "";
    let stderr = "";
    let claudeResult: Record<string, unknown> = {};
    let output = "";

    function processLine(line: string): void {
      if (!line.trim()) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "assistant") {
        const content = (event.message as any)?.content;
        if (Array.isArray(content) && onEvent) {
          for (const block of content) {
            if (block.type === "tool_use") {
              onEvent({
                type: "tool_use",
                name: block.name,
                input: block.input ?? {},
              });
            }
          }
        }
      } else if (event.type === "result") {
        claudeResult = event;
        output = typeof event.result === "string" ? event.result : "";
      }
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", async (code: number | null) => {
      stopSpinner();
      // Flush any remaining buffered content
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      const exitCode = code ?? 1;
      const isSuccess = exitCode === 0 && !claudeResult.is_error;

      const inputTokens = (claudeResult.usage as any)?.input_tokens ?? 0;
      const outputTokens = (claudeResult.usage as any)?.output_tokens ?? 0;
      const cacheReadTokens = (claudeResult.usage as any)?.cache_read_input_tokens ?? 0;
      const cacheWriteTokens = (claudeResult.usage as any)?.cache_creation_input_tokens ?? 0;

      const estimatedCost =
        (claudeResult.total_cost_usd as number) ?? (claudeResult.cost_usd as number) ?? 0;
      const costWasReported = estimatedCost > 0;

      const metrics: AgentMetrics = {
        agent: agent.name,
        model,
        model_tier: agent.modelTier,
        workflow_id: options.workflowId ?? null,
        step_id: options.stepId ?? null,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        estimated_cost_usd: estimatedCost,
        cost_was_reported: costWasReported,
        status: isSuccess ? "success" : "failure",
        error: isSuccess ? undefined : stderr || String(claudeResult.result ?? ""),
        exit_code: exitCode,
      };

      // Read and clean up verdict file for critic agents
      let verdictData: { verdict: string; summary: string; issues: string[] } | undefined;
      if (verdictFile && existsSync(verdictFile)) {
        try {
          verdictData = JSON.parse(readFileSync(verdictFile, "utf8"));
          unlinkSync(verdictFile);
        } catch {}
      }

      // Read and clean up params file for initiator agents
      let paramsData: { plan_name: string; instructions: string } | undefined;
      if (paramsFile && existsSync(paramsFile)) {
        try {
          paramsData = JSON.parse(readFileSync(paramsFile, "utf8"));
          unlinkSync(paramsFile);
        } catch {}
      }

      // Read and clean up outputs file. Three branches:
      //   1. Halt emission ({__halt: "<reason>"}) — return halt signal, no
      //      metric failure; engine treats as structured workflow stop.
      //   2. Success keys present — validate declared keys, expose as outputs.
      //   3. Missing keys / no emission — fail metric so engine retries/halts.
      let outputsData: Record<string, string> | undefined;
      let haltData: { reason: string } | undefined;
      if (outputsFile && existsSync(outputsFile)) {
        try {
          const raw = JSON.parse(readFileSync(outputsFile, "utf8")) as Record<string, unknown>;
          unlinkSync(outputsFile);
          if (typeof raw.__halt === "string") {
            haltData = { reason: raw.__halt };
          } else {
            const declared = Object.keys(agent.outputs ?? {});
            const missing = declared.filter((k) => !(k in raw));
            if (missing.length === 0) {
              outputsData = Object.fromEntries(declared.map((k) => [k, String(raw[k] ?? "")]));
            } else {
              metrics.status = "failure";
              metrics.error = `${metrics.error ? metrics.error + "; " : ""}emit missing keys: ${missing.join(", ")}`;
            }
          }
        } catch {}
      } else if (outputsFile && agent.outputs && Object.keys(agent.outputs).length > 0) {
        metrics.status = "failure";
        metrics.error = `${metrics.error ? metrics.error + "; " : ""}emit bin was not invoked - declared outputs missing: ${Object.keys(agent.outputs).join(", ")}`;
      }

      writeMetrics(metrics, resolve(workDir, config.metricsDir));
      resolve_p({
        output,
        metrics,
        verdict: verdictData,
        params: paramsData,
        outputs: outputsData,
        halt: haltData,
      });
    });

    proc.on("error", (err: Error) => reject(err));
  });
}
