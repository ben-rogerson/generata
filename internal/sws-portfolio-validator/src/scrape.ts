// DOM → PortfolioSnapshot. Best-effort scraping over the selector registry:
// missing pieces come back undefined and the checks layer skips accordingly,
// so a markup change degrades to "skipped" rather than false failures.

import type { Locator, Page } from "playwright";
import type { Holding, PortfolioSnapshot } from "./checks.js";
import { type Amount, parseMoney, parsePercent } from "./numbers.js";
import { type SelectorKey, selectors } from "./selectors.js";

/** First candidate selector that matches anything on the page, if any. */
async function pick(scope: Page | Locator, key: SelectorKey): Promise<Locator | undefined> {
  for (const candidate of selectors[key]) {
    const locator = scope.locator(candidate);
    if ((await locator.count()) > 0) return locator;
  }
  return undefined;
}

async function textOf(scope: Page | Locator, key: SelectorKey): Promise<string | undefined> {
  const locator = await pick(scope, key);
  if (!locator) return undefined;
  const text = await locator.first().textContent();
  return text?.trim() || undefined;
}

async function moneyOf(scope: Page | Locator, key: SelectorKey): Promise<Amount | undefined> {
  const text = await textOf(scope, key);
  return text ? (parseMoney(text) ?? undefined) : undefined;
}

async function percentOf(scope: Page | Locator, key: SelectorKey): Promise<Amount | undefined> {
  const text = await textOf(scope, key);
  return text ? (parsePercent(text) ?? undefined) : undefined;
}

async function scrapeHolding(row: Locator): Promise<Holding | undefined> {
  const ticker = await textOf(row, "holdingTicker");
  if (!ticker) return undefined;
  return {
    ticker,
    value: await moneyOf(row, "holdingValue"),
    weightPct: await percentOf(row, "holdingWeight"),
    dividendYieldPct: await percentOf(row, "holdingYield"),
  };
}

export async function scrapeSnapshot(page: Page, screen: string): Promise<PortfolioSnapshot> {
  await page.waitForLoadState("networkidle");
  const holdings: Holding[] = [];
  const rows = await pick(page, "holdingRow");
  if (rows) {
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const holding = await scrapeHolding(rows.nth(i));
      if (holding) holdings.push(holding);
    }
  }
  return {
    screen,
    totalValue: await moneyOf(page, "portfolioTotal"),
    dividendYieldPct: await percentOf(page, "portfolioYield"),
    holdings,
  };
}

/** Resolve the portfolio page to validate, then return its URL. */
export async function openPortfolio(
  page: Page,
  baseUrl: string,
  portfolioUrl: string | undefined,
): Promise<string> {
  if (portfolioUrl) {
    await page.goto(portfolioUrl, { waitUntil: "domcontentloaded" });
    return portfolioUrl;
  }
  await page.goto(`${baseUrl}/portfolio`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  const link = await pick(page, "portfolioLink");
  if (!link) {
    throw new Error(
      "No portfolio found. Create one on the site first, or set SWS_PORTFOLIO_URL directly.",
    );
  }
  await link.first().click();
  await page.waitForLoadState("networkidle");
  return page.url();
}
