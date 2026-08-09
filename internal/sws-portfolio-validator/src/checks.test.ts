import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkHoldingAdded,
  checkHoldingRemoved,
  checkHoldingsSumToTotal,
  checkPortfolioYieldIsWeightedAverage,
  checkSnapshotsAgree,
  checkWeightsMatchValues,
  checkWeightsSumToHundred,
  type PortfolioSnapshot,
} from "./checks.js";
import { parseMoney, parsePercent } from "./numbers.js";

const snapshot = (overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot => ({
  screen: "test",
  totalValue: parseMoney("$10,000")!,
  dividendYieldPct: parsePercent("3.0%")!,
  holdings: [
    {
      ticker: "AAA",
      value: parseMoney("$6,000")!,
      weightPct: parsePercent("60%")!,
      dividendYieldPct: parsePercent("2.0%")!,
    },
    {
      ticker: "BBB",
      value: parseMoney("$4,000")!,
      weightPct: parsePercent("40%")!,
      dividendYieldPct: parsePercent("4.5%")!,
    },
  ],
  ...overrides,
});

describe("checkHoldingsSumToTotal", () => {
  it("passes when values sum to the total", () => {
    assert.ok(checkHoldingsSumToTotal(snapshot(), 0.5).pass);
  });

  it("fails when the total is off beyond tolerance", () => {
    const snap = snapshot({ totalValue: parseMoney("$11,000")! });
    assert.ok(!checkHoldingsSumToTotal(snap, 0.5).pass);
  });

  it("skips when a holding value is missing", () => {
    const snap = snapshot();
    delete snap.holdings[0]!.value;
    const result = checkHoldingsSumToTotal(snap, 0.5);
    assert.ok(result.pass);
    assert.match(result.note ?? "", /skipped/);
  });
});

describe("checkWeightsSumToHundred", () => {
  it("passes for weights summing to 100", () => {
    assert.ok(checkWeightsSumToHundred(snapshot(), 0.5).pass);
  });

  it("fails when weights drift", () => {
    const snap = snapshot();
    snap.holdings[1]!.weightPct = parsePercent("30%")!;
    assert.ok(!checkWeightsSumToHundred(snap, 0.5).pass);
  });
});

describe("checkWeightsMatchValues", () => {
  it("recomputes each weight from value/total", () => {
    const results = checkWeightsMatchValues(snapshot(), 0.5);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.pass));
  });

  it("catches a weight inconsistent with its value", () => {
    const snap = snapshot();
    snap.holdings[0]!.weightPct = parsePercent("70%")!;
    const results = checkWeightsMatchValues(snap, 0.5);
    assert.ok(!results[0]!.pass);
  });
});

describe("checkPortfolioYieldIsWeightedAverage", () => {
  it("passes when the portfolio yield is the value-weighted average", () => {
    // 0.6 * 2.0 + 0.4 * 4.5 = 3.0
    assert.ok(checkPortfolioYieldIsWeightedAverage(snapshot(), 0.5).pass);
  });

  it("fails when the portfolio yield is not the weighted average", () => {
    const snap = snapshot({ dividendYieldPct: parsePercent("4.0%")! });
    assert.ok(!checkPortfolioYieldIsWeightedAverage(snap, 0.5).pass);
  });
});

describe("checkSnapshotsAgree", () => {
  it("passes for consistent screens", () => {
    const results = checkSnapshotsAgree(snapshot({ screen: "a" }), snapshot({ screen: "b" }), 0.5);
    assert.ok(results.length >= 2);
    assert.ok(results.every((r) => r.pass));
  });

  it("flags diverging totals and holdings", () => {
    const other = snapshot({ screen: "b", totalValue: parseMoney("$12,000")! });
    other.holdings = other.holdings.slice(0, 1);
    const results = checkSnapshotsAgree(snapshot({ screen: "a" }), other, 0.5);
    assert.ok(results.some((r) => r.id === "cross-screen-total" && !r.pass));
    assert.ok(results.some((r) => r.id === "cross-screen-holdings" && !r.pass));
  });
});

describe("mutation checks", () => {
  it("validates an added holding end to end", () => {
    const before = snapshot();
    const after = snapshot({ totalValue: parseMoney("$11,000")! });
    after.holdings = [
      ...after.holdings,
      { ticker: "CCC", value: parseMoney("$1,000")!, weightPct: undefined },
    ];
    const results = checkHoldingAdded(before, after, "CCC", 0.5);
    assert.equal(results.length, 3);
    assert.ok(results.every((r) => r.pass));
  });

  it("fails when the added holding never shows up", () => {
    const results = checkHoldingAdded(snapshot(), snapshot(), "CCC", 0.5);
    assert.ok(results.some((r) => !r.pass));
  });

  it("validates removal back to the baseline", () => {
    const results = checkHoldingRemoved(snapshot(), snapshot(), "CCC");
    assert.ok(results.every((r) => r.pass));
  });

  it("fails when the removed holding is still listed", () => {
    const after = snapshot();
    after.holdings.push({ ticker: "CCC" });
    const results = checkHoldingRemoved(snapshot(), after, "CCC");
    assert.ok(results.some((r) => !r.pass));
  });
});
