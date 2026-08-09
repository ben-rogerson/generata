# SWS portfolio validator

Drives [simplywall.st](https://simplywall.st) with Playwright the way a real portfolio owner
would — clicking between screens, adding, adjusting and removing holdings — and validates that
every number the UI displays is internally consistent by recomputing it independently from the
other numbers on screen.

The point: if the site's calculations are correct, the displayed total must equal the sum of
the displayed holdings, weights must equal value ÷ total and sum to 100%, the portfolio yield
must be the value-weighted average of holding yields, every screen must agree with every other
screen, and each mutation must move the numbers by exactly the amount the mutation implies.

## Journeys

1. **Overview consistency** — scrape the portfolio landing screen; check totals, weights and
   yield against independent recomputation.
2. **Cross-screen consistency** — click through the Holdings / Returns / Dividends /
   Diversification tabs; each screen is checked internally and against the overview baseline
   (same total, same composition).
3. **Mutations** — add a stock (`SWS_MUTATION_TICKER`), verify it appears and the total grows
   by exactly its value; adjust the share count; remove it; verify the portfolio is back to the
   pre-mutation baseline. Only the ticker the run added is ever touched.

## Setup

```bash
pnpm install               # from the repo root

# one-off: log in interactively (handles captcha / social auth) and save the session
cd internal/sws-portfolio-validator
pnpm auth
```

Alternatively set `SWS_EMAIL` / `SWS_PASSWORD` and the validator logs in itself.

## Run

```bash
pnpm validate              # all three journeys
pnpm validate:read-only    # journeys 1–2 only, no writes to the portfolio
```

Exit code 0 means every executed check passed. Checks that can't run (a screen doesn't show
the data, a tab doesn't exist for the portfolio) are reported as skipped, not failed.

## Configuration

All via environment variables, validated in `src/config.ts`:

| Variable              | Default                    | Purpose                                  |
| --------------------- | -------------------------- | ---------------------------------------- |
| `SWS_BASE_URL`        | `https://simplywall.st`    | Site under test (point at staging)       |
| `SWS_PORTFOLIO_URL`   | first portfolio on account | Direct link to the portfolio to validate |
| `SWS_EMAIL/PASSWORD`  | –                          | Credential login (else use `pnpm auth`)  |
| `SWS_STORAGE_STATE`   | `.auth/storage-state.json` | Saved session location (gitignored)      |
| `SWS_MUTATION_TICKER` | `BHP`                      | Ticker used by the add/remove journey    |
| `SWS_SKIP_MUTATIONS`  | `false`                    | Skip journey 3                           |
| `SWS_TOLERANCE_PCT`   | `0.5`                      | Relative tolerance on top of rounding    |
| `SWS_HEADLESS`        | `true`                     | Headed mode for debugging                |
| `SWS_SLOW_MO_MS`      | `0`                        | Slow down actions when watching          |
| `SWS_CHROMIUM_PATH`   | –                          | Chromium binary override for CI images   |

## How tolerance works

The UI abbreviates numbers ("AU$1.2k"), so exact comparison would be noise. Every scraped
number carries the uncertainty implied by its rendering (half the unit of the last displayed
digit — `1.2k` means ±50), uncertainties propagate through sums and derived values, and two
numbers "agree" when they're within combined uncertainty plus `SWS_TOLERANCE_PCT`. A genuine
calculation bug still fails; display rounding never does.

## When the site's markup changes

All DOM knowledge lives in `src/selectors.ts` (ordered candidate selectors, first match wins)
and the role/text-based flows in `src/journeys/`. Scrape failures degrade to skipped checks
with a note pointing here, so a redesign shows up as a wall of skips — not false failures.

## Layout

```
src/
├── config.ts        # zod-validated env config
├── numbers.ts       # money/percent parsing with rounding-aware precision
├── checks.ts        # pure validation rules (unit-tested, no browser)
├── report.ts        # terminal reporter
├── browser.ts       # playwright session + auth
├── selectors.ts     # the single DOM tuning point
├── scrape.ts        # DOM → PortfolioSnapshot
├── validate.ts      # entry point
├── auth.ts          # interactive login, saves storage state
└── journeys/        # overview, cross-screen, mutations
```
