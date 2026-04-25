import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { findProjectRoot } from "./find-project-root.js";
import { loadTs } from "./ts-loader.js";
import { GlobalConfig } from "./schema.js";

const cache = new Map<string, GlobalConfig>();

const ANCHOR_NAMES = ["generata.config.ts", "generata.config.mjs", "generata.config.js"];

/**
 * Load the project's `generata.config.{ts,mjs,js}` from `projectRoot`.
 * If `projectRoot` is omitted, it is discovered via `findProjectRoot()`.
 * Cached per resolved config path.
 */
export async function loadConfig(projectRoot?: string): Promise<GlobalConfig> {
  const root = projectRoot ?? findProjectRoot();

  let configPath: string | null = null;
  for (const name of ANCHOR_NAMES) {
    const candidate = resolve(root, name);
    if (existsSync(candidate)) {
      configPath = candidate;
      break;
    }
  }
  if (!configPath) {
    throw new Error(`No generata.config.{ts,mjs,js} in ${root}`);
  }

  const cached = cache.get(configPath);
  if (cached) return cached;

  const mod = await loadTs<{ default: GlobalConfig }>(configPath, import.meta.url);
  const parsed = GlobalConfig.parse(mod.default);
  cache.set(configPath, parsed);
  return parsed;
}
