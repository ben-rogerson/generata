import { readdirSync, mkdirSync, copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * True when both files exist and have byte-identical contents. Used to skip
 * "conflicts" that aren't really conflicts — a re-run that would write the
 * exact same bytes is a no-op, not a reason to abort.
 */
export function filesEqual(a: string, b: string): boolean {
  if (!existsSync(a) || !existsSync(b)) return false;
  return readFileSync(a).equals(readFileSync(b));
}

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
    const conflicts = files.filter((f) => {
      const destFile = join(opts.dest, f);
      if (!existsSync(destFile)) return false;
      // Identical content is not a real conflict.
      return !filesEqual(destFile, join(opts.src, f));
    });
    if (conflicts.length > 0) {
      throw new Error(
        `${conflicts.length} file conflict(s) at ${opts.dest}:\n${conflicts.map((c) => `  ${c}`).join("\n")}\nRe-run with --force to overwrite, or --dry-run to preview.`,
      );
    }
  }

  const written: string[] = [];
  for (const rel of files) {
    const target = join(opts.dest, rel);
    // Skip files that already match — re-running shouldn't churn timestamps.
    if (filesEqual(target, join(opts.src, rel))) continue;
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(join(opts.src, rel), target);
    written.push(rel);
  }
  return { written, wouldWrite: [] };
}
