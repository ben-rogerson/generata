import { ok, strictEqual, rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInit, runBareInit } from "./init.js";

const FIXTURE = fileURLToPath(new URL("../../test/fixtures/template-fake", import.meta.url));

describe("runInit", () => {
  it("works in a non-empty directory and preserves unrelated files", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-existing-"));
    writeFileSync(join(dest, "preexisting.txt"), "stray");
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      ok(existsSync(join(dest, "preexisting.txt")));
      strictEqual(readFileSync(join(dest, "preexisting.txt"), "utf8"), "stray");
      ok(existsSync(join(dest, "agents/echo.ts")));
      ok(existsSync(join(dest, "package.json")));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("errors on template-file conflict without --force", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-conflict-"));
    mkdirSync(join(dest, "agents"), { recursive: true });
    writeFileSync(join(dest, "agents/echo.ts"), "// existing");
    try {
      await rejects(
        runInit({
          spec: FIXTURE,
          dest,
          skipPreflight: true,
          skipInstall: true,
          yes: true,
        }),
        /conflict/i,
      );
      strictEqual(readFileSync(join(dest, "agents/echo.ts"), "utf8"), "// existing");
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("writes a default generata.config.ts when none exists", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-config-"));
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      ok(existsSync(join(dest, "generata.config.ts")));
      const body = readFileSync(join(dest, "generata.config.ts"), "utf8");
      ok(body.includes("defineConfig"));
      ok(body.includes("modelTiers"));
      ok(body.includes(JSON.stringify(dest)));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("preserves an existing generata.config.ts", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-config-existing-"));
    const existing = "// hand-edited config\nexport default { custom: true };\n";
    writeFileSync(join(dest, "generata.config.ts"), existing);
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      strictEqual(readFileSync(join(dest, "generata.config.ts"), "utf8"), existing);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("runBareInit writes a default config in the cwd", async () => {
    const dest = mkdtempSync(join(tmpdir(), "bare-init-"));
    try {
      await runBareInit(dest);
      ok(existsSync(join(dest, "generata.config.ts")));
      const body = readFileSync(join(dest, "generata.config.ts"), "utf8");
      ok(body.includes("defineConfig"));
      ok(body.includes(JSON.stringify(dest)));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("runBareInit preserves an existing config", async () => {
    const dest = mkdtempSync(join(tmpdir(), "bare-init-existing-"));
    const existing = "// hand-edited\nexport default { custom: true };\n";
    writeFileSync(join(dest, "generata.config.ts"), existing);
    try {
      await runBareInit(dest);
      strictEqual(readFileSync(join(dest, "generata.config.ts"), "utf8"), existing);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("re-running with identical files is idempotent (no conflict, no error)", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-idempotent-"));
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      // Second run, same template, no --force. Should not throw.
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      ok(existsSync(join(dest, "agents/echo.ts")));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("--force overwrites conflicting files", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-force-"));
    mkdirSync(join(dest, "agents"), { recursive: true });
    writeFileSync(join(dest, "agents/echo.ts"), "// existing");
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
        force: true,
      });
      const fixtureBody = readFileSync(resolve(FIXTURE, "agents/echo.ts"), "utf8");
      strictEqual(readFileSync(join(dest, "agents/echo.ts"), "utf8"), fixtureBody);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
