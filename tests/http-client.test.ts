import { describe, expect, it, vi } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";
import { SessionExpiredError, TripitHttpClient } from "../src/http/client.js";

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

describe("TripitHttpClient.getJson", () => {
  it("sends the jar's Cookie header and the csrf candidate header", async () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc; Path=/", "csrf_token_wa=XYZ; Path=/"]);
    const fetchImpl = vi.fn(async () => res(200, JSON.stringify({ ok: true })));
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await client.getJson("/api/v2/get/profile");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.tripit.com/api/v2/get/profile");
    expect(init.headers.Cookie).toBe("session_id=abc; csrf_token_wa=XYZ");
    expect(init.headers["x-csrf-token-wa"]).toBe("XYZ");
    expect(init.redirect).toBe("manual");
  });

  it("returns the parsed JSON body on 200", async () => {
    const jar = new CookieJar({ a: "1" });
    const fetchImpl = vi.fn(async () => res(200, JSON.stringify({ hello: "world" })));
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await expect(client.getJson("/x")).resolves.toEqual({ hello: "world" });
  });

  it("throws SessionExpiredError on a redirect response, and still merges any Set-Cookie", async () => {
    const jar = new CookieJar({ a: "1" });
    const fetchImpl = vi.fn(async () =>
      res(302, "", { location: ["https://www.tripit.com/account/login"], "set-cookie": ["b=2; Path=/"] }),
    );
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await expect(client.getJson("/x")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(jar.toHeader()).toContain("b=2");
  });

  it("throws SessionExpiredError when a 200 response isn't valid JSON (e.g. the login page HTML)", async () => {
    const jar = new CookieJar({ a: "1" });
    const fetchImpl = vi.fn(async () => res(200, "<!DOCTYPE html>not json"));
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await expect(client.getJson("/x")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws a plain error with the status on other non-2xx responses (404, 500)", async () => {
    const jar = new CookieJar({ a: "1" });
    const client = new TripitHttpClient({
      jar,
      fetchImpl: vi.fn(async () => res(404, "not found")) as any,
    });
    await expect(client.getJson("/x")).rejects.toThrow(/HTTP 404/);

    const client500 = new TripitHttpClient({
      jar,
      fetchImpl: vi.fn(async () => res(500, "boom")) as any,
    });
    await expect(client500.getJson("/y")).rejects.toThrow(/HTTP 500/);
  });
});
