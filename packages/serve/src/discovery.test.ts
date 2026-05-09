import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverHandlers } from "./discovery.js";

const here = resolve(fileURLToPath(import.meta.url), "..");
const fixturesGood = resolve(here, "../test/fixtures/serve-dir");
const fixturesBadName = resolve(here, "../test/fixtures/serve-dir-bad-name");

test("discovers valid handlers and skips _-prefixed and *.test.ts files", async () => {
  const table = await discoverHandlers(fixturesGood);
  const names = [...table.keys()].sort();
  assert.deepEqual(names, ["async-handler", "sync"]);
});

test("rejects missing default export in strict mode", async () => {
  await assert.rejects(
    () => discoverHandlers(fixturesGood, { strict: true }),
    /missing-default.*default export/i,
  );
});

test("default mode skips files with no default export rather than throwing", async () => {
  const table = await discoverHandlers(fixturesGood);
  // missing-default.ts is silently skipped, sync + async-handler still loaded
  assert.ok(table.has("sync"));
  assert.ok(table.has("async-handler"));
  assert.ok(!table.has("missing-default"));
});

test("rejects non-kebab-case filenames", async () => {
  await assert.rejects(
    () => discoverHandlers(fixturesBadName),
    /Bad-Name|kebab-case/,
  );
});

test("returns empty map for missing serve dir", async () => {
  const table = await discoverHandlers(resolve(here, "../test/fixtures/does-not-exist"));
  assert.equal(table.size, 0);
});
