// Playwright session management: launch, restore auth state, log in.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Browser, type BrowserContext, type Page, chromium } from "playwright";
import type { Config } from "./config.js";

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Persist the current auth cookies back to the storage-state file. */
  saveState: () => Promise<void>;
  close: () => Promise<void>;
}

async function launch(config: Config): Promise<Browser> {
  const options = { headless: config.SWS_HEADLESS, slowMo: config.SWS_SLOW_MO_MS };
  try {
    return await chromium.launch(options);
  } catch (error) {
    // Managed CI images ship chromium outside playwright's registry; retry
    // with the conventional path (or an explicit override) before giving up.
    const fallback = config.SWS_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
    if (existsSync(fallback)) {
      return await chromium.launch({ ...options, executablePath: fallback });
    }
    throw error;
  }
}

export async function openSession(config: Config): Promise<Session> {
  const browser = await launch(config);
  const statePath = resolve(config.SWS_STORAGE_STATE);
  const context = await browser.newContext({
    ...(existsSync(statePath) ? { storageState: statePath } : {}),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    saveState: async () => {
      mkdirSync(dirname(statePath), { recursive: true });
      await context.storageState({ path: statePath });
    },
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

/** True when the current page is behind an authenticated session. */
export async function isLoggedIn(page: Page): Promise<boolean> {
  // The logged-out shell always renders a Log in entry point.
  const loginButton = page
    .getByRole("link", { name: /log ?in/i })
    .or(page.getByRole("button", { name: /log ?in/i }));
  try {
    return !(await loginButton.first().isVisible({ timeout: 3000 }));
  } catch {
    return true;
  }
}

/** Email/password login flow. Requires SWS_EMAIL and SWS_PASSWORD. */
export async function login(session: Session, config: Config): Promise<void> {
  const { page } = session;
  if (!config.SWS_EMAIL || !config.SWS_PASSWORD) {
    throw new Error(
      "Not logged in and SWS_EMAIL/SWS_PASSWORD are unset. " +
        "Run `pnpm auth` once to log in interactively and save a storage state.",
    );
  }
  await page.goto(`${config.SWS_BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  const email = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
  await email.first().fill(config.SWS_EMAIL);
  const password = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
  await password.first().fill(config.SWS_PASSWORD);
  await page
    .getByRole("button", { name: /log ?in|sign ?in/i })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  if (!(await isLoggedIn(page))) {
    throw new Error("Login failed — check credentials, or run `pnpm auth` to log in manually.");
  }
  await session.saveState();
}
