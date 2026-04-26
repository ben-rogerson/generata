import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { resolveTemplate, type CatalogEntry } from "./resolver.js";
import { loadManifest, TemplateManifest } from "./manifest.js";
import { runPreflight, formatPreflight } from "./preflight.js";
import { generateEnvExample } from "./env-example.js";
import { promptForEnv, writeDotEnv, PromptItem } from "./env-prompt.js";
import { copyTree, filesEqual } from "./copy.js";
import { generateSlashCommands } from "./slash-commands.js";
import { loadTs } from "../ts-loader.js";
import type { AgentDef, WorkflowDef } from "../define.js";
import { deriveName } from "../derive-name.js";
import { fmt } from "../logger.js";

export interface InitOpts {
  spec: string;
  dest: string;
  skipPreflight?: boolean;
  skipInstall?: boolean;
  yes?: boolean;
  force?: boolean;
}

/**
 * `generata init` with no template: bootstrap the current directory as a generata
 * project (write a default config if absent), then list the catalog so the user
 * can pick a template to add next.
 */
export async function runBareInit(cwd: string): Promise<void> {
  const destAbs = isAbsolute(cwd) ? cwd : resolve(cwd);
  mkdirSync(destAbs, { recursive: true });
  const wrote = writeGenerataConfig(destAbs);
  if (wrote) {
    console.log(fmt.dim(`Wrote ${join(destAbs, "generata.config.ts")}`));
  } else {
    console.log(fmt.dim(`generata.config.* already present in ${destAbs}`));
  }

  try {
    const catalogPath = fileURLToPath(new URL("../../templates.json", import.meta.url));
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Record<string, CatalogEntry>;
    const aliases = Object.keys(catalog);
    if (aliases.length > 0) {
      console.log("");
      console.log(fmt.bold("Available templates:"));
      for (const alias of aliases) {
        const entry = catalog[alias];
        const url = typeof entry === "string" ? entry : entry.url;
        const subdir = typeof entry === "string" ? undefined : entry.subdir;
        const suffix = subdir ? ` (${subdir})` : "";
        console.log(`  ${alias.padEnd(22)} ${fmt.dim(url + suffix)}`);
      }
      console.log("");
      console.log(`Add one with: ${fmt.bold(`generata add ${aliases[0]}`)}`);
    }
  } catch {
    // Catalog read failed - skip the listing.
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

    console.log(fmt.dim(`[3/7] Copying template files...`));
    mkdirSync(destAbs, { recursive: true });
    const installPaths = withDefaults(manifest.installPaths, manifest.name);
    const force = opts.force ?? false;
    for (const [src, dest] of Object.entries(installPaths)) {
      const srcAbs = resolve(tmpl.dir, src);
      const destSubAbs = resolve(destAbs, dest);
      if (!existsSync(srcAbs)) continue;
      const stat = statSync(srcAbs);
      if (stat.isDirectory()) {
        copyTree({ src: srcAbs, dest: destSubAbs, force, dryRun: false });
      } else {
        if (existsSync(destSubAbs)) {
          // Identical content is a no-op, not a conflict.
          if (filesEqual(destSubAbs, srcAbs)) continue;
          if (!force) {
            throw new Error(
              `File conflict at ${destSubAbs}. Re-run with --force to overwrite.`,
            );
          }
        }
        mkdirSync(join(destSubAbs, ".."), { recursive: true });
        writeFileSync(destSubAbs, readFileSync(srcAbs));
      }
    }

    writeGenerataConfig(destAbs);
    writePackageJson(destAbs, manifest);
    if (opts.skipInstall) {
      console.log(fmt.dim(`[4/7] Skipping dependency install (--skip-install)`));
    } else {
      console.log(fmt.dim(`[4/7] Installing dependencies...`));
      runPmInstall(destAbs);
    }

    console.log(fmt.dim(`[5/7] Walking template files...`));
    const { agentEnvKeys, workflowEnvKeys, workflows, failureCount } = await scanTemplate(destAbs);

    console.log(fmt.dim(`[6/7] Generating .env.example and prompting for values...`));
    const envExample = generateEnvExample({
      manifestEnv: manifest.requiredEnv,
      agentEnvKeys,
      workflowEnvKeys,
    });
    if (envExample.trim()) {
      writeFileSync(join(destAbs, ".env.example"), envExample);
    } else {
      console.log(fmt.dim(`      No env vars declared - skipping .env.example`));
    }
    const promptItems = buildPromptItems(manifest, agentEnvKeys, workflowEnvKeys);
    const collected = opts.yes
      ? Object.fromEntries(
          promptItems.filter((i) => i.required).map((i) => [i.key, i.example ?? ""]),
        )
      : await promptForEnv(promptItems, readExistingEnv(destAbs));
    if (Object.keys(collected).length > 0) {
      writeDotEnv(collected, join(destAbs, ".env"));
    }

    console.log(fmt.dim(`[7/7] Generating slash commands...`));
    generateSlashCommands({
      workflows,
      destDir: join(destAbs, ".claude", "commands"),
    });

    if (failureCount > 0) {
      console.log(
        "\n" +
          fmt.fail(
            `Template files failed to load - skipping post-install instructions. Fix the errors above and re-run.`,
          ),
      );
    } else if (manifest.postInstall) {
      console.log("\n" + fmt.bold("Next steps:"));
      console.log(manifest.postInstall);
    }
  } finally {
    if (tmpl.cleanup) await tmpl.cleanup();
  }
}

function withDefaults(
  installPaths: Record<string, string>,
  manifestName: string,
): Record<string, string> {
  const alias = templateAlias(manifestName);
  const defaults: Record<string, string> = {
    "agents/": "agents/",
    "skills/": ".claude/skills/",
    "files/": "./",
    "README.md": `README-${alias}.md`,
  };
  return { ...defaults, ...installPaths };
}

export function templateAlias(manifestName: string): string {
  return manifestName.replace(/^@[^/]+\//, "");
}

async function scanTemplate(dir: string): Promise<{
  agentEnvKeys: Record<string, string[]>;
  workflowEnvKeys: Record<string, string[]>;
  workflows: WorkflowDef[];
  failureCount: number;
}> {
  const agentEnvKeys: Record<string, string[]> = {};
  const workflowEnvKeys: Record<string, string[]> = {};
  const workflows: WorkflowDef[] = [];

  const agentsRoot = resolve(dir, "agents");

  function* tsFilesUnder(root: string): IterableIterator<string> {
    if (!existsSync(root)) return;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const full = join(root, entry.name);
      if (entry.isDirectory()) {
        yield* tsFilesUnder(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) {
        yield full;
      }
    }
  }

  const failures: Array<{ file: string; error: string }> = [];

  for (const file of tsFilesUnder(agentsRoot)) {
    let def: AgentDef | WorkflowDef | undefined;
    try {
      const mod = await loadTs<{ default: AgentDef | WorkflowDef }>(file, import.meta.url);
      def = mod.default;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).trim();
      failures.push({ file: file.slice(dir.length + 1), error: message });
      continue;
    }
    if (!def) continue;
    const name = deriveName(agentsRoot, file);
    if (def.kind === "agent") {
      for (const key of def.envKeys ?? []) {
        (agentEnvKeys[key] ??= []).push(name);
      }
    } else if (def.kind === "workflow") {
      (def as unknown as { name: string }).name = name;
      workflows.push(def);
      for (const step of def.steps ?? []) {
        for (const key of step.agent?.envKeys ?? []) {
          (workflowEnvKeys[key] ??= []).push(name);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.log(fmt.fail(`      Failed to load ${failures.length} file(s):`));
    for (const { file, error } of failures) {
      console.log(fmt.dim(`        ${file}:`));
      for (const line of error.split("\n")) {
        console.log(fmt.dim(`          ${line}`));
      }
    }
    console.log(
      fmt.dim(`      The template may be incompatible with this engine version.`),
    );
  }

  return { agentEnvKeys, workflowEnvKeys, workflows, failureCount: failures.length };
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

function writeGenerataConfig(dest: string): boolean {
  const anchors = ["generata.config.ts", "generata.config.mjs", "generata.config.js"];
  for (const name of anchors) {
    if (existsSync(join(dest, name))) return false;
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
    `});\n`;
  writeFileSync(join(dest, "generata.config.ts"), content);
  return true;
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
  // Fresh init: match whatever PM invoked us (npx -> npm, pnpm dlx -> pnpm, etc.)
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("npm")) return "npm";
  return "pnpm";
}
