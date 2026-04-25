import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { resolveTemplate, type CatalogEntry } from "./resolver.js";
import { loadManifest, TemplateManifest } from "./manifest.js";
import { runPreflight, formatPreflight } from "./preflight.js";
import { generateEnvExample } from "./env-example.js";
import { promptForEnv, writeDotEnv, PromptItem } from "./env-prompt.js";
import { copyTree } from "./copy.js";
import { generateSlashCommands } from "./slash-commands.js";
import { loadTs } from "../ts-loader.js";
import type { AgentDef, WorkflowDef } from "../define.js";
import { fmt } from "../logger.js";

export interface InitOpts {
  spec: string;
  dest: string;
  skipPreflight?: boolean;
  skipInstall?: boolean;
  yes?: boolean;
  force?: boolean;
}

export function printInitUsage(): void {
  console.error("Usage: generata init <template> [dest]");
  try {
    const catalogPath = fileURLToPath(new URL("../../templates.json", import.meta.url));
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Record<string, CatalogEntry>;
    const aliases = Object.keys(catalog);
    if (aliases.length === 0) return;
    console.error("");
    console.error(fmt.bold("Available templates:"));
    for (const alias of aliases) {
      const entry = catalog[alias];
      const url = typeof entry === "string" ? entry : entry.url;
      const subdir = typeof entry === "string" ? undefined : entry.subdir;
      const suffix = subdir ? ` (${subdir})` : "";
      console.error(`  ${alias.padEnd(22)} ${fmt.dim(url + suffix)}`);
    }
    console.error("");
    console.error(`Example: ${fmt.bold(`generata init ${aliases[0]} .`)}`);
  } catch {
    // Catalog read failed - fall back to bare usage line.
  }
}

export async function runInit(opts: InitOpts): Promise<void> {
  const destAbs = isAbsolute(opts.dest) ? opts.dest : resolve(opts.dest);

  console.log(fmt.dim(`[1/7] Resolving template: ${opts.spec}`));
  const tmpl = await resolveTemplate(opts.spec);
  try {
    const manifest = loadManifest(tmpl.dir);
    console.log(fmt.dim(`      ${manifest.name} - ${manifest.description}`));

    if (!opts.skipPreflight) {
      console.log(fmt.dim(`[2/7] Running preflight checks...`));
      const report = await runPreflight(manifest.requiredBins);
      if (!report.ok) {
        console.error(formatPreflight(report));
        throw new Error(
          "Preflight failed. Install missing commands and re-run, or use --skip-preflight to bypass.",
        );
      }
      if (report.optionalMissing.length > 0) {
        console.log(formatPreflight(report));
      }
    }

    console.log(fmt.dim(`[3/7] Walking template files...`));
    const { agentEnvKeys, workflowEnvKeys, workflows } = await scanTemplate(tmpl.dir);

    console.log(fmt.dim(`[4/7] Generating .env.example...`));
    mkdirSync(destAbs, { recursive: true });
    const envExample = generateEnvExample({
      manifestEnv: manifest.requiredEnv,
      agentEnvKeys,
      workflowEnvKeys,
    });
    writeFileSync(join(destAbs, ".env.example"), envExample);

    console.log(fmt.dim(`[5/7] Prompting for env values...`));
    const promptItems = buildPromptItems(manifest, agentEnvKeys, workflowEnvKeys);
    const collected = opts.yes
      ? Object.fromEntries(
          promptItems.filter((i) => i.required).map((i) => [i.key, i.example ?? ""]),
        )
      : await promptForEnv(promptItems, readExistingEnv(destAbs));
    if (Object.keys(collected).length > 0) {
      writeDotEnv(collected, join(destAbs, ".env"));
    }

    console.log(fmt.dim(`[6/7] Copying template files...`));
    const installPaths = withDefaults(manifest.installPaths);
    const force = opts.force ?? false;
    for (const [src, dest] of Object.entries(installPaths)) {
      const srcAbs = resolve(tmpl.dir, src);
      const destSubAbs = resolve(destAbs, dest);
      if (!existsSync(srcAbs)) continue;
      const stat = statSync(srcAbs);
      if (stat.isDirectory()) {
        copyTree({ src: srcAbs, dest: destSubAbs, force, dryRun: false });
      } else {
        if (existsSync(destSubAbs) && !force) {
          throw new Error(
            `File conflict at ${destSubAbs}. Re-run with --force to overwrite.`,
          );
        }
        mkdirSync(join(destSubAbs, ".."), { recursive: true });
        writeFileSync(destSubAbs, readFileSync(srcAbs));
      }
    }

    writeGenerataConfig(destAbs);
    writePackageJson(destAbs, manifest);
    if (opts.skipInstall) {
      console.log(fmt.dim(`      Skipping dependency install (--skip-install)`));
    } else {
      runPmInstall(destAbs);
    }

    console.log(fmt.dim(`[7/7] Generating slash commands...`));
    generateSlashCommands({
      workflows,
      destDir: join(destAbs, ".claude", "commands"),
    });

    if (manifest.postInstall) {
      console.log("\n" + fmt.bold("Next steps:"));
      console.log(manifest.postInstall);
    }
  } finally {
    if (tmpl.cleanup) await tmpl.cleanup();
  }
}

function withDefaults(installPaths: Record<string, string>): Record<string, string> {
  const defaults: Record<string, string> = {
    "agents/": "agents/",
    "skills/": ".claude/skills/",
    "files/": "./",
    "README.md": "README.md",
  };
  return { ...defaults, ...installPaths };
}

async function scanTemplate(dir: string): Promise<{
  agentEnvKeys: Record<string, string[]>;
  workflowEnvKeys: Record<string, string[]>;
  workflows: WorkflowDef[];
}> {
  const agentEnvKeys: Record<string, string[]> = {};
  const workflowEnvKeys: Record<string, string[]> = {};
  const workflows: WorkflowDef[] = [];

  const agentsRoot = resolve(dir, "agents");
  const workflowsRoot = resolve(dir, "agents/workflows");

  function* tsFilesUnder(root: string): IterableIterator<string> {
    if (!existsSync(root)) return;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const full = join(root, entry.name);
      if (entry.isDirectory()) {
        if (resolve(full) === resolve(workflowsRoot)) continue;
        yield* tsFilesUnder(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
        yield full;
      }
    }
  }

  let skipped = 0;

  for (const file of tsFilesUnder(agentsRoot)) {
    let def: AgentDef | undefined;
    try {
      const mod = await loadTs<{ default: AgentDef }>(file, import.meta.url);
      def = mod.default;
    } catch {
      skipped++;
      continue;
    }
    if (!def?.name) continue;
    for (const key of def.envKeys ?? []) {
      (agentEnvKeys[key] ??= []).push(def.name);
    }
  }

  if (existsSync(workflowsRoot)) {
    for (const entry of readdirSync(workflowsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js"))) {
        continue;
      }
      const file = join(workflowsRoot, entry.name);
      let wf: WorkflowDef | undefined;
      try {
        const mod = await loadTs<{ default: WorkflowDef }>(file, import.meta.url);
        wf = mod.default;
      } catch {
        skipped++;
        continue;
      }
      if (!wf?.name) continue;
      workflows.push(wf);
      for (const step of wf.steps ?? []) {
        for (const key of step.agent?.envKeys ?? []) {
          (workflowEnvKeys[key] ??= []).push(wf.name);
        }
      }
    }
  }

  if (skipped > 0) {
    console.log(
      fmt.dim(
        `      Skipped ${skipped} file(s) that could not be loaded (typically a fresh template clone without dependencies). ` +
          `Env keys declared in those files won't appear in .env.example; the workflow precheck will catch any missing vars at run time.`,
      ),
    );
  }

  return { agentEnvKeys, workflowEnvKeys, workflows };
}

function buildPromptItems(
  manifest: TemplateManifest,
  agentEnvKeys: Record<string, string[]>,
  workflowEnvKeys: Record<string, string[]>,
): PromptItem[] {
  const items: PromptItem[] = [];
  const seen = new Set<string>();

  for (const [key, e] of Object.entries(manifest.requiredEnv)) {
    items.push({
      key,
      description: e.description,
      required: !e.optional,
      secret: e.secret,
      example: e.example,
    });
    seen.add(key);
  }

  const all = new Set([...Object.keys(agentEnvKeys), ...Object.keys(workflowEnvKeys)]);
  for (const key of all) {
    if (seen.has(key)) continue;
    const usedBy = [
      ...(agentEnvKeys[key] ?? []).map((a) => `agent ${a}`),
      ...(workflowEnvKeys[key] ?? []).map((w) => `workflow ${w}`),
    ].join(", ");
    items.push({
      key,
      description: `Required by ${usedBy}`,
      required: true,
      secret: false,
    });
  }
  return items;
}

function readExistingEnv(dir: string): Record<string, string> {
  const path = join(dir, ".env");
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, "utf8").split("\n");
  const out: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeGenerataConfig(dest: string): void {
  const anchors = ["generata.config.ts", "generata.config.mjs", "generata.config.js"];
  for (const name of anchors) {
    if (existsSync(join(dest, name))) return;
  }
  const content =
    `import { defineConfig } from "@generata/core";\n` +
    `\n` +
    `export default defineConfig({\n` +
    `  modelTiers: {\n` +
    `    heavy: "claude-opus-4-7",\n` +
    `    standard: "claude-sonnet-4-6",\n` +
    `    light: "claude-haiku-4-5",\n` +
    `  },\n` +
    `  workdir: ${JSON.stringify(dest)},\n` +
    `});\n`;
  writeFileSync(join(dest, "generata.config.ts"), content);
}

function writePackageJson(dest: string, manifest: TemplateManifest): void {
  const path = join(dest, "package.json");
  if (existsSync(path)) return;
  const engineRange = manifest.engineVersion ?? "^1.0.0";
  const pkg = {
    name: dirToPackageName(dest),
    private: true,
    type: "module",
    scripts: {
      agent: "generata agent",
      workflow: "generata workflow",
      validate: "generata validate",
      metrics: "generata metrics",
      "skills:sync": "generata skills sync",
    },
    devDependencies: {
      "@generata/core": engineRange,
    },
  };
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}

function dirToPackageName(dir: string): string {
  const base = dir.split("/").filter(Boolean).pop() ?? "generata-project";
  return base.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function runPmInstall(dest: string): void {
  const pm = detectPm(dest);
  console.log(fmt.dim(`      Installing dependencies via ${pm}...`));
  try {
    execFileSync(pm, ["install"], { cwd: dest, stdio: "inherit" });
  } catch (err) {
    throw new Error(`${pm} install failed: ${(err as Error).message}`);
  }
}

function detectPm(dest: string): string {
  if (existsSync(join(dest, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dest, "yarn.lock"))) return "yarn";
  if (existsSync(join(dest, "package-lock.json"))) return "npm";
  return "pnpm";
}
