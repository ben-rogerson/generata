import { existsSync } from "node:fs";
import { join } from "node:path";

export function detectPm(dest: string): string {
  if (existsSync(join(dest, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dest, "yarn.lock"))) return "yarn";
  if (existsSync(join(dest, "package-lock.json"))) return "npm";
  if (existsSync(join(dest, "bun.lockb"))) return "bun";
  // Fresh init: match whatever PM invoked us (npx -> npm, pnpm dlx -> pnpm, etc.)
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("npm")) return "npm";
  return "pnpm";
}
