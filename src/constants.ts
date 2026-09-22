export const BASE_URL = "https://www.tripit.com";
export const LOGIN_PATH = "/account/login";

// A real browser's User-Agent and Accept-Language, folded into the
// authenticated API client's headers below. TripIt sits behind Akamai Bot
// Manager (confirmed 2026-09-22 against the login endpoint specifically —
// see src/auth/browser-login.ts for why login itself goes through a real
// browser rather than this header set alone) — a client sending no
// User-Agent at all is a stronger automated-traffic signal than a slightly
// stale browser string, so this is worth sending on API calls too even
// though the exact Chrome version will age over time.
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
