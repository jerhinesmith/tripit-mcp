export const BASE_URL = "https://www.tripit.com";
export const LOGIN_PATH = "/account/login";

// A real browser's User-Agent and Accept-Language. TripIt's login endpoint
// sits behind Akamai Bot Manager (confirmed 2026-09-22: an unauthenticated
// GET to the login page sets `_abck`/`bm_sz` cookies) — a client sending no
// User-Agent at all is a stronger automated-traffic signal than a slightly
// stale browser string, so this is worth sending even though the exact
// Chrome version will age over time.
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// The fuller client-hint / fetch-metadata bundle Chrome sends alongside
// User-Agent on every top-level page navigation — matches the original HAR
// capture exactly. A User-Agent claiming Chrome 153 with none of these
// accompanying headers is itself an inconsistent fingerprint, which can be
// a stronger bot signal than a generic User-Agent alone (confirmed
// insufficient on its own, live, 2026-09-22). Used for the login page GET,
// the credentials POST, and the redirect-chain GETs that follow it — all of
// which a real browser would render as full page navigations, not XHRs.
export const NAV_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  "sec-ch-ua": '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

export const CLIENT_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "X-Tripit-App-Info": "web/0.0.2",
};
