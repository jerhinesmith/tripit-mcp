import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeMutedWriter, runLogin } from "../src/auth/login-command.js";
import { SessionStore } from "../src/auth/session-store.js";

const LOGIN_PAGE_HTML = '<form><input type="hidden" name="csrf_token" value="T1" /></form>';

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

function fakePrompts(answers: { email: string; password: string }) {
  return {
    question: vi.fn(async () => answers.email),
    password: vi.fn(async () => answers.password),
    close: vi.fn(),
  };
}

describe("runLogin", () => {
  it("prompts for credentials, logs in, and saves the session", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "login-cmd-"));
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) return res(200, LOGIN_PAGE_HTML);
      if (call === 2) {
        return res(302, "", {
          location: ["https://www.tripit.com/home"],
          "set-cookie": ["session_id=s1; Path=/"],
        });
      }
      if (call === 3) return res(200, "<html>app</html>");
      // call 4: the post-login profile-verification GET
      return res(200, JSON.stringify({ Profile: { screen_name: "u" } }));
    });
    const prompts = fakePrompts({ email: "me@example.com", password: "secret" });

    await runLogin({ fetchImpl: fetchImpl as any, dataDir, prompts });

    expect(prompts.close).toHaveBeenCalled();
    const store = new SessionStore(dataDir);
    const jar = await store.read();
    expect(jar?.toHeader()).toContain("session_id=s1");
  });

  it("rejects an empty email without making any network call", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "login-cmd-"));
    const fetchImpl = vi.fn();
    const prompts = fakePrompts({ email: "", password: "secret" });
    await expect(runLogin({ fetchImpl: fetchImpl as any, dataDir, prompts })).rejects.toThrow(
      /email is required/i,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prompts.close).toHaveBeenCalled();
  });

  it("rejects an empty password without making any network call", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "login-cmd-"));
    const fetchImpl = vi.fn();
    const prompts = fakePrompts({ email: "me@example.com", password: "" });
    await expect(runLogin({ fetchImpl: fetchImpl as any, dataDir, prompts })).rejects.toThrow(
      /password is required/i,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("makeMutedWriter", () => {
  it("passes writes through when not muted, and swallows them when muted", () => {
    const chunks: string[] = [];
    const out = { write: (c: string) => chunks.push(c) } as any;
    const { stream, setMuted } = makeMutedWriter(out);
    stream.write("visible");
    setMuted(true);
    stream.write("hidden");
    setMuted(false);
    stream.write("visible-again");
    expect(chunks).toEqual(["visible", "visible-again"]);
  });
});
