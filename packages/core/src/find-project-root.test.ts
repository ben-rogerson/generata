import { strictEqual, throws } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findProjectRoot } from "./find-project-root.js";

describe("findProjectRoot", () => {
  let tmp: string;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "generata-test-"));
    mkdirSync(join(tmp, "a/b/c"), { recursive: true });
    writeFileSync(join(tmp, "generata.config.ts"), "export default {};\n");
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns the dir containing generata.config.ts when started in a child", () => {
    strictEqual(findProjectRoot(join(tmp, "a/b/c")), resolve(tmp));
  });

  it("returns the dir when started directly in the root", () => {
    strictEqual(findProjectRoot(tmp), resolve(tmp));
  });

  it("finds .js or .mjs variants", () => {
    const tmpJs = mkdtempSync(join(tmpdir(), "generata-test-"));
    writeFileSync(join(tmpJs, "generata.config.js"), "module.exports = {};\n");
    try {
      strictEqual(findProjectRoot(tmpJs), resolve(tmpJs));
    } finally {
      rmSync(tmpJs, { recursive: true, force: true });
    }
  });

  it("throws a clear error when no anchor is found before filesystem root", () => {
    throws(() => findProjectRoot("/"), /No generata\.config\.(ts|js|mjs) found/);
  });
});
