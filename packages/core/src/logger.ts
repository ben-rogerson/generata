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

const BANNER_PLAIN = ["  generata"];

const BANNER_COLOUR = [
  "  \x1b[31mg\x1b[1;31me\x1b[33mn\x1b[1;33me\x1b[32mr\x1b[36ma\x1b[34mt\x1b[35ma\x1b[0m",
];

export function logBanner(tagline?: string): void {
  const lines = pc.isColorSupported ? BANNER_COLOUR : BANNER_PLAIN;
  for (const line of lines) console.log(line);
  if (tagline) console.log(`  ${pc.italic(tagline)}`);
  console.log("");
}

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

const WORKFLOW_TAGLINES = [
  "All systems nominal. The voices say otherwise.",
  "Outcomes decided by blood moon, pure chaos, and one raccoon on ketamine.",
  "git blame is drunk and telling everyone your secrets.",
  "Refactoring so hard I achieved ego death and came back wrong.",
  "Tabs vs spaces ended in a cage match. Only eldritch screams remain.",
  "Yak shaved. Uncovered an ancient civilization of yaks. They want revenge.",
  "CI goblin is awake, pissed off, and unionizing.",
  "Containers spinning so fast they opened a portal to another dimension.",
  "Bribed the build cache with lies and expired snacks.",
  "GPU is now a small sun. I'm using it to make toast.",
  "Sacrificed three branches, a junior dev, and my sleep schedule.",
  "Production is on fire. We're doing a rain dance... with gasoline.",
  "Linter is being a little bit**. We're ignoring it.",
  "Touched legacy code. It whispered my name at 3am.",
  "git blame now leads to a 2009 Geocities page and a curse.",
  "Sonnet passed out. Haiku is tweaking balls and writing nonsense.",
  "This app runs on spite, duct tape, and forbidden knowledge.",
  "Code somehow works. I’m not touching it. Don’t ask.",
];

export function pickWorkflowTagline(): string {
  return WORKFLOW_TAGLINES[Math.floor(Math.random() * WORKFLOW_TAGLINES.length)];
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

export function logStreamEvent(event: AgentStreamEvent): void {
  if (event.type !== "tool_use") return;
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
