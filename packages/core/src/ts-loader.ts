import { tsImport } from "tsx/esm/api";

/**
 * Dynamically import a TypeScript file at runtime. Used by the registry
 * (loading user agents) and by the workflow loader (loading workflow files).
 *
 * `parentURL` should be `import.meta.url` of the caller so relative paths in
 * the imported file resolve correctly.
 *
 * Workaround: when called from an ESM parent, `tsImport` wraps the module
 * namespace such that `mod.default` is itself `{ default: <real-export> }`
 * instead of the real default export. We detect that pattern and unwrap.
 */
export async function loadTs<T = unknown>(specifier: string, parentURL: string): Promise<T> {
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
