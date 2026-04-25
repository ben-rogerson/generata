import { strictEqual, deepStrictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManifest, parseManifest } from "./manifest.js";

const valid = {
  name: "@my/template",
  description: "Test template",
  engineVersion: "^1.0.0",
  requiredBins: [{ name: "claude", hint: "https://docs.anthropic.com/claude-code" }],
  requiredEnv: {
    WORKDIR: { description: "Working dir", example: "/tmp/work" },
    SECRET: { description: "A secret", secret: true, optional: true },
  },
  installPaths: {
    "agents/": "agents/",
    "skills/": ".claude/skills/",
  },
  postInstall: "Run pnpm generata workflow foo",
};

describe("parseManifest", () => {
  it("accepts a valid manifest", () => {
    const m = parseManifest(valid);
    strictEqual(m.name, "@my/template");
    strictEqual(m.requiredBins[0].name, "claude");
    strictEqual(m.requiredEnv.WORKDIR.optional ?? false, false);
    strictEqual(m.requiredEnv.SECRET.secret, true);
  });

  it("defaults optional fields", () => {
    const m = parseManifest({ name: "x", description: "y" });
    deepStrictEqual(m.requiredBins, []);
    deepStrictEqual(m.requiredEnv, {});
    deepStrictEqual(m.profiles, []);
  });

  it("rejects manifest missing name", () => {
    throws(() => parseManifest({ description: "y" }));
  });

  it("rejects bin entry missing name", () => {
    throws(() => parseManifest({ name: "x", description: "y", requiredBins: [{}] }));
  });
});

describe("loadManifest", () => {
  it("reads and parses a manifest from disk", () => {
    const tmp = mkdtempSync(join(tmpdir(), "manifest-"));
    writeFileSync(join(tmp, "generata.template.json"), JSON.stringify(valid));
    try {
      const m = loadManifest(tmp);
      strictEqual(m.name, "@my/template");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws clearly when manifest missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "manifest-"));
    try {
      throws(() => loadManifest(tmp), /generata\.template\.json/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
