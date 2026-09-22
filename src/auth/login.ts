import { BASE_URL, BROWSER_HEADERS, LOGIN_PATH, NAV_HEADERS } from "../constants.js";
import type { FetchLike } from "../http/client.js";
import { CookieJar } from "./cookie-jar.js";

export interface LoginCreds {
  email: string;
  password: string;
}

export interface LoginResult {
  jar: CookieJar;
}

const CSRF_PATTERNS = [
  /name=["']csrf_token["']\s+value=["']([^"']+)["']/i,
  /value=["']([^"']+)["']\s+name=["']csrf_token["']/i,
];

function scrapeCsrfToken(html: string): string {
  for (const re of CSRF_PATTERNS) {
    const m = html.match(re);
    if (m) return m[1];
  }
  throw new Error(
    "Login failed: could not find a csrf_token field on the TripIt login page. " +
      "TripIt may have changed their login form.",
  );
}

/**
 * Reverse-engineered from a single captured login (see the design spec's
 * "Open items"): GET the login page for a pre-auth cookie + csrf_token, POST
 * credentials, then follow the redirect chain by hand. Automatic
 * `redirect: "follow"` is deliberately NOT used — it would not expose the
 * intermediate 302 responses' Set-Cookie headers, and the session cookie is
 * set on exactly one of those intermediate hops.
 */
export async function login(fetchImpl: FetchLike, creds: LoginCreds): Promise<LoginResult> {
  const jar = new CookieJar();

  const loginPage = await fetchImpl(`${BASE_URL}${LOGIN_PATH}`, {
    method: "GET",
    redirect: "manual",
    headers: { ...NAV_HEADERS, Accept: "text/html" },
  });
  jar.applySetCookie(loginPage.headers.getSetCookie?.() ?? []);
  if (loginPage.status < 200 || loginPage.status >= 300) {
    throw new Error(`Login failed: could not load the login page (HTTP ${loginPage.status}).`);
  }
  const csrfToken = scrapeCsrfToken(await loginPage.text());

  const body = new URLSearchParams({
    csrf_token: csrfToken,
    errors: "",
    toc: "1",
    redirect_url: "home/index",
    login_email_address: creds.email,
    login_password: creds.password,
  }).toString();

  let nextUrl = `${BASE_URL}${LOGIN_PATH}`;
  let nextInit: any = {
    method: "POST",
    redirect: "manual",
    headers: {
      ...NAV_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: BASE_URL,
      Referer: `${BASE_URL}${LOGIN_PATH}`,
      Cookie: jar.toHeader(),
    },
    body,
  };
  let lastLocation = LOGIN_PATH; // stays LOGIN_PATH unless we actually get redirected away

  for (let hop = 0; hop < 5; hop++) {
    const r = await fetchImpl(nextUrl, nextInit);
    jar.applySetCookie(r.headers.getSetCookie?.() ?? []);

    if (r.status < 300 || r.status >= 400) break; // not a redirect — chain ends here

    const loc = r.headers.get("location");
    if (!loc) break;
    const resolved = new URL(loc, BASE_URL);
    if (resolved.origin !== new URL(BASE_URL).origin) {
      throw new Error(
        `Login failed: refused to follow a redirect to a different origin (${resolved.origin}).`,
      );
    }
    lastLocation = loc;
    nextUrl = resolved.toString();
    nextInit = {
      method: "GET",
      redirect: "manual",
      headers: { ...NAV_HEADERS, Cookie: jar.toHeader() },
    };
  }

  if (/\/account\/login/.test(lastLocation)) {
    throw new Error("Login failed: check your email and password.");
  }

  // Verify the session actually works: a redirect chain that lands somewhere
  // other than /account/login (an MFA/verification interstitial, say) is not
  // proof of success. A real API call is the only way to know, and this
  // doubles as the live smoke test for the CSRF-cookie-mirroring assumption
  // (see the design spec's "Open items").
  const csrf = jar.csrfCandidate();
  const verify = await fetchImpl(`${BASE_URL}/api/v2/get/profile`, {
    method: "GET",
    redirect: "manual",
    headers: {
      ...BROWSER_HEADERS,
      Accept: "application/json",
      Cookie: jar.toHeader(),
      ...(csrf ? { "x-csrf-token-wa": csrf } : {}),
    },
  });
  jar.applySetCookie(verify.headers.getSetCookie?.() ?? []);
  const verifyBody = await verify.text();
  let verifyOk = verify.status >= 200 && verify.status < 300;
  if (verifyOk) {
    try {
      JSON.parse(verifyBody);
    } catch {
      verifyOk = false;
    }
  }
  if (!verifyOk) {
    throw new Error(
      "Login redirected away from the login page but the session was rejected. " +
        "TripIt may have prompted for a verification code, or its CSRF cookie " +
        "name may have changed.",
    );
  }

  return { jar };
}
