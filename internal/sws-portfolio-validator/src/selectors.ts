// Central registry of selectors for the Simply Wall St UI.
//
// This is the single tuning point when the site's markup changes: each entry
// is an ordered list of candidate CSS selectors and the scraper uses the
// first one that matches. Prefer stable hooks (data-cy-id attributes) over
// class names; text-based fallbacks live in the journeys via getByRole/
// getByText.

export const selectors = {
  /** Rows in the holdings table / list, one per position. */
  holdingRow: [
    '[data-cy-id="portfolio-holding-row"]',
    '[data-cy-id*="holding-row"]',
    'table[class*="holdings" i] tbody tr',
    '[class*="HoldingsTable" i] tbody tr',
  ],
  /** Ticker/code cell within a holding row. */
  holdingTicker: [
    '[data-cy-id="ticker"]',
    '[data-cy-id*="unique-symbol"]',
    '[class*="ticker" i]',
    "td:first-child",
  ],
  /** Current value cell within a holding row. */
  holdingValue: ['[data-cy-id*="value"]', '[data-col-id="value"]', '[class*="currentValue" i]'],
  /** Portfolio weight cell within a holding row. */
  holdingWeight: ['[data-cy-id*="weight"]', '[data-col-id="weight"]', '[class*="weight" i]'],
  /** Dividend yield cell within a holding row. */
  holdingYield: ['[data-cy-id*="yield"]', '[data-col-id="yield"]', '[class*="yield" i]'],
  /** Headline portfolio total on any screen. */
  portfolioTotal: [
    '[data-cy-id="portfolio-total-value"]',
    '[data-cy-id*="total-value"]',
    '[class*="totalValue" i]',
  ],
  /** Headline portfolio dividend yield. */
  portfolioYield: ['[data-cy-id*="dividend-yield"]', '[class*="dividendYield" i]'],
  /** Links to individual portfolios on the /portfolios list page. */
  portfolioLink: ['a[href*="/portfolio/"]', '[data-cy-id="portfolio-card"] a'],
} as const;

export type SelectorKey = keyof typeof selectors;
