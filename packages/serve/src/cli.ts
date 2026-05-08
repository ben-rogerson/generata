import { resolve } from "node:path";
import { findProjectRoot, loadTs } from "@generata/core";
import { discoverHandlers } from "./discovery.js";
import { createBearerAuth } from "./auth.js";
import { createRunStore } from "./run-store.js";
import { createServer } from "./server.js";
import { resolveServeConfig, type ServeCliOverrides } from "./config.js";

export type CliFlags = ServeCliOverrides & { help?: boolean };

const HELP = `generata-serve - HTTP server for Generata workflow handlers

Usage: generata-serve [options]

Options:
  --port <number>          Listen port (default 3000)
  --host <string>          Listen host (default 127.0.0.1)
  --serve-dir <path>       Override serveDir from generata.config.ts
  --token-env <name>       Env var name for the auth token (default GENERATA_SERVE_TOKEN)
  --shutdown-timeout <s>   Drain timeout on SIGTERM (default 30)
  --help                   Show this help
`;

export function parseCliArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
      i += 1;
      continue;
    }
    const value = argv[i + 1];
    switch (arg) {
      case "--port": {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new Error(`Invalid --port: ${value}`);
        flags.port = n;
        i += 2;
        break;
      }
      case "--host":
        flags.host = value;
        i += 2;
        break;
      case "--serve-dir":
        flags.serveDir = value;
        i += 2;
        break;
      case "--token-env":
        flags.tokenEnv = value;
        i += 2;
        break;
      case "--shutdown-timeout": {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new Error(`Invalid --shutdown-timeout: ${value}`);
        flags.shutdownTimeoutSec = n;
        i += 2;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return flags;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const flags = parseCliArgs(argv);
  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }

  const projectRoot = findProjectRoot();
  const userConfigPath = resolve(projectRoot, "generata.config.ts");

  type ConfigShape = { default?: { serve?: unknown } } | { serve?: unknown };
  let serveBlock: unknown = {};
  try {
    const mod = await loadTs<ConfigShape>(userConfigPath, import.meta.url);
    const cfg = "default" in mod && mod.default ? mod.default : mod;
    serveBlock = (cfg as { serve?: unknown }).serve ?? {};
  } catch {
    // No generata.config.ts or no serve block - use defaults.
  }

  const cfg = resolveServeConfig(serveBlock as never, flags);

  const token = process.env[cfg.tokenEnv];
  if (!token) {
    process.stderr.write(
      `generata-serve: env var ${cfg.tokenEnv} is not set. Pass --token-env <NAME> to read a different variable.\n`,
    );
    process.exit(1);
  }

  const serveDir = resolve(projectRoot, cfg.serveDir);
  const runStoreDir = resolve(projectRoot, cfg.runStoreDir);

  const routes = await discoverHandlers(serveDir);
  const auth = createBearerAuth({ token });
  const runStore = await createRunStore({ dir: runStoreDir });
  const server = createServer({
    routes,
    auth,
    runStore,
    bodyLimitBytes: cfg.bodyLimitBytes,
  });

  await server.listen(cfg.port, cfg.host);
  process.stdout.write(
    `generata-serve listening on http://${cfg.host}:${cfg.port} (${routes.size} routes)\n`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\ngenerata-serve: received ${signal}, draining...\n`);
    await server.drain(cfg.shutdownTimeoutSec);
    await server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`generata-serve: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
