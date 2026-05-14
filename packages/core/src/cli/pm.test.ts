import { strictEqual } from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPm } from "./pm.js";

let dir: string;
const originalUa = process.env.npm_config_user_agent;

describe("detectPm", () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "pm-detect-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalUa === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = originalUa;
  });

  it("returns 'bun' when bun.lockb is present, even if user-agent is pnpm", () => {
    const dest = mkdtempSync(join(dir, "bun-"));
    writeFileSync(join(dest, "bun.lockb"), "");
    process.env.npm_config_user_agent = "pnpm/9.0.0 npm/? node/v20.0.0 darwin arm64";
    strictEqual(detectPm(dest), "bun");
  });
});
