import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolveTemplate } from "./resolver.js";
import { loadManifest } from "./manifest.js";
import { copyTree } from "./copy.js";
import { generateSlashCommands } from "./slash-commands.js";
import { fmt } from "../logger.js";
import { findProjectRoot } from "../find-project-root.js";
import { loadConfig } from "../config.js";
import { loadTs } from "../ts-loader.js";
import type { WorkflowDef } from "../define.js";

export interface AddOpts {
  spec: string;
  force: boolean;
  dryRun: boolean;
  into?: string;
}

export async function runAdd(opts: AddOpts): Promise<void> {
  const projectRoot = findProjectRoot();
  const config = await loadConfig(projectRoot);
  const targetRoot = opts.into ? resolve(projectRoot, opts.into) : projectRoot;

  console.log(fmt.dim(`Resolving template: ${opts.spec}`));
  const tmpl = await resolveTemplate(opts.spec);
  try {
    const manifest = loadManifest(tmpl.dir);
    console.log(fmt.dim(`  ${manifest.name} - ${manifest.description}`));

    const installPaths = withDefaults(manifest.installPaths, manifest.name);
    const totalWritten: string[] = [];
    const totalWouldWrite: string[] = [];

    for (const [src, dest] of Object.entries(installPaths)) {
      const srcAbs = resolve(tmpl.dir, src);
      const destAbs = resolve(targetRoot, dest);
      if (!existsSync(srcAbs)) continue;
      const stat = statSync(srcAbs);
      if (stat.isDirectory()) {
        const result = copyTree({
          src: srcAbs,
          dest: destAbs,
          force: opts.force,
          dryRun: opts.dryRun,
        });
        totalWritten.push(...result.written);
        totalWouldWrite.push(...result.wouldWrite);
      } else {
        if (!opts.dryRun) {
          if (existsSync(destAbs) && !opts.force) {
            throw new Error(`File conflict at ${destAbs}. Re-run with --force or --dry-run.`);
          }
          mkdirSync(join(destAbs, ".."), { recursive: true });
          writeFileSync(destAbs, readFileSync(srcAbs));
          totalWritten.push(dest);
        } else {
          totalWouldWrite.push(dest);
        }
      }
    }

    if (opts.dryRun) {
      console.log(fmt.bold(`Would write ${totalWouldWrite.length} files:`));
      for (const f of totalWouldWrite) console.log(`  ${f}`);
      return;
    }

    console.log(fmt.dim(`Wrote ${totalWritten.length} files`));

    const workflows = await readWorkflows(projectRoot, config.workflowsDir);
    generateSlashCommands({
      workflows,
      destDir: join(projectRoot, ".claude", "commands"),
    });

    if (manifest.postInstall) {
      console.log("\n" + manifest.postInstall);
    }
  } finally {
    if (tmpl.cleanup) await tmpl.cleanup();
  }
}

function withDefaults(
  installPaths: Record<string, string>,
  manifestName: string,
): Record<string, string> {
  const alias = manifestName.replace(/^@[^/]+\//, "");
  const defaults: Record<string, string> = {
    "agents/": "agents/",
    "skills/": ".claude/skills/",
    "files/": "./",
    "README.md": `README-${alias}.md`,
  };
  return { ...defaults, ...installPaths };
}

async function readWorkflows(projectRoot: string, workflowsDir: string): Promise<WorkflowDef[]> {
  const dir = resolve(projectRoot, workflowsDir);
  if (!existsSync(dir)) return [];
  const out: WorkflowDef[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js"))) continue;
    const mod = await loadTs<{ default: WorkflowDef }>(join(dir, entry.name), import.meta.url);
    if (mod.default?.name) out.push(mod.default);
  }
  return out;
}
