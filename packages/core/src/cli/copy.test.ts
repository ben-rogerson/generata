import { strictEqual, deepStrictEqual, ok } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTree } from "./copy.js";

let src: string;
let destBase: string;

function setupSource(): string {
  const dir = mkdtempSync(join(tmpdir(), "copy-src-"));
  mkdirSync(join(dir, "a/b"), { recursive: true });
  writeFileSync(join(dir, "a/x.ts"), "x");
  writeFileSync(join(dir, "a/b/y.ts"), "y");
  writeFileSync(join(dir, "z.md"), "z");
  return dir;
}

describe("copyTree", () => {
  before(() => {
    src = setupSource();
    destBase = mkdtempSync(join(tmpdir(), "copy-dst-"));
  });
  after(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(destBase, { recursive: true, force: true });
  });

  it("copies all files into dest, preserving subdirs", () => {
    const dest = join(destBase, "fresh");
    const result = copyTree({ src, dest, force: false, dryRun: false });
    strictEqual(result.written.length, 3);
    ok(existsSync(join(dest, "a/x.ts")));
    ok(existsSync(join(dest, "a/b/y.ts")));
    ok(existsSync(join(dest, "z.md")));
    strictEqual(readFileSync(join(dest, "a/x.ts"), "utf8"), "x");
  });

  it("throws on conflict with file list", () => {
    const dest = join(destBase, "conflict");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "z.md"), "old");
    let caught: Error | null = null;
    try {
      copyTree({ src, dest, force: false, dryRun: false });
    } catch (err) {
      caught = err as Error;
    }
    ok(caught);
    ok(/z\.md/.test(caught!.message));
    strictEqual(readFileSync(join(dest, "z.md"), "utf8"), "old");
  });

  it("force overwrites without throwing", () => {
    const dest = join(destBase, "force");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "z.md"), "old");
    copyTree({ src, dest, force: true, dryRun: false });
    strictEqual(readFileSync(join(dest, "z.md"), "utf8"), "z");
  });

  it("dryRun writes nothing, returns the file list", () => {
    const dest = join(destBase, "dry");
    const result = copyTree({ src, dest, force: false, dryRun: true });
    strictEqual(result.written.length, 0);
    deepStrictEqual(result.wouldWrite.sort(), ["a/b/y.ts", "a/x.ts", "z.md"]);
    strictEqual(existsSync(dest), false);
  });
});
