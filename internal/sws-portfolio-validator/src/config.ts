// Env-driven runtime config, zod-validated at the boundary.
// Everything has a safe default except credentials, which stay optional:
// an existing storage-state file (created via `pnpm auth`) also works.

import { z } from "zod";

const envBool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const EnvSchema = z.object({
  /** Site under test. Override to point at a staging deploy. */
  SWS_BASE_URL: z.url().default("https://simplywall.st"),
  /** Login credentials. Optional when a saved storage state exists. */
  SWS_EMAIL: z.string().optional(),
  SWS_PASSWORD: z.string().optional(),
  /** Where the authenticated browser state is persisted between runs. */
  SWS_STORAGE_STATE: z.string().default(".auth/storage-state.json"),
  /** Direct link to the portfolio to validate. Defaults to the first portfolio on the list page. */
  SWS_PORTFOLIO_URL: z.string().optional(),
  /** Ticker used by the add/adjust/remove mutation journey. */
  SWS_MUTATION_TICKER: z.string().default("BHP"),
  /** Skip the journeys that write to the portfolio (add/adjust/remove). */
  SWS_SKIP_MUTATIONS: envBool(false),
  SWS_HEADLESS: envBool(true),
  /** Relative tolerance (percent) applied on top of display-rounding precision. */
  SWS_TOLERANCE_PCT: z.coerce.number().min(0).default(0.5),
  /** Slow down Playwright actions (ms) when debugging headed. */
  SWS_SLOW_MO_MS: z.coerce.number().min(0).default(0),
  /** Optional chromium binary override (e.g. /opt/pw-browsers/chromium on CI images). */
  SWS_CHROMIUM_PATH: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}
