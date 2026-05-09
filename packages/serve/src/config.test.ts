import { test } from "node:test";
import assert from "node:assert/strict";
import { ServeConfig, resolveServeConfig } from "./config.js";

test("ServeConfig parses an empty input and applies all defaults", () => {
  const cfg = ServeConfig.parse({});
  assert.equal(cfg.serveDir, "serve");
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.host, "127.0.0.1");
  assert.equal(cfg.tokenEnv, "GENERATA_SERVE_TOKEN");
  assert.equal(cfg.bodyLimitBytes, 1024 * 1024);
  assert.equal(cfg.shutdownTimeoutSec, 30);
  assert.equal(cfg.runStoreDir, ".generata/runs");
});

test("ServeConfig accepts overrides", () => {
  const cfg = ServeConfig.parse({ port: 4000, tokenEnv: "MY_TOKEN" });
  assert.equal(cfg.port, 4000);
  assert.equal(cfg.tokenEnv, "MY_TOKEN");
  assert.equal(cfg.serveDir, "serve");
});

test("ServeConfig rejects invalid port", () => {
  assert.throws(() => ServeConfig.parse({ port: -1 }));
  assert.throws(() => ServeConfig.parse({ port: 70000 }));
});

test("resolveServeConfig: CLI flags override config", () => {
  const cfg = resolveServeConfig({ port: 4000, host: "0.0.0.0" }, { port: 5000 });
  assert.equal(cfg.port, 5000);
  assert.equal(cfg.host, "0.0.0.0");
});

test("resolveServeConfig: undefined CLI flags do not override", () => {
  const cfg = resolveServeConfig({ port: 4000 }, { port: undefined });
  assert.equal(cfg.port, 4000);
});
