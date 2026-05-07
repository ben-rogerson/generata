export function withDefaults(
  installPaths: Record<string, string>,
  manifestName: string,
): Record<string, string> {
  const alias = templateAlias(manifestName);
  const defaults: Record<string, string> = {
    "agents/": "agents/",
    "skills/": ".claude/skills/",
    "files/": "./",
    "README.md": `README-${alias}.md`,
  };
  return { ...defaults, ...installPaths };
}

export function templateAlias(manifestName: string): string {
  return manifestName.replace(/^@[^/]+\//, "");
}
