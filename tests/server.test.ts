import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";
import { SessionStore } from "../src/auth/session-store.js";
import type { Config } from "../src/config.js";
import { buildServer } from "../src/server.js";

function res(status: number, body: string) {
  return {
    status,
    headers: { get: () => null, getSetCookie: () => [] },
    text: async () => body,
  };
}

describe("buildServer", () => {
  it("reads the stored session and registers all read tools", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "server-test-"));
    await new SessionStore(dataDir).write(new CookieJar({ session_id: "s1" }));
    const config: Config = { dataDir };
    const fetchImpl = vi.fn(async () =>
      res(200, JSON.stringify({ Profile: { screen_name: "u" } })),
    );

    const { server } = await buildServer(config, fetchImpl as any);
    expect(server).toBeDefined();
  });

  it("throws a clear error when there is no session and no cookieSeed", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "server-test-"));
    const config: Config = { dataDir };
    await expect(buildServer(config, vi.fn() as any)).rejects.toThrow(/tripit-mcp login/);
  });

  it("bootstraps from cookieSeed when no session file exists yet, and persists it to session.json", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "server-test-"));
    const config: Config = { dataDir, cookieSeed: "session_id=seeded" };
    const { server } = await buildServer(config, vi.fn() as any);
    expect(server).toBeDefined();
    const persisted = await new SessionStore(dataDir).read();
    expect(persisted?.toHeader()).toBe("session_id=seeded");
  });
});
