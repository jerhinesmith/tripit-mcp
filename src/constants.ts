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

export const CLIENT_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "X-Tripit-App-Info": "web/0.0.2",
};
