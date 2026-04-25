import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface CopyTreeOpts {
  src: string;
  dest: string;
  force: boolean;
  dryRun: boolean;
}

export interface CopyTreeResult {
  written: string[];
  wouldWrite: string[];
}

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full));
    }
  }
  return out;
}

export function copyTree(opts: CopyTreeOpts): CopyTreeResult {
  if (!existsSync(opts.src) || !statSync(opts.src).isDirectory()) {
    throw new Error(`copy source ${opts.src} is not a directory`);
  }
  const files = walk(opts.src, opts.src);

  if (opts.dryRun) {
    return { written: [], wouldWrite: files };
  }

  if (!opts.force) {
    const conflicts = files.filter((f) => existsSync(join(opts.dest, f)));
    if (conflicts.length > 0) {
      throw new Error(
        `${conflicts.length} file conflict(s) at ${opts.dest}:\n${conflicts.map((c) => `  ${c}`).join("\n")}\nRe-run with --force to overwrite, or --dry-run to preview.`,
      );
    }
  }

  const written: string[] = [];
  for (const rel of files) {
    const target = join(opts.dest, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(join(opts.src, rel), target);
    written.push(rel);
  }
  return { written, wouldWrite: [] };
}
