import { relative, sep } from "node:path";

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
