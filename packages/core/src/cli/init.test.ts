import { ok, strictEqual, rejects } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInit, runBareInit, detectPmPin } from "./init.js";

const FIXTURE = fileURLToPath(
  new URL("../../test/fixtures/template-fake", import.meta.url),
);

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
      strictEqual(
        readFileSync(join(dest, "agents/echo.ts"), "utf8"),
        "// existing",
      );
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
      ok(body.includes("logPrompts: true"));
      ok(body.includes("verboseOutput: true"));
      ok(!body.includes("workDir"));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("preserves an existing generata.config.ts", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-config-existing-"));
    const existing =
      "// hand-edited config\nexport default { custom: true };\n";
    writeFileSync(join(dest, "generata.config.ts"), existing);
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      strictEqual(
        readFileSync(join(dest, "generata.config.ts"), "utf8"),
        existing,
      );
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
      ok(body.includes("logPrompts: true"));
      ok(body.includes("verboseOutput: true"));
      ok(!body.includes("workDir"));
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
      strictEqual(
        readFileSync(join(dest, "generata.config.ts"), "utf8"),
        existing,
      );
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

  it("pins packageManager from npm_config_user_agent in scaffolded package.json", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-pm-pin-"));
    const orig = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent =
      "pnpm/9.15.0 npm/? node/v22.12.0 darwin arm64";
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));
      strictEqual(pkg.packageManager, "pnpm@9.15.0");
    } finally {
      if (orig === undefined) delete process.env.npm_config_user_agent;
      else process.env.npm_config_user_agent = orig;
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("omits packageManager when user agent is missing or unsupported", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-pm-no-pin-"));
    const orig = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8"));
      ok(!("packageManager" in pkg));
    } finally {
      if (orig !== undefined) process.env.npm_config_user_agent = orig;
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("detectPmPin parses pnpm/yarn/npm and rejects bun and garbage", () => {
    strictEqual(
      detectPmPin("pnpm/9.15.0 npm/? node/v22 darwin arm64"),
      "pnpm@9.15.0",
    );
    strictEqual(detectPmPin("yarn/4.5.0 npm/? node/v22"), "yarn@4.5.0");
    strictEqual(detectPmPin("npm/10.8.0 node/v22"), "npm@10.8.0");
    strictEqual(detectPmPin("bun/1.1.0"), null);
    strictEqual(detectPmPin(""), null);
    strictEqual(detectPmPin("pnpm/latest"), null);
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
      const fixtureBody = readFileSync(
        resolve(FIXTURE, "agents/echo.ts"),
        "utf8",
      );
      strictEqual(
        readFileSync(join(dest, "agents/echo.ts"), "utf8"),
        fixtureBody,
      );
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
