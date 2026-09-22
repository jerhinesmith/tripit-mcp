import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";
import { runLogin } from "../src/auth/login-command.js";
import { SessionStore } from "../src/auth/session-store.js";

describe("runLogin", () => {
  it("runs the browser login, saves the resulting session, and logs success", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "login-cmd-"));
    const jar = new CookieJar({ session_id: "s1" });
    const loginWithBrowser = vi.fn(async () => jar);
    const log = vi.fn();

    await runLogin({ dataDir, log, loginWithBrowser });

    expect(loginWithBrowser).toHaveBeenCalledWith({ log });
    const store = new SessionStore(dataDir);
    const persisted = await store.read();
    expect(persisted?.toHeader()).toBe("session_id=s1");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Logged in"));
  });

  it("propagates a browser-login failure without writing a session file", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "login-cmd-"));
    const loginWithBrowser = vi.fn(async () => {
      throw new Error("Login didn't complete (timed out, or the browser window was closed).");
    });

    await expect(runLogin({ dataDir, loginWithBrowser })).rejects.toThrow(/didn't complete/);

    const store = new SessionStore(dataDir);
    expect(await store.read()).toBeNull();
  });
});
