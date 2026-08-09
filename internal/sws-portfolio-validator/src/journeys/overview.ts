// Journey 1: land on the portfolio like a returning user and verify that
// the numbers on the main screen are internally consistent.

import type { Page } from "playwright";
import { type CheckResult, type PortfolioSnapshot, checkSnapshot } from "../checks.js";
import { scrapeSnapshot } from "../scrape.js";

export interface OverviewResult {
  snapshot: PortfolioSnapshot;
  results: CheckResult[];
}

export async function runOverviewJourney(page: Page, tolPct: number): Promise<OverviewResult> {
  const snapshot = await scrapeSnapshot(page, "overview");
  if (snapshot.holdings.length === 0 && snapshot.totalValue === undefined) {
    return {
      snapshot,
      results: [
        {
          id: "overview-scraped",
          screen: "overview",
          description: "portfolio overview renders scrape-able data",
          pass: false,
          note: "no holdings or total found — selectors.ts likely needs tuning against the current markup",
        },
      ],
    };
  }
  return { snapshot, results: checkSnapshot(snapshot, tolPct) };
}
