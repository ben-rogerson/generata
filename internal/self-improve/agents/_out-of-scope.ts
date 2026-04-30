// Single source of truth for paths the code-writer cannot touch in the
// self-improve workflow. The writer halts on these; the reviewer must not
// reject for their absence in the diff (they are added later by /ship).

export interface OutOfScopePath {
  pattern: string;
  note?: string;
  deferredTo?: "ship";
}

export const OUT_OF_SCOPE_PATHS: OutOfScopePath[] = [
  { pattern: "`.changeset/` or any `CHANGELOG.md`", deferredTo: "ship" },
  {
    pattern:
      '`package.json` version fields (any package - the `"version"` key only; other fields are fine in package-level files)',
  },
  { pattern: "`.github/workflows/`" },
  { pattern: "`internal/self-improve/` (the workflow does not improve itself in v1)" },
  {
    pattern:
      "Root-level `package.json` (entire file - changing scripts/engines/packageManager has monorepo-wide blast radius)",
  },
  {
    pattern:
      "`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.env`, `.env.*`, root `tsconfig.json`, root `tsconfig.base.json`",
  },
];

export const SHIP_DEFERRED_PATHS = OUT_OF_SCOPE_PATHS.filter((p) => p.deferredTo === "ship");

export function renderOutOfScopeList(): string {
  return OUT_OF_SCOPE_PATHS.map((p) => `   - ${p.pattern}`).join("\n");
}

export function renderShipDeferredList(): string {
  return SHIP_DEFERRED_PATHS.map((p) => `\`${p.pattern.split("`")[1]}\``).join(", ");
}
