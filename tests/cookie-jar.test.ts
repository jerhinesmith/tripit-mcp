import { describe, expect, it } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";

describe("CookieJar", () => {
  it("applySetCookie parses name=value and drops attributes", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc123; Path=/; HttpOnly; Secure"]);
    expect(jar.toHeader()).toBe("session_id=abc123");
  });

  it("merges multiple Set-Cookie values, later ones overwriting same-named cookies", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["a=1; Path=/", "b=2; Path=/"]);
    jar.applySetCookie(["a=3; Path=/"]);
    expect(jar.toHeader()).toBe("a=3; b=2");
  });

  it("csrfCandidate finds a cookie whose name looks csrf-related, case-insensitively", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc; Path=/", "csrf_token_wa=XYZ789; Path=/"]);
    expect(jar.csrfCandidate()).toBe("XYZ789");
  });

  it("csrfCandidate returns undefined when no cookie looks csrf-related", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc; Path=/"]);
    expect(jar.csrfCandidate()).toBeUndefined();
  });

  it("isEmpty reflects whether any cookies have been set", () => {
    const jar = new CookieJar();
    expect(jar.isEmpty()).toBe(true);
    jar.applySetCookie(["a=1"]);
    expect(jar.isEmpty()).toBe(false);
  });

  it("toJSON / fromJSON round-trip", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["a=1; Path=/", "b=2; Path=/"]);
    const restored = CookieJar.fromJSON(jar.toJSON());
    expect(restored.toHeader()).toBe(jar.toHeader());
  });

  it("fromCookieHeaderString parses a raw Cookie-header-style string", () => {
    const jar = CookieJar.fromCookieHeaderString("a=1; b=2");
    expect(jar.toHeader()).toBe("a=1; b=2");
  });
});
