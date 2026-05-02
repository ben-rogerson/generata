import { equal } from "node:assert/strict";
import { describe, it } from "node:test";
import { formatWeeklySummary } from "./metrics.js";

const summary = (overrides: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...overrides });
function base() {
  return {
    calls: 0,
    cost: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    duration_ms: 0,
  };
}

describe("formatWeeklySummary", () => {
  it("returns undefined when there are no calls", () => {
    equal(formatWeeklySummary(summary(), true), undefined);
  });

  it("renders calls + tokens when pricing is hidden", () => {
    const out = formatWeeklySummary(
      summary({ calls: 12, cost: 1.23, input_tokens: 200_000, output_tokens: 50_000 }),
      false,
    );
    equal(out, "7d · 12 calls · 250k tok");
  });

  it("includes cost when pricing is shown and cost > 0", () => {
    const out = formatWeeklySummary(
      summary({ calls: 12, cost: 1.236, input_tokens: 200_000, output_tokens: 50_000 }),
      true,
    );
    equal(out, "7d · 12 calls · $1.24 · 250k tok");
  });

  it("omits cost when pricing is shown but cost is zero", () => {
    const out = formatWeeklySummary(
      summary({ calls: 4, cost: 0, input_tokens: 10_000, output_tokens: 5_000 }),
      true,
    );
    equal(out, "7d · 4 calls · 15k tok");
  });

  it("ignores cache_read_tokens", () => {
    const out = formatWeeklySummary(
      summary({
        calls: 5,
        input_tokens: 1_000,
        output_tokens: 1_000,
        cache_read_tokens: 9_000,
      }),
      false,
    );
    equal(out, "7d · 5 calls · 2k tok");
  });

  it("appends +N% delta to both calls and tokens when up vs previous 7 days", () => {
    const out = formatWeeklySummary(
      summary({ calls: 10, input_tokens: 90_000, output_tokens: 30_000 }),
      false,
      summary({ calls: 8, input_tokens: 70_000, output_tokens: 30_000 }),
    );
    equal(out, "7d · 10 calls +25% · 120k tok +20%");
  });

  it("appends -N% delta when down", () => {
    const out = formatWeeklySummary(
      summary({ calls: 6, input_tokens: 70_000, output_tokens: 20_000 }),
      false,
      summary({ calls: 8, input_tokens: 80_000, output_tokens: 20_000 }),
    );
    equal(out, "7d · 6 calls -25% · 90k tok -10%");
  });

  it("omits a delta segment when its change is below 5%", () => {
    const out = formatWeeklySummary(
      summary({ calls: 10, input_tokens: 102_000, output_tokens: 0 }),
      false,
      summary({ calls: 10, input_tokens: 100_000, output_tokens: 0 }),
    );
    equal(out, "7d · 10 calls · 102k tok");
  });

  it("omits both deltas when previous period is empty", () => {
    const out = formatWeeklySummary(
      summary({ calls: 10, input_tokens: 100_000, output_tokens: 0 }),
      false,
      summary(),
    );
    equal(out, "7d · 10 calls · 100k tok");
  });
});
