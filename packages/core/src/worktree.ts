import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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
