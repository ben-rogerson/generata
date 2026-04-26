import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findProjectRoot } from "../find-project-root.js";
import { loadConfig } from "../config.js";
import { loadRegistry } from "../registry.js";
import { fmt } from "../logger.js";

const exec = promisify(execFile);

const TOP_LEVEL = `generata <command> [args]

Commands:
  init <template> [dest]      Scaffold a new project from a template
  add <template>              Merge a template into the current project
  agent <name> [args]         Run a single agent
  workflow <name> [args]      Run a workflow (alias: 'run')
  validate [<workflow>|--all] Static-check workflow definitions
  metrics [today|week|...]    Show metrics summary
  skills sync                 Regenerate .claude/commands/ from workflows
  help [topic]                Show help (topics: agents, workflows, env, templates, bins)
`;

export async function runHelp(topic?: string): Promise<void> {
  if (!topic) {
    console.log(TOP_LEVEL);
    return;
  }
  switch (topic) {
    case "agents":
      return helpAgents();
    case "workflows":
      return helpWorkflows();
    case "env":
      return helpEnv();
    case "templates":
      return helpTemplates();
    case "bins":
      return helpBins();
    default:
      console.log(`(No detailed help for '${topic}'. Top-level help:)`);
      console.log(TOP_LEVEL);
  }
}

async function helpAgents(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry({
    projectRoot,
    agentsDir: config.agentsDir,
  });
  console.log(fmt.bold("Installed agents:"));
  for (const a of registry.list()) {
    const tier = "modelTier" in a ? a.modelTier : "n/a";
    console.log(`  ${a.name.padEnd(24)} [${a.type}] [${tier}]  ${a.description}`);
    if (a.envKeys?.length) console.log(`    envKeys: ${a.envKeys.join(", ")}`);
  }
}

async function helpWorkflows(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
  const wfs = registry.listWorkflows();
  if (wfs.length === 0) {
    console.error(fmt.fail(`No workflows found under ${config.agentsDir}/`));
    return;
  }
  console.log(fmt.bold("Installed workflows:"));
  for (const wf of wfs) {
    const required = (wf.required ?? []).join(", ") || "(none)";
    const vars = Object.keys(wf.variables ?? {}).join(", ") || "(none)";
    console.log(`  ${wf.name.padEnd(20)}  ${wf.description}`);
    console.log(`    required: ${required}`);
    console.log(`    variables: ${vars}`);
  }
}

async function helpEnv(): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry({
    projectRoot,
    agentsDir: config.agentsDir,
  });

  const keys = new Map<string, { from: string[] }>();
  for (const agent of registry.list()) {
    for (const k of agent.envKeys ?? []) {
      const e = keys.get(k) ?? { from: [] };
      e.from.push(`agent ${agent.name}`);
      keys.set(k, e);
    }
  }

  console.log(fmt.bold("Env keys referenced by this project:"));
  for (const [k, e] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
    const set = process.env[k] ? "set" : fmt.fail("missing");
    console.log(`  ${k.padEnd(28)} ${set}    (${e.from.join(", ")})`);
  }
}

async function helpTemplates(): Promise<void> {
  const url = new URL("../../templates.json", import.meta.url);
  const catalog = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Record<string, string>;
  console.log(fmt.bold("Built-in template catalog:"));
  for (const [alias, gitUrl] of Object.entries(catalog)) {
    console.log(`  ${alias.padEnd(24)} ${gitUrl}`);
  }
}

async function helpBins(): Promise<void> {
  const checks = ["claude", "git", "node", "pnpm"];
  console.log(fmt.bold("Common command-line tools:"));
  for (const c of checks) {
    let present = false;
    try {
      await exec("which", [c]);
      present = true;
    } catch {}
    console.log(`  ${c.padEnd(12)} ${present ? "found" : fmt.fail("missing")}`);
  }
}
