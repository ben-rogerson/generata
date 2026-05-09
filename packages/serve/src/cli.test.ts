import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "./cli.js";

test("parseCliArgs returns defaults for empty argv", () => {
  const flags = parseCliArgs([]);
  assert.deepEqual(flags, {});
});

test("parseCliArgs reads --port, --host, --serve-dir, --token-env, --shutdown-timeout", () => {
  const flags = parseCliArgs([
    "--port",
    "4000",
    "--host",
    "0.0.0.0",
    "--serve-dir",
    "custom-serve",
    "--token-env",
    "MY_TOKEN",
    "--shutdown-timeout",
    "60",
  ]);
  assert.deepEqual(flags, {
    port: 4000,
    host: "0.0.0.0",
    serveDir: "custom-serve",
    tokenEnv: "MY_TOKEN",
    shutdownTimeoutSec: 60,
  });
});

test("parseCliArgs throws on unknown flags", () => {
  assert.throws(() => parseCliArgs(["--bogus"]), /bogus/);
});

test("parseCliArgs throws on non-numeric --port", () => {
  assert.throws(() => parseCliArgs(["--port", "abc"]), /port/i);
});

test("parseCliArgs supports --help by returning a help marker", () => {
  const flags = parseCliArgs(["--help"]);
  assert.equal(flags.help, true);
});
