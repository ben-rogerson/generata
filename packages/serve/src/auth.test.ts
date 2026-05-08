import { test } from "node:test";
import assert from "node:assert/strict";
import { createBearerAuth } from "./auth.js";

test("rejects missing Authorization header", () => {
  const auth = createBearerAuth({ token: "secret" });
  assert.equal(auth.verify(undefined), false);
  assert.equal(auth.verify(""), false);
});

test("rejects wrong scheme", () => {
  const auth = createBearerAuth({ token: "secret" });
  assert.equal(auth.verify("Basic secret"), false);
  assert.equal(auth.verify("Token secret"), false);
});

test("rejects wrong token", () => {
  const auth = createBearerAuth({ token: "secret" });
  assert.equal(auth.verify("Bearer wrong"), false);
});

test("rejects empty token after Bearer", () => {
  const auth = createBearerAuth({ token: "secret" });
  assert.equal(auth.verify("Bearer "), false);
  assert.equal(auth.verify("Bearer"), false);
});

test("accepts correct token", () => {
  const auth = createBearerAuth({ token: "secret" });
  assert.equal(auth.verify("Bearer secret"), true);
});

test("constructor throws on empty token", () => {
  assert.throws(() => createBearerAuth({ token: "" }), /token/i);
});

test("comparison is length-safe (different-length tokens do not crash)", () => {
  const auth = createBearerAuth({ token: "abcdef" });
  assert.equal(auth.verify("Bearer abc"), false);
  assert.equal(auth.verify("Bearer abcdefghij"), false);
});
