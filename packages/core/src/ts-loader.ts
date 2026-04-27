import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

/**
 * Dynamically import a TypeScript file at runtime. Used by the registry
 * (loading user agents) and by the workflow loader (loading workflow files).
 *
 * `parentURL` should be `import.meta.url` of the caller so relative paths in
 * the imported file resolve correctly.
 *
 * Uses Node's regular `import()` (which shares the ESM module cache) so that
 * an agent imported transitively by a workflow file is the SAME object as the
 * agent loaded directly by the registry. Names mutated post-load on one
 * reference are visible on the other. Falls back to tsx's isolated `tsImport`
 * when the host hasn't registered tsx (e.g. plain `node` without --import tsx).
 *
 * `tsImport` workaround: when called from an ESM parent, it wraps the module
 * namespace such that `mod.default` is itself `{ default: <real-export> }`
 * instead of the real default export. We detect that pattern and unwrap.
 */
export async function loadTs<T = unknown>(specifier: string, parentURL: string): Promise<T> {
  const url = isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier;
  try {
    return (await import(url)) as T;
  } catch (err) {
    const isTs = specifier.endsWith(".ts") || specifier.endsWith(".tsx");
    const looksLikeMissingTsLoader =
      err instanceof Error &&
      /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION|Cannot find module/i.test(err.message);
    if (!isTs || !looksLikeMissingTsLoader) throw err;

    const mod = (await tsImport(specifier, parentURL)) as { default?: unknown } & Record<
      string,
      unknown
    >;
    if (
      mod &&
      typeof mod === "object" &&
      "default" in mod &&
      mod.default &&
      typeof mod.default === "object" &&
      "default" in (mod.default as object)
    ) {
      return { ...mod, default: (mod.default as { default: unknown }).default } as T;
    }
    return mod as T;
  }
}
