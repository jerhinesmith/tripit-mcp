import { type Browser, chromium } from "playwright-core";
import { BASE_URL, LOGIN_PATH } from "../constants.js";
import { CookieJar } from "./cookie-jar.js";

export interface BrowserCookie {
  name: string;
  value: string;
}

/** Pure: a Playwright cookie array -> a CookieJar. */
export function cookiesToJar(cookies: BrowserCookie[]): CookieJar {
  return new CookieJar(Object.fromEntries(cookies.map((c) => [c.name, c.value])));
}

export interface LoginWithBrowserDeps {
  log?: (msg: string) => void;
  timeoutMs?: number;
}

/**
 * Opens a real, visible Chrome window on TripIt's login page and waits for
 * you to log in there yourself. TripIt's login sits behind Akamai Bot
 * Manager, which validates a JS-executed browser challenge that no amount
 * of header-spoofing on a plain HTTP client could get past (confirmed live
 * against a real account, multiple attempts, 2026-09-22) — driving a real
 * browser is the only reliable way through it. Your password never touches
 * this process; it goes straight from your keystrokes into the real
 * browser window.
 *
 * Uses your actual installed Chrome (`channel: "chrome"`) rather than a
 * bundled Chromium: smaller install, and the most realistic possible
 * browser fingerprint.
 */
export async function loginWithBrowser(deps: LoginWithBrowserDeps = {}): Promise<CookieJar> {
  const log = deps.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  const timeoutMs = deps.timeoutMs ?? 5 * 60 * 1000;

  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: false });
  } catch (err) {
    throw new Error(
      "Could not launch Chrome. `tripit-mcp login` needs Google Chrome installed " +
        `(${(err as Error).message}).`,
    );
  }

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}${LOGIN_PATH}`);

    log("A Chrome window has opened — log into TripIt there. Waiting for you to finish...");

    try {
      await page.waitForURL(/\/app\//, { timeout: timeoutMs });
    } catch {
      throw new Error(
        "Login didn't complete (timed out, or the browser window was closed). " +
          "Run `tripit-mcp login` again.",
      );
    }

    const cookies = await context.cookies(BASE_URL);
    return cookiesToJar(cookies);
  } finally {
    await browser.close().catch(() => {});
  }
}
