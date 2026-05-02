import { existsSync } from "node:fs";
import { join } from "node:path";

const LOCKFILE_TO_INSTALL: Array<[string, string[]]> = [
  ["pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]],
  ["package-lock.json", ["npm", "ci"]],
  ["yarn.lock", ["yarn", "install", "--immutable"]],
  ["bun.lockb", ["bun", "install", "--frozen-lockfile"]],
];

export function detectPackageManager(projectRoot: string): string[] | null {
  for (const [lockfile, cmd] of LOCKFILE_TO_INSTALL) {
    if (existsSync(join(projectRoot, lockfile))) return cmd;
  }
  return null;
}
