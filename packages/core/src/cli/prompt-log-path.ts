import { resolve } from "node:path";

function basenameOf(name: string): string {
  return name.split("/").pop() ?? name;
}

export function buildPromptLogPath(
  workDir: string,
  logsDir: string,
  kind: "agent" | "workflow",
  name: string,
  runId: string,
  siblingNames?: string[],
): string {
  const base = basenameOf(name);
  const collides = siblingNames
    ? siblingNames.filter((n) => basenameOf(n) === base).length > 1
    : false;
  const stem = collides ? name.replace(/\//g, "-") : base;
  return resolve(workDir, logsDir, kind, `${stem}-${runId}.log`);
}
