import { TemplateManifest } from "./manifest.js";

export interface EnvExampleInput {
  manifestEnv: TemplateManifest["requiredEnv"];
  workflowEnvKeys: Record<string, string[]>;
  agentEnvKeys: Record<string, string[]>;
}

interface Entry {
  key: string;
  description: string;
  required: boolean;
  secret: boolean;
  example?: string;
  fromManifest: boolean;
}

export function generateEnvExample(input: EnvExampleInput): string {
  const entries: Entry[] = [];

  for (const [key, e] of Object.entries(input.manifestEnv)) {
    entries.push({
      key,
      description: e.description,
      required: !e.optional,
      secret: e.secret,
      example: e.example,
      fromManifest: true,
    });
  }

  const allKeys = new Set([
    ...Object.keys(input.workflowEnvKeys),
    ...Object.keys(input.agentEnvKeys),
  ]);
  for (const key of allKeys) {
    if (key in input.manifestEnv) continue;
    const usedByAgents = (input.agentEnvKeys[key] ?? []).sort();
    const usedByWorkflows = (input.workflowEnvKeys[key] ?? []).sort();
    const parts: string[] = [];
    if (usedByAgents.length > 0) parts.push(`agent ${usedByAgents.join(", ")}`);
    if (usedByWorkflows.length > 0) parts.push(`workflow ${usedByWorkflows.join(", ")}`);
    entries.push({
      key,
      description: `Required by ${parts.join(", ")}`,
      required: true,
      secret: false,
      fromManifest: false,
    });
  }

  entries.sort((a, b) => {
    if (a.fromManifest !== b.fromManifest) return a.fromManifest ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  const lines: string[] = [];
  for (const e of entries) {
    const tags: string[] = [];
    if (e.secret) tags.push("[secret]");
    tags.push(e.required ? "[required]" : "[optional]");
    lines.push(`# ${e.description} ${tags.join("")}`);
    lines.push(`${e.key}=${e.example ?? ""}`);
    lines.push("");
  }
  return lines.join("\n");
}
