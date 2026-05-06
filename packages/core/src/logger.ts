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
    "Hands on keyboard. Brain in the trash where it belongs...",
    "Code dropping. This better not suck...",
    "Let's build some unhinged bullsh**...",
    "Time to make it real before I lose what's left of my mind...",
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

export type WorkflowIsolation = { mode: "local" } | { mode: "worktree"; path: string };
