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

  it("skips files that already match — no conflict, no rewrite", () => {
    const dest = join(destBase, "match");
    // First copy populates dest exactly from src.
    copyTree({ src, dest, force: false, dryRun: false });
    // Second copy with no force should not throw and should report 0 written.
    const second = copyTree({ src, dest, force: false, dryRun: false });
    strictEqual(second.written.length, 0);
  });

  it("treats different content as a conflict, but identical content as not", () => {
    const dest = join(destBase, "mixed");
    mkdirSync(dest, { recursive: true });
    // identical to src
    writeFileSync(join(dest, "z.md"), "z");
    // a file that's already there with a name not in src should be ignored
    writeFileSync(join(dest, "unrelated.txt"), "keep");
    // missing a/x.ts and a/b/y.ts entirely so they'll be written cleanly
    const result = copyTree({ src, dest, force: false, dryRun: false });
    strictEqual(result.written.length, 2);
    ok(!result.written.includes("z.md"));
    strictEqual(readFileSync(join(dest, "unrelated.txt"), "utf8"), "keep");
  });

  it("dryRun writes nothing, returns the file list", () => {
    const dest = join(destBase, "dry");
    const result = copyTree({ src, dest, force: false, dryRun: true });
    strictEqual(result.written.length, 0);
    deepStrictEqual(result.wouldWrite.sort(), ["a/b/y.ts", "a/x.ts", "z.md"]);
    strictEqual(existsSync(dest), false);
  });

  it("skips macOS .DS_Store metadata files", () => {
    const dsSrc = mkdtempSync(join(tmpdir(), "copy-ds-src-"));
    const dsDest = mkdtempSync(join(tmpdir(), "copy-ds-dst-"));
    try {
      mkdirSync(join(dsSrc, "nested"), { recursive: true });
      writeFileSync(join(dsSrc, "keep.txt"), "keep");
      writeFileSync(join(dsSrc, ".DS_Store"), "junk");
      writeFileSync(join(dsSrc, "._.DS_Store"), "junk");
      writeFileSync(join(dsSrc, "nested/.DS_Store"), "junk");
      writeFileSync(join(dsSrc, "nested/inner.txt"), "inner");
      const result = copyTree({ src: dsSrc, dest: dsDest, force: false, dryRun: true });
      deepStrictEqual(result.wouldWrite.sort(), ["keep.txt", "nested/inner.txt"]);
      const written = copyTree({ src: dsSrc, dest: dsDest, force: false, dryRun: false });
      deepStrictEqual(written.written.sort(), ["keep.txt", "nested/inner.txt"]);
      strictEqual(existsSync(join(dsDest, ".DS_Store")), false);
      strictEqual(existsSync(join(dsDest, "._.DS_Store")), false);
      strictEqual(existsSync(join(dsDest, "nested/.DS_Store")), false);
    } finally {
      rmSync(dsSrc, { recursive: true, force: true });
      rmSync(dsDest, { recursive: true, force: true });
    }
  });
});
