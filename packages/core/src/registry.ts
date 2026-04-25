import { AgentDef } from "./schema.js";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadTs } from "./ts-loader.js";
import { deriveName } from "./derive-name.js";

export interface AgentRegistry {
  agents: Map<string, AgentDef>;
  list(): AgentDef[];
  get(name: string): AgentDef;
  has(name: string): boolean;
  byType(type: AgentDef["type"]): AgentDef[];
}

interface RegistryOpts {
  projectRoot: string;
  agentsDir: string;
  workflowsDir: string;
}

async function collectAgentFiles(dir: string, skipAbs: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (resolve(full) === skipAbs) continue;
      files.push(...(await collectAgentFiles(full, skipAbs)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function validateAgentDef(def: AgentDef): void {
  if (def.type === "supervisor") {
    const writeTools = def.tools.filter((t) => ["write", "edit", "bash"].includes(t));
    if (writeTools.length > 0) {
      throw new Error(
        `Agent '${def.name}' is type 'supervisor' but has write tools [${writeTools.join(", ")}] - supervisors must not have write access`,
      );
    }
  }
}

function makeRegistry(agents: Map<string, AgentDef>): AgentRegistry {
  return {
    agents,
    list: () => [...agents.values()],
    get: (name) => {
      const def = agents.get(name);
      if (!def) {
        throw new Error(`Agent '${name}' not found. Available: ${[...agents.keys()].join(", ")}`);
      }
      return def;
    },
    has: (name) => agents.has(name),
    byType: (type) => [...agents.values()].filter((a) => a.type === type),
  };
}

export function resolveAgentName(input: string, candidates: string[]): string {
  if (candidates.includes(input)) return input;
  const matches = candidates.filter((c) => basename(c) === input);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Ambiguous '${input}'. Did you mean: ${matches.join(", ")}?`);
  }
  throw new Error(`'${input}' not found. Available: ${candidates.join(", ")}`);
}

export async function loadSingleAgentRegistry(
  name: string,
  opts: RegistryOpts,
): Promise<AgentRegistry> {
  const agentsAbs = resolve(opts.projectRoot, opts.agentsDir);
  const workflowsAbs = resolve(opts.projectRoot, opts.workflowsDir);
  const filePaths = existsSync(agentsAbs) ? await collectAgentFiles(agentsAbs, workflowsAbs) : [];

  const candidates = filePaths.map((fp) => ({
    name: deriveName(agentsAbs, fp),
    path: fp,
  }));
  const resolved = resolveAgentName(
    name,
    candidates.map((c) => c.name),
  );
  const match = candidates.find((c) => c.name === resolved)!;

  const mod = await loadTs<{ default: AgentDef }>(match.path, import.meta.url);
  const def = mod.default;
  if (!def) throw new Error(`Agent file ${match.path} has no default export`);
  (def as unknown as { name: string }).name = resolved;
  validateAgentDef(def);
  return makeRegistry(new Map([[resolved, def]]));
}

export async function loadRegistry(opts: RegistryOpts): Promise<AgentRegistry> {
  const agents = new Map<string, AgentDef>();
  const agentsAbs = resolve(opts.projectRoot, opts.agentsDir);
  const workflowsAbs = resolve(opts.projectRoot, opts.workflowsDir);
  const filePaths = existsSync(agentsAbs) ? await collectAgentFiles(agentsAbs, workflowsAbs) : [];

  for (const filePath of filePaths) {
    const derived = deriveName(agentsAbs, filePath);
    const mod = await loadTs<{ default: AgentDef }>(filePath, import.meta.url);
    const def = mod.default;
    if (!def) continue;
    (def as unknown as { name: string }).name = derived;
    if (agents.has(derived)) {
      throw new Error(
        `Duplicate agent name '${derived}' found in ${filePath} - already registered`,
      );
    }
    validateAgentDef(def);
    agents.set(derived, def);
  }

  return makeRegistry(agents);
}
