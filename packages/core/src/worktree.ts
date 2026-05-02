import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import type { WorkflowDef, WorktreeConfig } from "./schema.js";
import { startSpinner } from "./logger.js";

const LOCKFILE_TO_INSTALL: Array<[string, string[]]> = [
  ["pnpm-lock.yaml", ["pnpm", "install", "--frozen-lockfile"]],
  ["package-lock.json", ["npm", "ci"]],
  ["yarn.lock", ["yarn", "install", "--immutable"]],
  ["bun.lockb", ["bun", "install", "--frozen-lockfile"]],
];

export function detectPackageManager(projectRoot: string): string[] | null {
  for (const [lockfile, cmd] of LOCKFILE_TO_INSTALL) {
    if (existsSync(join(projectRoot, lockfile))) return cmd;
  }
  return null;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WorktreeBackend {
  exec(cmd: string[], opts: { cwd: string }): Promise<ExecResult>;
  ensurePathExists(path: string, asDir: boolean): void;
  removePath(path: string): void;
  symlink(target: string, linkPath: string): void;
  pathExistsAsDir(path: string): boolean | null;
}

export const realBackend: WorktreeBackend = {
  exec(cmd, opts) {
    return new Promise<ExecResult>((res) => {
      const [bin, ...rest] = cmd;
      const proc = spawn(bin, rest, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (b) => (stdout += b.toString()));
      proc.stderr.on("data", (b) => (stderr += b.toString()));
      proc.on("close", (code) => res({ stdout, stderr, exitCode: code ?? 1 }));
      proc.on("error", (err) => res({ stdout, stderr: stderr + String(err), exitCode: 1 }));
    });
  },
  ensurePathExists(path, asDir) {
    try {
      statSync(path);
      return;
    } catch {}
    if (asDir) {
      mkdirSync(path, { recursive: true });
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "");
    }
  },
  removePath(path) {
    rmSync(path, { recursive: true, force: true });
  },
  symlink(target, linkPath) {
    mkdirSync(dirname(linkPath), { recursive: true });
    symlinkSync(target, linkPath);
  },
  pathExistsAsDir(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return null;
    }
  },
};

export interface StubBackend extends WorktreeBackend {
  calls: Array<{ cmd: string[]; cwd: string }>;
  fsOps: Array<
    | { kind: "ensure"; path: string; asDir: boolean }
    | { kind: "remove"; path: string }
    | { kind: "symlink"; target: string; linkPath: string }
  >;
  failOn(cmd: string[], result: Partial<ExecResult>): void;
  setExistsAsDir(path: string, value: boolean | null): void;
}

export function makeStubBackend(): StubBackend {
  const calls: StubBackend["calls"] = [];
  const fsOps: StubBackend["fsOps"] = [];
  const failures = new Map<string, Partial<ExecResult>>();
  const existsMap = new Map<string, boolean | null>();
  const key = (cmd: string[]) => cmd.join(" ");
  return {
    calls,
    fsOps,
    async exec(cmd, opts) {
      calls.push({ cmd, cwd: opts.cwd });
      const fail = failures.get(key(cmd));
      if (fail) return { stdout: "", stderr: "", exitCode: 1, ...fail };
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    ensurePathExists(path, asDir) {
      fsOps.push({ kind: "ensure", path, asDir });
    },
    removePath(path) {
      fsOps.push({ kind: "remove", path });
    },
    symlink(target, linkPath) {
      fsOps.push({ kind: "symlink", target, linkPath });
    },
    pathExistsAsDir(path) {
      return existsMap.has(path) ? existsMap.get(path)! : null;
    },
    failOn(cmd, result) {
      failures.set(key(cmd), result);
    },
    setExistsAsDir(path, value) {
      existsMap.set(path, value);
    },
  };
}

export interface SetupWorktreeOptions {
  workflow: WorkflowDef;
  config: WorktreeConfig;
  mainProjectRoot: string;
  workDir: string;
  runId: string;
  logsDir: string;
  metricsDir: string;
  backend?: WorktreeBackend;
}

export interface SetupWorktreeResult {
  worktreePath: string;
  executionRoot: string;
  cleanup: () => Promise<void>;
}

export async function setupWorktree(opts: SetupWorktreeOptions): Promise<SetupWorktreeResult> {
  const backend = opts.backend ?? realBackend;
  const branchName = `generata/wt-${opts.runId}`;
  const worktreePath = resolveWorktreePath(opts);

  // 1. Fetch origin/main
  const stopFetch = startSpinner("worktree: fetching origin/main");
  const fetched = await backend.exec(["git", "fetch", "origin", "main"], {
    cwd: opts.mainProjectRoot,
  });
  stopFetch();
  if (fetched.exitCode !== 0) {
    throw new Error(
      `isolation: "worktree" requires an 'origin' remote with a 'main' branch. ` +
        `'git fetch origin main' failed: ${fetched.stderr.trim() || "(no stderr)"}`,
    );
  }

  // 2. git worktree add -b <branch> <path> origin/main
  const stopAdd = startSpinner(`worktree: creating ${relative(opts.mainProjectRoot, worktreePath)}`);
  const added = await backend.exec(
    ["git", "worktree", "add", "-b", branchName, worktreePath, "origin/main"],
    { cwd: opts.mainProjectRoot },
  );
  stopAdd();
  if (added.exitCode !== 0) {
    throw new Error(
      `git worktree add failed: ${added.stderr.trim()}. ` +
        `If a stale worktree at ${worktreePath} exists, run 'generata worktree prune'.`,
    );
  }

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await backend.exec(["git", "worktree", "remove", "--force", worktreePath], {
      cwd: opts.mainProjectRoot,
    });
    await backend.exec(["git", "branch", "-D", branchName], { cwd: opts.mainProjectRoot });
  };

  try {
    // 3. Compute executionRoot
    const workDirRelToRepo = relative(opts.mainProjectRoot, opts.workDir);
    const executionRoot = workDirRelToRepo ? `${worktreePath}/${workDirRelToRepo}` : worktreePath;

    // 4. Materialise symlinks for logsDir, metricsDir, and sharedPaths
    const allEntries: Array<{ entry: string; asDir: boolean }> = [
      { entry: opts.logsDir, asDir: true },
      { entry: opts.metricsDir, asDir: true },
      ...(opts.config.sharedPaths ?? []).map((p) => ({
        entry: p.endsWith("/") ? p.slice(0, -1) : p,
        asDir: p.endsWith("/"),
      })),
    ];
    for (const { entry, asDir: defaultAsDir } of allEntries) {
      const mainSide = `${opts.workDir}/${entry}`;
      const worktreeSide = `${executionRoot}/${entry}`;
      const existing = backend.pathExistsAsDir(mainSide);
      const asDir = existing === null ? defaultAsDir : existing;
      backend.ensurePathExists(mainSide, asDir);
      backend.removePath(worktreeSide);
      backend.symlink(mainSide, worktreeSide);
    }

    // 5. Run worktreeSetup (or detected install)
    const installCmd = opts.config.worktreeSetup ?? detectPackageManager(worktreePath);
    if (installCmd) {
      const stopInstall = startSpinner(`worktree: ${installCmd.join(" ")}`);
      const installed = await backend.exec(installCmd, { cwd: worktreePath });
      stopInstall();
      if (installed.exitCode !== 0) {
        throw new Error(
          `worktreeSetup '${installCmd.join(" ")}' failed (exit ${installed.exitCode}): ${installed.stderr.trim()}`,
        );
      }
    } else if (!opts.config.worktreeSetup) {
      console.warn(
        `[worktree] no worktreeSetup configured and no recognised lockfile in ${worktreePath} - skipping install. ` +
          `Agents will run with whatever node_modules exists (likely none).`,
      );
    }

    return { worktreePath, executionRoot, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

function resolveWorktreePath(opts: SetupWorktreeOptions): string {
  const declared = opts.config.worktreeDir;
  const baseDir = declared
    ? isAbsolute(declared)
      ? declared
      : resolvePath(opts.mainProjectRoot, declared)
    : resolvePath(opts.mainProjectRoot, "..", `${basename(opts.mainProjectRoot)}-worktrees`);
  return `${baseDir}/${opts.runId}`;
}
