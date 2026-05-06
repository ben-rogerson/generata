import { fileURLToPath } from "node:url";
import { basename, dirname, resolve, sep } from "node:path";

// Frames in our own dist/ or src/ are framework-internal. We need both even
// when only one is loaded, because tsx (and other loaders) rewrite stack
// frames through sourcemaps - a module loaded from dist/foo.js can produce a
// frame pointing at src/foo.ts. Skipping just the load-time dir would let the
// rewritten sibling slip through and be misread as user code.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SELF_DIRS: string[] = [MODULE_DIR + sep];
{
  const last = basename(MODULE_DIR);
  const sibling = last === "dist" ? "src" : last === "src" ? "dist" : null;
  if (sibling) SELF_DIRS.push(resolve(MODULE_DIR, "..", sibling) + sep);
}

// Stack frames come in two shapes depending on the loader:
//   ESM:  `    at fn (file:///path/file.ts:N:N)` or `    at file:///path/file.ts:N:N`
//   CJS:  `    at fn (/path/file.ts:N:N)`        or `    at /path/file.ts:N:N`
// (tsx uses the CJS loader, hence the path-without-scheme form). Capture the
// resource between the optional fn-name parens, before the line:col suffix.
const FRAME_RE = /^\s*at\s+(?:.+?\s+\()?([^()]+?):\d+:\d+\)?$/;

function frameToPath(resource: string): string | null {
  if (resource.startsWith("file:")) {
    try {
      return fileURLToPath(resource);
    } catch {
      return null;
    }
  }
  // POSIX absolute or Windows drive-letter absolute. Bare relative or virtual
  // resources (e.g. `node:internal/...`) are skipped.
  if (resource.startsWith("/") || /^[A-Za-z]:[\\/]/.test(resource)) {
    return resource;
  }
  return null;
}

// First non-framework frame in the current stack. Returns the resolved
// filesystem path or null if no such frame exists (e.g. invoked from a bundled
// build that lost source paths, or from inside the framework itself).
function findCallerPath(): string | null {
  const stack = new Error().stack;
  if (!stack) return null;

  for (const line of stack.split("\n").slice(1)) {
    const match = line.match(FRAME_RE);
    if (!match) continue;
    const path = frameToPath(match[1]);
    if (!path) continue;
    if (SELF_DIRS.some((d) => path.startsWith(d))) continue;
    return path;
  }
  return null;
}

// Default-name source for programmatic-API callers. The CLI registry stamps
// names from path-relative-to-agentsDir; programmatic callers skip the registry,
// so we walk the stack to find the user's file and use its basename. CLI flow
// overwrites this stamp afterwards, so there's no double-naming.
export function callerName(fallback: string): string {
  const path = findCallerPath();
  if (!path) return fallback;
  return basename(path).replace(/\.(?:ts|tsx|js|mjs|cjs)$/, "");
}

// Default workDir source for defineConfig: the dir holding the user's
// generata.config.ts. Mirrors loadConfig's `dirname(configPath)` for the
// programmatic path, so config-driven file lookups (logsDir, metricsDir,
// agentsDir) resolve relative to the same root the CLI uses.
export function callerDir(): string | null {
  const path = findCallerPath();
  return path ? dirname(path) : null;
}
