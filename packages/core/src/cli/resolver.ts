import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

export type Specifier =
  | { kind: "catalog"; alias: string }
  | { kind: "github-short"; url: string }
  | { kind: "git-url"; url: string }
  | { kind: "local"; path: string };

export interface ResolvedTemplate {
  dir: string;
  cleanup?: () => Promise<void>;
}

/**
 * Catalog entries support two shapes:
 * - string: the entry is a git URL pointing at a repo whose root contains generata.template.json
 * - object: { url, subdir?, ref? } - clone url, walk into subdir (e.g. monorepo packages),
 *   optionally checkout a tag/branch via ref
 */
export type CatalogEntry = string | { url: string; subdir?: string; ref?: string };

const CATALOG_FILE_URL = new URL("../../templates.json", import.meta.url);

function loadCatalog(): Record<string, CatalogEntry> {
  return JSON.parse(readFileSync(fileURLToPath(CATALOG_FILE_URL), "utf8"));
}

export function classifySpecifier(spec: string): Specifier {
  if (spec.startsWith("@") && spec.includes("/")) return { kind: "catalog", alias: spec };
  if (
    spec.startsWith("git@") ||
    spec.startsWith("https://") ||
    spec.startsWith("git+") ||
    spec.endsWith(".git")
  ) {
    return { kind: "git-url", url: spec };
  }
  if (isAbsolute(spec) || spec.startsWith("./") || spec.startsWith("../")) {
    return { kind: "local", path: spec };
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(spec)) {
    return { kind: "github-short", url: `https://github.com/${spec}.git` };
  }
  return { kind: "local", path: spec };
}

export async function resolveTemplate(spec: string): Promise<ResolvedTemplate> {
  const classified = classifySpecifier(spec);

  if (classified.kind === "catalog") {
    const catalog = loadCatalog();
    const entry = catalog[classified.alias];
    if (!entry) {
      throw new Error(
        `Unknown template alias '${classified.alias}'. Available: ${Object.keys(catalog).join(", ")}`,
      );
    }
    const { url, subdir, ref } =
      typeof entry === "string" ? { url: entry, subdir: undefined, ref: undefined } : entry;
    const cloneUrl = ref ? `${url}@${ref}` : url;
    const cloned = await cloneToTemp(cloneUrl);
    if (!subdir) {
      assertHasManifest(cloned.dir, classified.alias, cloned.cleanup);
      return cloned;
    }
    const resolvedDir = resolvePath(cloned.dir, subdir);
    assertHasManifest(resolvedDir, `${classified.alias} (subdir '${subdir}')`, cloned.cleanup);
    return { dir: resolvedDir, cleanup: cloned.cleanup };
  }

  if (classified.kind === "github-short" || classified.kind === "git-url") {
    const cloned = await cloneToTemp(classified.url);
    assertHasManifest(cloned.dir, classified.url, cloned.cleanup);
    return cloned;
  }

  const abs = resolvePath(classified.path);
  if (!existsSync(join(abs, "generata.template.json"))) {
    throw new Error(`Local template at ${abs} has no generata.template.json`);
  }
  return { dir: abs };
}

function assertHasManifest(
  dir: string,
  label: string,
  cleanup: (() => Promise<void>) | undefined,
): void {
  if (existsSync(join(dir, "generata.template.json"))) return;
  if (cleanup) {
    cleanup().catch(() => {});
  }
  throw new Error(`Template at ${label} has no generata.template.json`);
}

async function cloneToTemp(url: string): Promise<ResolvedTemplate> {
  const dir = mkdtempSync(join(tmpdir(), "generata-tmpl-"));
  const refMatch = url.match(/@([\w.-]+)$/);
  const ref = refMatch ? refMatch[1] : null;
  const cleanUrl = ref ? url.replace(/@[\w.-]+$/, "") : url;
  const args = ref
    ? ["clone", "--depth", "1", "--branch", ref, cleanUrl, dir]
    : ["clone", "--depth", "1", cleanUrl, dir];
  try {
    await exec("git", args, { timeout: 60_000 });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(
      `git clone failed for ${url}: ${(err as Error).message}. Check the URL, your network, and your auth.`,
    );
  }
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
