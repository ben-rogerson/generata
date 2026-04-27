import { basename } from "path";
import pc from "picocolors";
import { AgentType, AgentStreamEvent } from "./schema.js";

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

const TYPE_COLORS: Record<AgentType, (s: string) => string> = {
  worker: pc.green,
  planner: pc.blue,
  critic: pc.yellow,
};

export function agentColor(type: string): (s: string) => string {
  return TYPE_COLORS[type as AgentType] ?? pc.blue;
}

const TYPE_TAGLINES: Record<AgentType, string[]> = {
  worker: [
    "Hands on keyboard. Ready to ship...",
    "Code incoming...",
    "Let's build something...",
    "Time to make it real...",
  ],
  planner: [
    "Charting the course...",
    "Thinking it through...",
    "Mapping the path forward...",
    "Scouting the horizon...",
  ],
  critic: [
    "Scrutinising the work...",
    "Nothing gets past me...",
    "Eyes on every line...",
    "Let's see how this holds up...",
  ],
};

export function pickTagline(type: AgentType): string {
  const options = TYPE_TAGLINES[type];
  if (!options?.length) return "Ready...";
  return options[Math.floor(Math.random() * options.length)];
}

const WORKFLOW_TAGLINES = [
  "All systems nominal. Probably.",
  "Compiling enthusiasm.",
  "May your stack traces be shallow.",
  "Reticulating splines.",
  "Determinism not guaranteed.",
  "It compiles. That's a start.",
  "We negotiated with the linter. We won.",
  "git blame is going to be funny.",
  "Production-grade vibes only.",
  "Resisting the urge to refactor everything.",
  "Reading the docs so you don't have to.",
  "Side effects: free. Time complexity: TBD.",
  "Plan A. Through Plan F.",
  "Ship it. Then panic. Then ship a fix.",
  "Cache invalidated. Naming things, next.",
  "Off-by-one errors: 0. Or 1.",
  "Turning coffee into commits.",
  "Yak shaved. Onward.",
];

export function pickWorkflowTagline(): string {
  return WORKFLOW_TAGLINES[Math.floor(Math.random() * WORKFLOW_TAGLINES.length)];
}

const SUMMARISING_PHRASES = [
  "Crunching the dust...",
  "Digesting the output...",
  "Making sense of this...",
  "Translating agent-speak...",
  "Distilling the findings...",
  "Boiling it down...",
  "Reading between the lines...",
  "Extracting the good bits...",
  "Putting it in plain English...",
  "Thinking it over...",
];

export function pickSummarisingPhrase(): string {
  return SUMMARISING_PHRASES[Math.floor(Math.random() * SUMMARISING_PHRASES.length)];
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

export function logAgentWelcome(
  name: string,
  type: string,
  description: string,
  model: string,
  args?: Record<string, unknown>,
): void {
  const extras: string[] = [pc.dim(model)];
  if (args?.plan_name) extras.push(pc.dim(`plan: ${args.plan_name}`));
  if (args?.goal) extras.push(pc.dim(`goal: ${String(args.goal).slice(0, 60)}`));

  const color = agentColor(type);
  console.log(`\n  ${pc.bold(color(name))} ${pc.dim(`[${type}]`)}`);
  console.log(`  ${pc.dim(description)}`);
  console.log(`  ${extras.join(pc.dim(" · "))}\n`);
}

export function logWorkflowStart(name: string, stepCount: number): void {
  console.log(`\n  ${pc.bold(pc.blue("workflow"))} ${pc.bold(name)}`);
  console.log(`  ${pc.italic(pickWorkflowTagline())}`);
  console.log(`  ${pc.dim(`${stepCount} steps queued`)}\n`);
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
): void {
  const approved = !verdict || verdict.verdict === "approve";
  const check = approved ? pc.green(`✓ ${id}`) : pc.red(`✗ ${id}`);
  const costStr =
    costWasReported && showPricing ? pc.green(`$${costUsd.toFixed(4)} USD`) : "";
  const usageStr = pc.green(
    `${Math.round((totalTokens ?? 0) / 1000)}k tok${costStr ? ` (${costStr})` : ""}`,
  );
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
  console.log(`\n${pc.bold(pc.blue("[workflow]"))} ${name}: ${status}`);
  const usageStr =
    costWasReported && showPricing
      ? `cost: ${pc.magenta(`$${cost.toFixed(4)}`)}`
      : `tokens: ${pc.cyan(`${Math.round((totalTokens ?? 0) / 1000)}k`)}`;
  const parts = [`  ${usageStr}  time: ${pc.dim(`${(durationMs / 1000).toFixed(1)}s`)}`];
  if (model) parts.push(pc.dim(model));
  console.log(parts.join("  "));
  if (haltReason) console.log(`  ${pc.red("✗")} ${pc.dim(haltReason)}`);
}
