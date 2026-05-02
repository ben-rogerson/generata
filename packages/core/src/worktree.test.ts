import { deepEqual, equal } from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { rmSync } from "node:fs";
import { detectPackageManager, makeStubBackend } from "./worktree.js";

describe("detectPackageManager", () => {
  let dir: string;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it("returns pnpm install --frozen-lockfile for pnpm-lock.yaml", () => {
    dir = mkdtempSync(join(tmpdir(), "wt-"));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    deepEqual(detectPackageManager(dir), ["pnpm", "install", "--frozen-lockfile"]);
  });

  it("returns npm ci for package-lock.json", () => {
    dir = mkdtempSync(join(tmpdir(), "wt-"));
    writeFileSync(join(dir, "package-lock.json"), "{}");
    deepEqual(detectPackageManager(dir), ["npm", "ci"]);
  });

  it("returns yarn install --immutable for yarn.lock", () => {
    dir = mkdtempSync(join(tmpdir(), "wt-"));
    writeFileSync(join(dir, "yarn.lock"), "");
    deepEqual(detectPackageManager(dir), ["yarn", "install", "--immutable"]);
  });

  it("returns bun install --frozen-lockfile for bun.lockb", () => {
    dir = mkdtempSync(join(tmpdir(), "wt-"));
    writeFileSync(join(dir, "bun.lockb"), "");
    deepEqual(detectPackageManager(dir), ["bun", "install", "--frozen-lockfile"]);
  });

  it("returns null when no lockfile is present", () => {
    dir = mkdtempSync(join(tmpdir(), "wt-"));
    equal(detectPackageManager(dir), null);
  });

  it("prefers pnpm-lock.yaml when multiple lockfiles exist", () => {
    dir = mkdtempSync(join(tmpdir(), "wt-"));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    writeFileSync(join(dir, "package-lock.json"), "{}");
    deepEqual(detectPackageManager(dir), ["pnpm", "install", "--frozen-lockfile"]);
  });
});

describe("makeStubBackend", () => {
  it("records exec calls and returns successful results by default", async () => {
    const b = makeStubBackend();
    const r = await b.exec(["git", "fetch"], { cwd: "/x" });
    equal(r.exitCode, 0);
    equal(b.calls.length, 1);
    deepEqual(b.calls[0], { cmd: ["git", "fetch"], cwd: "/x" });
  });

  it("can be primed to fail a specific command", async () => {
    const b = makeStubBackend();
    b.failOn(["pnpm", "install", "--frozen-lockfile"], { stderr: "lockfile mismatch" });
    const r = await b.exec(["pnpm", "install", "--frozen-lockfile"], { cwd: "/x" });
    equal(r.exitCode, 1);
    equal(r.stderr, "lockfile mismatch");
  });
});
