import pc from "picocolors";
import { AgentType } from "./schema.js";

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
    "Hands dirty, expectations low, let's go...",
    "Compiling. Optimism not included...",
    "Hands on keyboard. Brain mostly elsewhere...",
    "Making it real, against better judgment...",
    "Caffeinated, mildly resentful, building anyway...",
  ],
  planner: [
    "Charting a path through the smouldering wreckage...",
    "Thinking it through. Against my better judgment...",
    "Mapping the route. Mostly bad ideas and hope...",
    "Scouting ahead. Pain and suffering, as expected...",
    "Cooking up a plan. This will end about as well as the last one...",
  ],
  critic: [
    "Scrutinising this like it personally wronged me...",
    "Nothing gets past me today. Mood: bleak...",
    "Dissecting the code with enthusiasm and minimal mercy...",
    "Finding every flaw. Someone has to.",
    "Disappointment levels: setting new records...",
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

export type WorkflowIsolation = { mode: "local" } | { mode: "worktree"; path: string };
