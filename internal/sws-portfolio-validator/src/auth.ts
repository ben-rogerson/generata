// One-off interactive login: opens a headed browser, lets you complete the
// login (including any captcha / social auth), then saves the session to the
// storage-state file that `pnpm validate` reuses.

import { isLoggedIn, openSession } from "./browser.js";
import { loadConfig } from "./config.js";

const config = loadConfig({ ...process.env, SWS_HEADLESS: "false" });
const session = await openSession(config);

try {
  await session.page.goto(`${config.SWS_BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  console.log("Complete the login in the browser window…");
  await session.page.waitForURL((url) => !url.pathname.includes("login"), {
    timeout: 5 * 60 * 1000,
  });
  await session.page.waitForLoadState("networkidle");
  if (!(await isLoggedIn(session.page))) {
    throw new Error("Still logged out after the redirect — try again.");
  }
  await session.saveState();
  console.log(`Saved auth state to ${config.SWS_STORAGE_STATE}. You can now run: pnpm validate`);
} finally {
  await session.close();
}
