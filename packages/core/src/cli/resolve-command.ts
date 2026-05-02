export const RESERVED_COMMANDS: ReadonlySet<string> = new Set([
  "help",
  "--help",
  "-h",
  "init",
  "skills",
  "add",
  "agent",
  "workflow",
  "run",
  "validate",
  "metrics",
]);

export function resolveCommand(positional: string[]): {
  command: string | undefined;
  rest: string[];
} {
  const [first, ...rest] = positional;
  if (first && !RESERVED_COMMANDS.has(first)) {
    return { command: "workflow", rest: [first, ...rest] };
  }
  return { command: first, rest };
}
