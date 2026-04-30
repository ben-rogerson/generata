import { relative, sep } from "node:path";

// Canonical agent/workflow names are kebab-case ASCII: lowercase start, then
// lowercase letters, digits, or hyphens. Underscores are reserved as the
// "private module" prefix and are filtered out by the registry's collectFiles
// before names get here, so a `_`-leading segment reaching this regex is a bug.
const SEGMENT = /^[a-z][a-z0-9-]*$/;

export function deriveName(agentsDir: string, filePath: string): string {
  const rel = relative(agentsDir, filePath).split(sep).join("/");
  const noExt = rel.replace(/\.(ts|js)$/, "");
  for (const segment of noExt.split("/")) {
    if (!SEGMENT.test(segment)) {
      throw new Error(`invalid path segment '${segment}' in ${rel} (must match ${SEGMENT.source})`);
    }
  }
  return noExt;
}
