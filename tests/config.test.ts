import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("defaults dataDir to ~/.tripit-mcp under HOME", () => {
    const config = loadConfig({ HOME: "/home/me" });
    expect(config.dataDir).toBe("/home/me/.tripit-mcp");
    expect(config.proxyUrl).toBeUndefined();
    expect(config.cookieSeed).toBeUndefined();
  });

  it("TRIPIT_DATA_DIR overrides the default", () => {
    const config = loadConfig({ HOME: "/home/me", TRIPIT_DATA_DIR: "/custom/dir" });
    expect(config.dataDir).toBe("/custom/dir");
  });

  it("passes through TRIPIT_SESSION_COOKIE as cookieSeed", () => {
    const config = loadConfig({ HOME: "/home/me", TRIPIT_SESSION_COOKIE: "a=1; b=2" });
    expect(config.cookieSeed).toBe("a=1; b=2");
  });

  it("treats an empty-string env var as unset", () => {
    const config = loadConfig({ HOME: "/home/me", TRIPIT_DATA_DIR: "" });
    expect(config.dataDir).toBe("/home/me/.tripit-mcp");
  });

  it("rejects an invalid TRIPIT_PROXY_URL", () => {
    expect(() => loadConfig({ HOME: "/home/me", TRIPIT_PROXY_URL: "not-a-url" })).toThrow(
      /Invalid configuration/,
    );
  });
});
