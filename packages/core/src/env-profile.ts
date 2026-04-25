export type ResolvedEnv = Record<string, string>;

export class EnvProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvProfileError";
  }
}

export function resolveEnvProfile(
  envKeys: readonly string[],
  profile: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedEnv {
  if (envKeys.length === 0) return {};
  const prefix = profile ? `${profile.toUpperCase()}_` : "";
  const resolved: ResolvedEnv = {};
  const missing: string[] = [];
  for (const key of envKeys) {
    const sourceName = `${prefix}${key}`;
    const value = env[sourceName];
    if (!value) {
      missing.push(sourceName);
      continue;
    }
    resolved[key] = value;
  }
  if (missing.length > 0) {
    const profileLabel = profile ? `profile "${profile}"` : "default profile (no --profile flag)";
    throw new EnvProfileError(
      `Missing required env vars for ${profileLabel}: ${missing.join(", ")}`,
    );
  }
  return resolved;
}
