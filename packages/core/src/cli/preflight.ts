import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface RequiredBinSpec {
  name: string;
  hint?: string;
  optional: boolean;
}

export interface PreflightReport {
  ok: boolean;
  missing: { name: string; hint?: string }[];
  optionalMissing: { name: string; hint?: string }[];
}

async function isOnPath(name: string): Promise<boolean> {
  try {
    await exec("which", [name]);
    return true;
  } catch {
    return false;
  }
}

export async function runPreflight(bins: RequiredBinSpec[]): Promise<PreflightReport> {
  const missing: { name: string; hint?: string }[] = [];
  const optionalMissing: { name: string; hint?: string }[] = [];
  for (const bin of bins) {
    if (await isOnPath(bin.name)) continue;
    const entry = { name: bin.name, hint: bin.hint };
    if (bin.optional) optionalMissing.push(entry);
    else missing.push(entry);
  }
  return { ok: missing.length === 0, missing, optionalMissing };
}

export function formatPreflight(report: PreflightReport): string {
  const lines: string[] = [];
  if (report.missing.length > 0) {
    lines.push("Missing required commands:");
    for (const m of report.missing) {
      lines.push(`  - ${m.name}${m.hint ? `  (${m.hint})` : ""}`);
    }
  }
  if (report.optionalMissing.length > 0) {
    lines.push("Optional commands not found:");
    for (const m of report.optionalMissing) {
      lines.push(`  - ${m.name}${m.hint ? `  (${m.hint})` : ""}`);
    }
  }
  return lines.join("\n");
}
