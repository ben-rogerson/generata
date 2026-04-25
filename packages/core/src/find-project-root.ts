import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ANCHOR_NAMES = ["generata.config.ts", "generata.config.mjs", "generata.config.js"];

/**
 * Walk up from `startDir` looking for a generata.config.{ts,mjs,js} file.
 * Returns the absolute path of the directory containing the first match.
 * Throws if no anchor is found before reaching the filesystem root.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  while (true) {
    for (const name of ANCHOR_NAMES) {
      if (existsSync(resolve(current, name))) return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `No generata.config.ts found (also checked .mjs and .js)` +
          ` walking up from ${startDir}. ` +
          `Run 'generata init' to scaffold one, or check that you're in a generata project.`,
      );
    }
    current = parent;
  }
}
