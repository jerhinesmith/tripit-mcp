import { mkdtempSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";
import { SessionStore } from "../src/auth/session-store.js";

describe("SessionStore", () => {
  it("read returns null when no session has been saved", async () => {
    const dir = mkdtempSync(join(tmpdir(), "session-store-"));
    const store = new SessionStore(dir);
    expect(await store.read()).toBeNull();
  });

  it("write then read round-trips the jar's cookies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "session-store-"));
    const store = new SessionStore(dir);
    const jar = new CookieJar();
    jar.applySetCookie(["a=1; Path=/", "b=2; Path=/"]);
    await store.write(jar);
    const restored = await store.read();
    expect(restored?.toHeader()).toBe("a=1; b=2");
  });

  it("writes session.json with mode 600", async () => {
    const dir = mkdtempSync(join(tmpdir(), "session-store-"));
    const store = new SessionStore(dir);
    await store.write(new CookieJar({ a: "1" }));
    const stats = await stat(join(dir, "session.json"));
    expect(stats.mode & 0o777).toBe(0o600);
  });
});
