import { ok } from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInit } from "./init.js";

const FIXTURE = fileURLToPath(
  new URL("../../test/fixtures/template-broken-imports", import.meta.url),
);

describe("runInit scanTemplate tolerance", () => {
  it("skips files with unresolvable imports while still scanning valid siblings", async () => {
    const dest = mkdtempSync(join(tmpdir(), "init-scan-"));
    try {
      await runInit({
        spec: FIXTURE,
        dest,
        skipPreflight: true,
        skipInstall: true,
        yes: true,
      });
      const envExample = readFileSync(join(dest, ".env.example"), "utf8");
      ok(
        envExample.includes("VALID_KEY"),
        "valid.ts agent's envKey must appear in .env.example, proving the scan succeeded for it despite broken.ts failing",
      );
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
