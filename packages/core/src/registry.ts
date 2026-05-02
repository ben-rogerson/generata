import { AgentDef, WorkflowDef } from "./schema.js";
import { readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadTs } from "./ts-loader.js";
import { deriveName } from "./derive-name.js";

export interface AgentRegistry {
  agents: Map<string, AgentDef>;
  workflows: Map<string, WorkflowDef>;
  list(): AgentDef[];
  get(name: string): AgentDef;
  has(name: string): boolean;
  byType(type: AgentDef["type"]): AgentDef[];
  getWorkflow(name: string): WorkflowDef;
  hasWorkflow(name: string): boolean;
  listWorkflows(): WorkflowDef[];
}

interface RegistryOpts {
  projectRoot: string;
  agentsDir: string;
}

// Files and directories prefixed with `_` are treated as private/shared modules
// and skipped by the loader. Use this for utilities imported by sibling agents
// (e.g. `_out-of-scope.ts`) without exposing them as agents themselves.
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function makeRegistry(
  agents: Map<string, AgentDef>,
  workflows: Map<string, WorkflowDef>,
): AgentRegistry {
  return {
    agents,
    workflows,
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
    getWorkflow: (name) => {
      const def = workflows.get(name);
      if (!def) {
        throw new Error(
          `Workflow '${name}' not found. Available: ${[...workflows.keys()].join(", ")}`,
        );
      }
      return def;
    },
    hasWorkflow: (name) => workflows.has(name),
    listWorkflows: () => [...workflows.values()],
  };
}

export async function listAllNames(opts: RegistryOpts): Promise<string[]> {
  const agentsAbs = resolve(opts.projectRoot, opts.agentsDir);
  const filePaths = existsSync(agentsAbs) ? await collectFiles(agentsAbs) : [];
  return filePaths.map((fp) => deriveName(agentsAbs, fp));
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
  const filePaths = existsSync(agentsAbs) ? await collectFiles(agentsAbs) : [];
  const candidates = filePaths.map((fp) => ({ name: deriveName(agentsAbs, fp), path: fp }));

  const resolved = resolveAgentName(
    name,
    candidates.map((c) => c.name),
  );
  const match = candidates.find((c) => c.name === resolved)!;

  const mod = await loadTs<{ default: AgentDef | WorkflowDef }>(match.path, import.meta.url);
  const def = mod.default as AgentDef & { kind?: string };
  if (!def || def.kind !== "agent") {
    throw new Error(
      `'${resolved}' is not an agent (found in ${relative(opts.projectRoot, match.path)})`,
    );
  }
  (def as unknown as { name: string }).name = resolved;
  return makeRegistry(new Map([[resolved, def]]), new Map());
}

export async function loadRegistry(opts: RegistryOpts): Promise<AgentRegistry> {
  const agents = new Map<string, AgentDef>();
  const workflows = new Map<string, WorkflowDef>();
  const agentsAbs = resolve(opts.projectRoot, opts.agentsDir);
  const filePaths = existsSync(agentsAbs) ? await collectFiles(agentsAbs) : [];

  for (const filePath of filePaths) {
    const derived = deriveName(agentsAbs, filePath);
    const mod = await loadTs<{ default: (AgentDef | WorkflowDef) & { kind?: string } }>(
      filePath,
      import.meta.url,
    );
    const def = mod.default;
    if (!def) continue;
    (def as unknown as { name: string }).name = derived;
    if (def.kind === "agent") {
      if (agents.has(derived)) {
        throw new Error(`Duplicate agent name '${derived}' in ${filePath}`);
      }
      agents.set(derived, def as AgentDef);
    } else if (def.kind === "workflow") {
      if (workflows.has(derived)) {
        throw new Error(`Duplicate workflow name '${derived}' in ${filePath}`);
      }
      workflows.set(derived, def as WorkflowDef);
    } else {
      console.warn(`Skipping ${filePath}: default export is not an agent or workflow`);
    }
  }

  return makeRegistry(agents, workflows);
}
