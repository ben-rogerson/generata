import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface LoopManifestItem {
  index: number;
  vars: Record<string, string>;
  status: "ok" | "failed";
  runId: string;
  outputs?: Record<string, string>;
  error?: string;
  attempts?: number;
}

export interface LoopManifest {
  workflow: string;
  step: string;
  subWorkflow: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  source: { kind: "glob" | "json" | "items"; spec: string; count: number };
  concurrency: number;
  onFailure: "halt" | "continue";
  items: LoopManifestItem[];
}

export function loopManifestPath(
  workDir: string,
  workflowName: string,
  stepId: string,
  runId: string,
): string {
  const safeWorkflow = workflowName.replace(/\//g, "-");
  return resolve(workDir, ".generata", "loops", `${safeWorkflow}-${stepId}-${runId}.json`);
}

export function writeManifest(path: string, manifest: LoopManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf8");
}
