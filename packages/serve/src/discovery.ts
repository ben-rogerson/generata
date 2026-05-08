import { readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadTs } from "@generata/core";
import type { Handler } from "./handler.js";

const KEBAB = /^[a-z][a-z0-9-]*$/;

export type RouteTable = Map<string, Handler>;

export type DiscoverOptions = {
  // Strict mode: throw if any file under serveDir lacks a function default export.
  // Default mode: silently skip files with no default export, but throw if the default export is the wrong shape.
  strict?: boolean;
};

export async function discoverHandlers(
  serveDir: string,
  options: DiscoverOptions = {},
): Promise<RouteTable> {
  let entries: string[];
  try {
    entries = await readdir(serveDir);
  } catch {
    return new Map();
  }

  const table: RouteTable = new Map();

  for (const file of entries) {
    if (!file.endsWith(".ts")) continue;
    if (file.endsWith(".test.ts")) continue;
    if (file.startsWith("_")) continue;

    const full = join(serveDir, file);
    const stats = await stat(full);
    if (!stats.isFile()) continue;

    const name = basename(file, extname(file));
    if (!KEBAB.test(name)) {
      throw new Error(
        `discoverHandlers: '${file}' is not kebab-case. Route names must match ${KEBAB.source}.`,
      );
    }

    const moduleUrl = pathToFileURL(full).href;
    const mod = await loadTs<Record<string, unknown>>(moduleUrl, import.meta.url);
    const def = mod.default;

    if (def === undefined) {
      if (options.strict) {
        throw new Error(`discoverHandlers: '${file}' has no default export`);
      }
      continue;
    }
    if (typeof def !== "function") {
      throw new Error(
        `discoverHandlers: '${file}' default export must be an async function, got ${typeof def}`,
      );
    }
    table.set(name, def as Handler);
  }

  return table;
}
