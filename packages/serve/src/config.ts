import { z } from "zod";

export const ServeConfig = z.object({
  serveDir: z.string().default("serve"),
  port: z.number().int().min(0).max(65535).default(3000),
  host: z.string().default("127.0.0.1"),
  tokenEnv: z.string().default("GENERATA_SERVE_TOKEN"),
  bodyLimitBytes: z.number().int().positive().default(1024 * 1024),
  shutdownTimeoutSec: z.number().int().nonnegative().default(30),
  runStoreDir: z.string().default(".generata/runs"),
});

export type ServeConfig = z.infer<typeof ServeConfig>;

export type ServeCliOverrides = Partial<{
  port: number;
  host: string;
  serveDir: string;
  tokenEnv: string;
  shutdownTimeoutSec: number;
}>;

export function resolveServeConfig(
  fromConfig: z.input<typeof ServeConfig> = {},
  fromCli: ServeCliOverrides = {},
): ServeConfig {
  const merged: Record<string, unknown> = { ...fromConfig };
  for (const [key, value] of Object.entries(fromCli)) {
    if (value !== undefined) merged[key] = value;
  }
  return ServeConfig.parse(merged);
}
