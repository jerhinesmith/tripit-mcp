import { describe, expect, it, vi } from "vitest";
import { login } from "../src/auth/login.js";

const LOGIN_PAGE_HTML = '<form><input type="hidden" name="csrf_token" value="TOKEN123" /></form>';

function res(status: number, body: string, headers: Record<string, string[]> = {}) {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()]?.[0] ?? null,
      getSetCookie: () => headers["set-cookie"] ?? [],
    },
    text: async () => body,
  };
}

describe("login()", () => {
  it("scrapes the csrf token, POSTs the exact captured field shape, and follows the redirect chain to success", async () => {
    const calls: Array<[string, any]> = [];
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push([url, init]);
      if (calls.length === 1) {
        return res(200, LOGIN_PAGE_HTML, { "set-cookie": ["preauth=p1; Path=/"] });
      }
      if (calls.length === 2) {
        return res(302, "", {
          location: ["https://www.tripit.com/home"],
          "set-cookie": ["session_id=s1; Path=/"],
        });
      }
      if (calls.length === 3) {
        return res(302, "", {
          location: ["https://www.tripit.com/app/"],
          "set-cookie": ["csrf_token_wa=c1; Path=/"],
        });
      }
      if (calls.length === 4) {
        return res(200, "<html>app shell</html>");
      }
      // call 5: the post-login profile-verification GET
      return res(200, JSON.stringify({ Profile: { screen_name: "u" } }));
    });

    const { jar } = await login(fetchImpl as any, { email: "me@example.com", password: "secret" });

    expect(calls[0][0]).toBe("https://www.tripit.com/account/login");
    expect(calls[1][0]).toBe("https://www.tripit.com/account/login");
    expect(calls[1][1].method).toBe("POST");
    const body = new URLSearchParams(calls[1][1].body);
    expect(Object.fromEntries(body)).toEqual({
      csrf_token: "TOKEN123",
      errors: "",
      toc: "1",
      redirect_url: "home/index",
      login_email_address: "me@example.com",
      login_password: "secret",
    });

    expect(jar.toHeader()).toContain("preauth=p1");
    expect(jar.toHeader()).toContain("session_id=s1");
    expect(jar.toHeader()).toContain("csrf_token_wa=c1");

    // every request should look like it came from a real browser, since
    // TripIt's login endpoint sits behind Akamai Bot Manager
    for (const [, init] of calls) {
      expect(init.headers["User-Agent"]).toContain("Mozilla");
      expect(init.headers["Accept-Language"]).toBe("en-US,en;q=0.9");
    }
  });

  it("throws a clear error when the login page has no csrf_token field", async () => {
    const fetchImpl = vi.fn(async () => res(200, "<form>no token here</form>"));
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "secret" }),
    ).rejects.toThrow(/csrf_token/);
  });

  it("throws a clear error when the POST redirects back to the login page", async () => {
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      if (init.method !== "POST" && !url.includes("account/login"))
        return res(200, LOGIN_PAGE_HTML);
      if (init.method === undefined || init.method === "GET") return res(200, LOGIN_PAGE_HTML);
      return res(302, "", { location: ["https://www.tripit.com/account/login?errors=1"] });
    });
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "wrong" }),
    ).rejects.toThrow(/check your email and password/i);
  });

  it("throws a clear error when the POST returns 200 without redirecting at all", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      if (init.method === "POST") return res(200, "<form>invalid credentials</form>");
      return res(200, LOGIN_PAGE_HTML);
    });
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "wrong" }),
    ).rejects.toThrow(/check your email and password/i);
  });

  it("throws a clear error when the redirect lands somewhere other than /account/login but the session doesn't actually work (e.g. an MFA interstitial)", async () => {
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      if (init.method === undefined || init.method === "GET") {
        if (url === "https://www.tripit.com/account/login") return res(200, LOGIN_PAGE_HTML);
        // both the interstitial landing page and the verification call return
        // the same non-JSON HTML, since neither is a real profile response
        return res(200, "<html>enter your verification code</html>");
      }
      // POST credentials
      return res(302, "", { location: ["https://www.tripit.com/account/verify"] });
    });
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "secret" }),
    ).rejects.toThrow(/session was rejected/i);
  });

  it("refuses to follow a redirect to a different origin", async () => {
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      if (init.method === "GET" && url === "https://www.tripit.com/account/login") {
        return res(200, LOGIN_PAGE_HTML);
      }
      if (init.method === "POST") {
        return res(302, "", { location: ["https://evil.example/steal"] });
      }
      throw new Error("should not be reached");
    });
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "secret" }),
    ).rejects.toThrow(/different origin/i);
  });
});
