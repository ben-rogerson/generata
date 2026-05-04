import { basename, relative } from "path";
import pc from "picocolors";
import { AgentType, AgentStreamEvent } from "./schema.js";
import { formatTokenCount } from "./metrics.js";

// Formatters for inline use
export const fmt = {
  step: (s: string) => pc.cyan(s),
  agent: (s: string) => pc.blue(s),
  model: (s: string) => pc.dim(s),
  success: (s: string) => pc.green(s),
  fail: (s: string) => pc.red(s),
  warn: (s: string) => pc.yellow(s),
  dim: (s: string) => pc.dim(s),
  bold: (s: string) => pc.bold(s),
  cost: (n: number) => pc.magenta(`$${n.toFixed(4)}`),
  duration: (ms: number) => pc.dim(`${(ms / 1000).toFixed(1)}s`),
};

const orange = (s: string): string => (pc.isColorSupported ? `\x1b[38;5;208m${s}\x1b[0m` : s);

const TYPE_COLORS: Record<AgentType, (s: string) => string> = {
  worker: pc.cyan,
  planner: pc.magenta,
  critic: orange,
};

export function agentColor(type: string): (s: string) => string {
  return TYPE_COLORS[type as AgentType] ?? pc.cyan;
}

const TYPE_TAGLINES: Record<AgentType, string[]> = {
  worker: [
    "Hands on keyboard. Brain in the trash where it belongs...",
    "Code dropping. This better not suck...",
    "Let’s build some unhinged bullsh**...",
    "Time to make it real before I lose what’s left of my mind...",
    "Currently coding like a raccoon that just did lines of caffeine...",
  ],
  planner: [
    "Charting the course through this dumpster fire of a project...",
    "Thinking it through... against my will...",
    "Mapping the path. It's mostly terrible ideas and copium...",
    "Scouting the horizon. Looks like pain and suffering...",
    "Cooking up another ridiculous plan. This'll end great...",
  ],
  critic: [
    "Scrutinising this nonsense like it personally offended me...",
    "Nothing gets past me. I'm in a bad mood...",
    "Dissecting this code like a feral animal...",
    "Finding every flaw because someone has to be the assho**...",
    "My disappointment is reaching record levels...",
  ],
};

export function pickTagline(type: AgentType): string {
  const options = TYPE_TAGLINES[type];
  if (!options?.length) return "Ready...";
  return options[Math.floor(Math.random() * options.length)];
}

export function startSpinner(label: string): () => void {
  if (!process.stdout.isTTY) return () => {};
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r  ${pc.dim(frames[i++ % frames.length])} ${pc.dim(label)}`);
  }, 80);
  return () => {
    clearInterval(id);
    process.stdout.write("\r\x1b[K");
  };
}

function formatPromptLogPath(promptLogFile: string): string {
  const rel = relative(process.cwd(), promptLogFile);
  return rel && !rel.startsWith("..") ? rel : promptLogFile;
}

export function logAgentWelcome(
  name: string,
  type: string,
  description: string,
  model: string,
  args?: Record<string, unknown>,
  promptLogFile?: string,
  weeklyMetrics?: string,
): void {
  const extras: string[] = [pc.dim(model)];
  if (args?.plan_name) extras.push(pc.dim(`plan: ${args.plan_name}`));
  if (args?.goal) extras.push(pc.dim(`goal: ${String(args.goal).slice(0, 60)}`));

  const color = agentColor(type);
  console.log(`  ${pc.bold(color(name))} ${pc.dim(`[${type}]`)}`);
  console.log(`  ${pc.dim(description)}`);
  console.log(`  ${extras.join(pc.dim(" · "))}`);
  if (promptLogFile) {
    console.log(`  ${pc.dim(formatPromptLogPath(promptLogFile))}`);
  }
  if (weeklyMetrics) console.log(`  ${pc.dim(weeklyMetrics)}`);
  console.log("");
}

export type WorkflowIsolation = { mode: "local" } | { mode: "worktree"; path: string };

function formatIsolation(isolation: WorkflowIsolation): string {
  if (isolation.mode === "local") return "local";
  const rel = relative(process.cwd(), isolation.path);
  const display = rel && rel.length < isolation.path.length ? rel : isolation.path;
  return `worktree: ${display}`;
}

export function logWorkflowStart(
  name: string,
  stepCount: number,
  promptLogFile?: string,
  weeklyMetrics?: string,
  isolation?: WorkflowIsolation,
): void {
  const folder = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
  const label = folder.includes("workflow") ? "" : `${pc.bold("workflow")} `;
  console.log(`  ${label}${pc.bold(name)} ${pc.dim(`(${stepCount} steps queued)`)}`);
  if (isolation) console.log(`  ${pc.dim(formatIsolation(isolation))}`);
  if (promptLogFile) {
    console.log(`  ${pc.dim(formatPromptLogPath(promptLogFile))}`);
  }
  if (weeklyMetrics) console.log(`  ${pc.dim(weeklyMetrics)}`);
  console.log("");
}

export function logStepStart(stepIndex: number, total: number, id: string): void {
  console.log(`${pc.dim(`[${stepIndex}/${total}]`)} ${pc.white(id)}`);
}

export function logStepDone(
  id: string,
  durationMs: number,
  costUsd: number,
  model?: string,
  verdict?: { verdict: string; summary: string; issues: string[] },
  costWasReported?: boolean,
  totalTokens?: number,
  showPricing?: boolean,
  failed?: boolean,
): void {
  const approved = !verdict || verdict.verdict === "approve";
  const ok = approved && !failed;
  const check = `${ok ? pc.green("✓") : pc.red("✗")} ${id}`;
  const costStr = costWasReported && showPricing ? `$${costUsd.toFixed(4)} USD` : "";
  const usageStr = `${formatTokenCount(totalTokens ?? 0)} tok${costStr ? ` (${costStr})` : ""}`;
  const parts = [`  ${check}`, pc.dim(`${(durationMs / 1000).toFixed(1)}s`), usageStr];
  if (model) parts.push(pc.dim(model));
  console.log(parts.join(" "));
  if (verdict?.summary) console.log(`    ${pc.dim(verdict.summary)}`);
}

export function logStepSkipped(id: string, condition: string): void {
  console.log(
    `  ${pc.yellow("⊘")} ${pc.dim(id)} ${pc.yellow("skipped")} ${pc.dim(`(${condition})`)}`,
  );
}

export function logStepRetry(id: string, attempt: number): void {
  console.warn(`  ${pc.yellow("↺")} ${pc.yellow(id)} attempt ${attempt} failed, retrying...`);
}

export function logAgentModel(name: string, type: string, model: string): void {
  const color = agentColor(type);
  console.log(`  ${pc.dim("↳")} ${color(name)} ${pc.dim(model)}`);
}

function formatToolDetail(name: string, input: Record<string, unknown>): string {
  const n = name.toLowerCase();
  if (n === "read" || n === "edit" || n === "write") {
    return typeof input.file_path === "string" ? basename(input.file_path) : "";
  }
  if (n === "bash") {
    return typeof input.command === "string" ? input.command.slice(0, 120) : "";
  }
  if (n === "glob") {
    return typeof input.pattern === "string" ? input.pattern : "";
  }
  if (n === "grep") {
    return typeof input.pattern === "string" ? input.pattern : "";
  }
  // Fallback: first string value
  const first = Object.values(input).find((v) => typeof v === "string");
  return typeof first === "string" ? first.slice(0, 120) : "";
}

// Naive but display-purpose-only shell tokeniser. Handles "foo bar", 'foo bar',
// and bare tokens. Doesn't decode escapes inside quotes - agents rarely produce
// them, and this is for log lines, not execution.
function tokeniseShell(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/**
 * Engine-bin invocations (emit / verdict / params) are surfaced through the
 * normal Bash tool, so by default they render as a long `Bash: /abs/path/to/bin
 * --flag "..."` line. Replace those with a phrase that explains what the agent
 * just did, e.g. `Halted with reason: "..."` or `Approved`. Returns null for
 * any Bash command that isn't one of our bins, so the caller falls through to
 * the normal formatter.
 */
export function formatBinInvocation(command: string): string | null {
  const m = command.match(/\/bin\/(emit|verdict|params)\b\s*(.*)$/);
  if (!m) return null;
  const bin = m[1];
  const args = tokeniseShell(m[2]);

  if (bin === "emit") {
    if (args[0] === "--halt") {
      return `Halted with reason: "${truncate(args[1] ?? "")}"`;
    }
    if (args.length === 0) return "Step complete (no outputs declared)";
    const pairs: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const flag = (args[i] ?? "").replace(/^--/, "");
      const value = args[i + 1] ?? "";
      if (flag) pairs.push(`${flag}="${truncate(value, 60)}"`);
    }
    return `Outputs emitted: ${pairs.join(", ")}`;
  }

  if (bin === "verdict") {
    const v = args[0];
    if (v === "approve") return "Verdict: approve";
    if (v === "reject") {
      const summary = args[1] ?? "";
      const issueCount = Math.max(0, args.length - 2);
      const suffix = issueCount > 0 ? ` (${issueCount} issue${issueCount === 1 ? "" : "s"})` : "";
      return `Verdict: reject - "${truncate(summary)}"${suffix}`;
    }
    return `Verdict: ${args.join(" ")}`;
  }

  if (bin === "params") {
    const planName = args[0] ?? "";
    const instructions = args[1] ?? "";
    return `Plan params: ${planName} - "${truncate(instructions)}"`;
  }

  return null;
}

export function logStreamEvent(event: AgentStreamEvent): void {
  if (event.type !== "tool_use") return;

  if (event.name.toLowerCase() === "bash") {
    const cmd = typeof event.input.command === "string" ? event.input.command : "";
    const friendly = formatBinInvocation(cmd);
    if (friendly) {
      console.log(`  ${pc.dim("→")} ${pc.dim(friendly)}`);
      return;
    }
  }

  const detail = formatToolDetail(event.name, event.input);
  const detailStr = detail ? pc.dim(`: ${detail}`) : "";
  console.log(`  ${pc.dim("→")} ${pc.dim(event.name)}${detailStr}`);
}

export function logWorkflowResult(
  name: string,
  success: boolean,
  cost: number,
  durationMs: number,
  model?: string,
  haltReason?: string,
  costWasReported?: boolean,
  totalTokens?: number,
  showPricing?: boolean,
): void {
  const status = success ? pc.green("SUCCESS") : pc.red("FAILED");
  console.log(`\n${pc.bold("[workflow]")} ${name}: ${status}`);
  const usageStr =
    costWasReported && showPricing
      ? `cost: ${pc.magenta(`$${cost.toFixed(4)}`)}`
      : `tokens: ${pc.cyan(formatTokenCount(totalTokens ?? 0))}`;
  const parts = [`  ${usageStr}  time: ${pc.dim(`${(durationMs / 1000).toFixed(1)}s`)}`];
  if (model) parts.push(pc.dim(model));
  console.log(parts.join("  "));
  if (haltReason) console.log(`  ${pc.red("✗")} ${pc.dim(haltReason)}`);
}
