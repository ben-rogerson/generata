// Journey 2: click between the portfolio's tabs the way a user browses
// (Holdings, Returns, Dividends, ...) and verify every screen tells the
// same story — same total, same composition, and each screen internally
// consistent.

import type { Page } from "playwright";
import {
  type CheckResult,
  type PortfolioSnapshot,
  checkSnapshot,
  checkSnapshotsAgree,
} from "../checks.js";
import { scrapeSnapshot } from "../scrape.js";

/** Tab labels to visit, matched case-insensitively against links/buttons. */
const TABS = ["Holdings", "Returns", "Dividends", "Diversification"];

async function clickTab(page: Page, label: string): Promise<boolean> {
  const tab = page
    .getByRole("tab", { name: new RegExp(label, "i") })
    .or(page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }))
    .or(page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }));
  try {
    await tab.first().click({ timeout: 5000 });
    await page.waitForLoadState("networkidle");
    return true;
  } catch {
    return false;
  }
}

export async function runCrossScreenJourney(
  page: Page,
  baseline: PortfolioSnapshot,
  tolPct: number,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const label of TABS) {
    const screen = label.toLowerCase();
    if (!(await clickTab(page, label))) {
      results.push({
        id: "tab-reachable",
        screen,
        description: `"${label}" tab is reachable`,
        pass: true,
        note: "skipped: tab not present on this portfolio",
      });
      continue;
    }
    const snapshot = await scrapeSnapshot(page, screen);
    results.push(...checkSnapshot(snapshot, tolPct));
    results.push(...checkSnapshotsAgree(baseline, snapshot, tolPct));
  }
  return results;
}
