// Pure validation rules over scraped portfolio snapshots.
// Everything here is deterministic and unit-tested — the browser journeys
// only gather data and feed it through these checks.

import { type Amount, amountsAgree, exact, formatAmount, sumAmounts } from "./numbers.js";

export interface Holding {
  ticker: string;
  name?: string;
  /** Current market value of the position. */
  value?: Amount;
  /** Portfolio weight as displayed, in percent. */
  weightPct?: Amount;
  /** Dividend yield as displayed, in percent. */
  dividendYieldPct?: Amount;
}

export interface PortfolioSnapshot {
  /** Which screen this was scraped from, e.g. "overview", "holdings". */
  screen: string;
  totalValue?: Amount;
  /** Portfolio-level dividend yield in percent, when the screen shows one. */
  dividendYieldPct?: Amount;
  holdings: Holding[];
}

export interface CheckResult {
  id: string;
  screen: string;
  description: string;
  pass: boolean;
  expected?: string;
  actual?: string;
  note?: string;
}

const skipped = (id: string, screen: string, description: string, note: string): CheckResult => ({
  id,
  screen,
  description,
  pass: true,
  note: `skipped: ${note}`,
});

/** The displayed portfolio total must equal the sum of the displayed holding values. */
export function checkHoldingsSumToTotal(snap: PortfolioSnapshot, tolPct: number): CheckResult {
  const id = "holdings-sum-to-total";
  const description = "sum of holding values equals displayed portfolio total";
  const values = snap.holdings.map((h) => h.value).filter((v) => v !== undefined);
  if (snap.totalValue === undefined || values.length === 0) {
    return skipped(id, snap.screen, description, "total or holding values not visible");
  }
  if (values.length < snap.holdings.length) {
    return skipped(id, snap.screen, description, "some holdings have no visible value");
  }
  const sum = sumAmounts(values);
  return {
    id,
    screen: snap.screen,
    description,
    pass: amountsAgree(sum, snap.totalValue, tolPct),
    expected: formatAmount(sum),
    actual: formatAmount(snap.totalValue),
  };
}

/** Displayed holding weights must sum to ~100%. */
export function checkWeightsSumToHundred(snap: PortfolioSnapshot, tolPct: number): CheckResult {
  const id = "weights-sum-to-100";
  const description = "holding weights sum to 100%";
  const weights = snap.holdings.map((h) => h.weightPct).filter((w) => w !== undefined);
  if (weights.length === 0 || weights.length < snap.holdings.length) {
    return skipped(id, snap.screen, description, "weights not visible for every holding");
  }
  const sum = sumAmounts(weights);
  return {
    id,
    screen: snap.screen,
    description,
    pass: amountsAgree(sum, exact(100), tolPct),
    expected: "100",
    actual: formatAmount(sum),
  };
}

/** Each displayed weight must match value ÷ total, independently recomputed. */
export function checkWeightsMatchValues(snap: PortfolioSnapshot, tolPct: number): CheckResult[] {
  const id = "weight-matches-value-share";
  if (snap.totalValue === undefined || snap.totalValue.value === 0) return [];
  const total = snap.totalValue;
  return snap.holdings
    .filter((h) => h.value !== undefined && h.weightPct !== undefined)
    .map((h) => {
      const value = h.value!;
      const weight = h.weightPct!;
      // Propagate rounding uncertainty of value and total into the derived weight.
      const derived: Amount = {
        value: (value.value / total.value) * 100,
        precision:
          ((value.precision + (total.precision * value.value) / total.value) / total.value) * 100,
      };
      return {
        id,
        screen: snap.screen,
        description: `${h.ticker}: displayed weight equals value/total`,
        pass: amountsAgree(derived, weight, tolPct),
        expected: formatAmount(derived),
        actual: formatAmount(weight),
      };
    });
}

/** Portfolio dividend yield must be the value-weighted average of holding yields. */
export function checkPortfolioYieldIsWeightedAverage(
  snap: PortfolioSnapshot,
  tolPct: number,
): CheckResult {
  const id = "portfolio-yield-weighted-average";
  const description = "portfolio dividend yield equals value-weighted average of holding yields";
  const usable = snap.holdings.filter(
    (h) => h.value !== undefined && h.dividendYieldPct !== undefined,
  );
  if (
    snap.dividendYieldPct === undefined ||
    usable.length === 0 ||
    usable.length < snap.holdings.length
  ) {
    return skipped(id, snap.screen, description, "yields not visible for every holding");
  }
  const totalValue = usable.reduce((acc, h) => acc + h.value!.value, 0);
  if (totalValue === 0) return skipped(id, snap.screen, description, "portfolio value is zero");
  const weighted = usable.reduce((acc, h) => acc + h.value!.value * h.dividendYieldPct!.value, 0);
  const derived: Amount = {
    value: weighted / totalValue,
    precision: usable.reduce(
      (acc, h) => acc + (h.value!.value / totalValue) * h.dividendYieldPct!.precision,
      0,
    ),
  };
  return {
    id,
    screen: snap.screen,
    description,
    pass: amountsAgree(derived, snap.dividendYieldPct, tolPct),
    expected: formatAmount(derived),
    actual: formatAmount(snap.dividendYieldPct),
  };
}

/** Two screens showing the same portfolio must agree on total and composition. */
export function checkSnapshotsAgree(
  a: PortfolioSnapshot,
  b: PortfolioSnapshot,
  tolPct: number,
): CheckResult[] {
  const results: CheckResult[] = [];
  const screen = `${a.screen} vs ${b.screen}`;
  if (a.totalValue !== undefined && b.totalValue !== undefined) {
    results.push({
      id: "cross-screen-total",
      screen,
      description: "both screens display the same portfolio total",
      pass: amountsAgree(a.totalValue, b.totalValue, tolPct),
      expected: formatAmount(a.totalValue),
      actual: formatAmount(b.totalValue),
    });
  }
  if (a.holdings.length > 0 && b.holdings.length > 0) {
    const tickersA = new Set(a.holdings.map((h) => h.ticker));
    const tickersB = new Set(b.holdings.map((h) => h.ticker));
    const missing = [...tickersA].filter((t) => !tickersB.has(t));
    const extra = [...tickersB].filter((t) => !tickersA.has(t));
    results.push({
      id: "cross-screen-holdings",
      screen,
      description: "both screens list the same holdings",
      pass: missing.length === 0 && extra.length === 0,
      expected: [...tickersA].sort().join(", "),
      actual: [...tickersB].sort().join(", "),
    });
  }
  return results;
}

/** After adding a stock: it's listed, count went up by one, total grew accordingly. */
export function checkHoldingAdded(
  before: PortfolioSnapshot,
  after: PortfolioSnapshot,
  ticker: string,
  tolPct: number,
): CheckResult[] {
  const screen = after.screen;
  const added = after.holdings.find((h) => h.ticker.toUpperCase().includes(ticker.toUpperCase()));
  const results: CheckResult[] = [
    {
      id: "mutation-add-listed",
      screen,
      description: `${ticker} appears in the holdings list after adding`,
      pass: added !== undefined,
      expected: ticker,
      actual: after.holdings.map((h) => h.ticker).join(", ") || "(empty)",
    },
    {
      id: "mutation-add-count",
      screen,
      description: "holding count increased by one",
      pass: after.holdings.length === before.holdings.length + 1,
      expected: String(before.holdings.length + 1),
      actual: String(after.holdings.length),
    },
  ];
  if (before.totalValue !== undefined && after.totalValue !== undefined && added?.value) {
    const expectedTotal = sumAmounts([before.totalValue, added.value]);
    results.push({
      id: "mutation-add-total",
      screen,
      description: "portfolio total grew by the new holding's value",
      pass: amountsAgree(expectedTotal, after.totalValue, tolPct),
      expected: formatAmount(expectedTotal),
      actual: formatAmount(after.totalValue),
    });
  }
  return results;
}

/** After removing the stock: it's gone and the composition matches the baseline. */
export function checkHoldingRemoved(
  baseline: PortfolioSnapshot,
  after: PortfolioSnapshot,
  ticker: string,
): CheckResult[] {
  const screen = after.screen;
  const stillListed = after.holdings.some((h) =>
    h.ticker.toUpperCase().includes(ticker.toUpperCase()),
  );
  const baselineTickers = baseline.holdings
    .map((h) => h.ticker)
    .sort()
    .join(", ");
  const afterTickers = after.holdings
    .map((h) => h.ticker)
    .sort()
    .join(", ");
  return [
    {
      id: "mutation-remove-gone",
      screen,
      description: `${ticker} no longer appears after removal`,
      pass: !stillListed,
      expected: "(absent)",
      actual: stillListed ? "still listed" : "(absent)",
    },
    {
      id: "mutation-remove-baseline",
      screen,
      description: "holdings match the pre-mutation baseline",
      pass: baselineTickers === afterTickers,
      expected: baselineTickers || "(empty)",
      actual: afterTickers || "(empty)",
    },
  ];
}

/** All structural checks that apply to a single screen's snapshot. */
export function checkSnapshot(snap: PortfolioSnapshot, tolPct: number): CheckResult[] {
  return [
    checkHoldingsSumToTotal(snap, tolPct),
    checkWeightsSumToHundred(snap, tolPct),
    ...checkWeightsMatchValues(snap, tolPct),
    checkPortfolioYieldIsWeightedAverage(snap, tolPct),
  ];
}
