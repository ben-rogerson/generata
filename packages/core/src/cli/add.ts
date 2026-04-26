import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolveTemplate } from "./resolver.js";
import { loadManifest } from "./manifest.js";
import { copyTree, filesEqual } from "./copy.js";
import { generateSlashCommands } from "./slash-commands.js";
import { fmt } from "../logger.js";
import { findProjectRoot } from "../find-project-root.js";
import { loadConfig } from "../config.js";
import { loadRegistry } from "../registry.js";

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
          if (existsSync(destAbs)) {
            // Identical content is a no-op, not a conflict.
            if (filesEqual(destAbs, srcAbs)) continue;
            if (!opts.force) {
              throw new Error(`File conflict at ${destAbs}. Re-run with --force or --dry-run.`);
            }
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

    const registry = await loadRegistry({ projectRoot, agentsDir: config.agentsDir });
    generateSlashCommands({
      workflows: registry.listWorkflows(),
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

