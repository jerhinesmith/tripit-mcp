import { describe, expect, it } from "vitest";
import { cookiesToJar } from "../src/auth/browser-login.js";

describe("cookiesToJar", () => {
  it("converts a Playwright cookie array into a CookieJar", () => {
    const jar = cookiesToJar([
      { name: "session_id", value: "s1" },
      { name: "it_wa_csrf", value: "c1" },
    ]);
    expect(jar.toHeader()).toBe("session_id=s1; it_wa_csrf=c1");
  });

  it("returns an empty jar for an empty cookie array", () => {
    const jar = cookiesToJar([]);
    expect(jar.isEmpty()).toBe(true);
  });

  it("lets the jar's own csrfCandidate heuristic work on the converted cookies", () => {
    const jar = cookiesToJar([
      { name: "it_csrf", value: "formtoken" },
      { name: "it_wa_csrf", value: "apitoken" },
    ]);
    expect(jar.csrfCandidate()).toBe("apitoken");
  });
});
