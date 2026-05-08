import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunState } from "./handler.js";

type WarnLogger = { warn: (...args: unknown[]) => void };

export type RunStore = {
  create: (runId: string) => Promise<Extract<RunState, { status: "pending" }>>;
  complete: (runId: string, result: unknown) => Promise<Extract<RunState, { status: "completed" }>>;
  fail: (
    runId: string,
    error: { code: string; message: string },
  ) => Promise<Extract<RunState, { status: "failed" }>>;
  get: (runId: string) => Promise<RunState | undefined>;
};

export type CreateRunStoreOptions = {
  dir: string;
  logger?: WarnLogger;
  now?: () => string;
};

const defaultLogger: WarnLogger = { warn: (...a) => console.warn(...a) };

export async function createRunStore({
  dir,
  logger = defaultLogger,
  now = () => new Date().toISOString(),
}: CreateRunStoreOptions): Promise<RunStore> {
  await mkdir(dir, { recursive: true });

  const cache = new Map<string, RunState>();

  // Rehydrate from disk
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    entries = [];
  }
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      logger.warn(`run-store: failed to read ${file}: ${(err as Error).message}`);
      continue;
    }
    let parsed: RunState;
    try {
      parsed = JSON.parse(raw) as RunState;
    } catch (err) {
      logger.warn(`run-store: skipping corrupt ${file}: ${(err as Error).message}`);
      continue;
    }
    if (parsed.status === "pending") {
      const orphaned: RunState = {
        runId: parsed.runId,
        status: "failed",
        startedAt: parsed.startedAt,
        finishedAt: now(),
        error: { code: "orphaned", message: "daemon restarted before run completed" },
      };
      cache.set(parsed.runId, orphaned);
      await persist(orphaned);
    } else {
      cache.set(parsed.runId, parsed);
    }
  }

  async function persist(state: RunState): Promise<void> {
    const final = join(dir, `${state.runId}.json`);
    const tmp = `${final}.tmp`;
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, final);
  }

  return {
    async create(runId) {
      const state = { runId, status: "pending", startedAt: now() } as const;
      cache.set(runId, state);
      await persist(state);
      return state;
    },
    async complete(runId, result) {
      const existing = cache.get(runId);
      if (!existing) {
        throw new Error(`run-store: cannot complete unknown runId '${runId}'`);
      }
      const state = {
        runId,
        status: "completed",
        startedAt: existing.startedAt,
        finishedAt: now(),
        result,
      } as const;
      cache.set(runId, state);
      await persist(state);
      return state;
    },
    async fail(runId, error) {
      const existing = cache.get(runId);
      if (!existing) {
        throw new Error(`run-store: cannot fail unknown runId '${runId}'`);
      }
      const state = {
        runId,
        status: "failed",
        startedAt: existing.startedAt,
        finishedAt: now(),
        error,
      } as const;
      cache.set(runId, state);
      await persist(state);
      return state;
    },
    async get(runId) {
      return cache.get(runId);
    },
  };
}
