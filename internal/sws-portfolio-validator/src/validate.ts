// Entry point: run the full user journey against a live portfolio.
//
//   pnpm validate                # everything, including add/adjust/remove
//   pnpm validate:read-only      # skip the write journeys
//
// Exit code 0 = every executed check passed.

import type { CheckResult } from "./checks.js";
import { isLoggedIn, login, openSession } from "./browser.js";
import { loadConfig } from "./config.js";
import { runCrossScreenJourney } from "./journeys/cross-screen.js";
import { runMutationJourney } from "./journeys/mutations.js";
import { runOverviewJourney } from "./journeys/overview.js";
import { printReport } from "./report.js";
import { openPortfolio } from "./scrape.js";

const config = loadConfig();
const session = await openSession(config);
const results: CheckResult[] = [];

try {
  console.log(`→ opening ${config.SWS_BASE_URL}`);
  await session.page.goto(config.SWS_BASE_URL, { waitUntil: "domcontentloaded" });
  if (!(await isLoggedIn(session.page))) {
    console.log("→ logging in");
    await login(session, config);
  }

  console.log("→ opening portfolio");
  const portfolioUrl = await openPortfolio(
    session.page,
    config.SWS_BASE_URL,
    config.SWS_PORTFOLIO_URL,
  );
  console.log(`  ${portfolioUrl}`);

  console.log("→ journey 1/3: overview consistency");
  const overview = await runOverviewJourney(session.page, config.SWS_TOLERANCE_PCT);
  results.push(...overview.results);

  console.log("→ journey 2/3: cross-screen consistency");
  results.push(
    ...(await runCrossScreenJourney(session.page, overview.snapshot, config.SWS_TOLERANCE_PCT)),
  );

  if (config.SWS_SKIP_MUTATIONS) {
    console.log("→ journey 3/3: mutations (skipped via SWS_SKIP_MUTATIONS)");
  } else {
    console.log(`→ journey 3/3: add/adjust/remove ${config.SWS_MUTATION_TICKER}`);
    results.push(
      ...(await runMutationJourney(
        session.page,
        portfolioUrl,
        config.SWS_MUTATION_TICKER,
        config.SWS_TOLERANCE_PCT,
      )),
    );
  }

  await session.saveState();
} finally {
  await session.close();
}

process.exitCode = printReport(results) ? 0 : 1;
