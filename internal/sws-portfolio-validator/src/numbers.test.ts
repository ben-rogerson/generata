import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { amountsAgree, exact, parseMoney, parsePercent, sumAmounts } from "./numbers.js";

describe("parseMoney", () => {
  it("parses plain currency values", () => {
    assert.deepEqual(parseMoney("$1,234.56"), { value: 1234.56, precision: 0.005 });
    assert.deepEqual(parseMoney("AU$500"), { value: 500, precision: 0.5 });
    assert.deepEqual(parseMoney("US$0.99"), { value: 0.99, precision: 0.005 });
  });

  it("parses abbreviated values with rounding precision", () => {
    assert.deepEqual(parseMoney("AU$1.2k"), { value: 1200, precision: 50 });
    assert.deepEqual(parseMoney("$3.45m"), { value: 3_450_000, precision: 5000 });
    assert.deepEqual(parseMoney("1.2b"), { value: 1_200_000_000, precision: 50_000_000 });
  });

  it("parses negative values in both notations", () => {
    assert.equal(parseMoney("-$500")?.value, -500);
    assert.equal(parseMoney("($500)")?.value, -500);
    assert.equal(parseMoney("AU$-1.5k")?.value, -1500);
  });

  it("rejects non-money text", () => {
    assert.equal(parseMoney("n/a"), null);
    assert.equal(parseMoney(""), null);
    assert.equal(parseMoney("12.3%"), null);
  });
});

describe("parsePercent", () => {
  it("parses percentages with rounding precision", () => {
    assert.deepEqual(parsePercent("12.3%"), { value: 12.3, precision: 0.05 });
    assert.deepEqual(parsePercent("-0.5%"), { value: -0.5, precision: 0.05 });
    assert.deepEqual(parsePercent("+8%"), { value: 8, precision: 0.5 });
  });

  it("rejects non-percent text", () => {
    assert.equal(parsePercent("$12"), null);
    assert.equal(parsePercent("high"), null);
  });
});

describe("amountsAgree", () => {
  it("accepts differences covered by display rounding", () => {
    // "1.2k" (±50) can legitimately equal an exact 1234.
    assert.ok(amountsAgree(parseMoney("1.2k")!, exact(1234), 0));
    assert.ok(!amountsAgree(parseMoney("1.2k")!, exact(1300), 0));
  });

  it("applies the relative tolerance on top", () => {
    assert.ok(!amountsAgree(exact(1000), exact(1009), 0));
    assert.ok(amountsAgree(exact(1000), exact(1009), 1));
  });
});

describe("sumAmounts", () => {
  it("accumulates values and precision", () => {
    const sum = sumAmounts([parseMoney("1.2k")!, parseMoney("$300")!]);
    assert.equal(sum.value, 1500);
    assert.equal(sum.precision, 50.5);
  });
});
