import { readFile, glob as fsGlob } from "node:fs/promises";
import type { BuiltinPromptArgs } from "../schema.js";

export type EachSource =
  | { glob: string }
  | { json: string }
  | { items: (b: BuiltinPromptArgs) => unknown[] | Promise<unknown[]> };

export async function materialiseSource(
  source: EachSource,
  builtins: BuiltinPromptArgs,
): Promise<unknown[]> {
  if ("glob" in source) {
    const matches: string[] = [];
    // node:fs/promises glob is experimental on Node 22 (stable from Node 24).
    // Emits an ExperimentalWarning at first use - acceptable until v24 is the floor.
    for await (const path of fsGlob(source.glob)) matches.push(path);
    return matches.sort();
  }
  if ("json" in source) {
    let raw: string;
    try {
      raw = await readFile(source.json, "utf8");
    } catch (err) {
      throw new Error(`each.json: cannot read '${source.json}': ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`each.json: '${source.json}' is not valid JSON: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`each.json: '${source.json}' must parse to an array`);
    }
    return parsed;
  }
  // items
  const result = await source.items(builtins);
  if (!Array.isArray(result)) {
    throw new Error(`each.items: function must return an array, got ${typeof result}`);
  }
  return result;
}
