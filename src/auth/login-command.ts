import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import type { FetchLike } from "../http/client.js";
import { login } from "./login.js";
import { SessionStore } from "./session-store.js";

export interface LoginPrompts {
  question: (prompt: string) => Promise<string>;
  password: (prompt: string) => Promise<string>;
  close?: () => void;
}

export interface RunLoginDeps {
  fetchImpl: FetchLike;
  dataDir: string;
  prompts: LoginPrompts;
  log?: (msg: string) => void;
}

export async function runLogin(deps: RunLoginDeps): Promise<void> {
  const log = deps.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  try {
    const email = (await deps.prompts.question("TripIt email: ")).trim();
    if (!email) throw new Error("Email is required.");
    const password = await deps.prompts.password("Password: ");
    if (!password) throw new Error("Password is required.");

    const { jar } = await login(deps.fetchImpl, { email, password });

    const store = new SessionStore(deps.dataDir);
    await store.write(jar);

    log(`✓ Logged in. Session saved to ${deps.dataDir}/session.json`);
  } finally {
    deps.prompts.close?.();
  }
}

export function makeMutedWriter(out: NodeJS.WritableStream): {
  stream: Writable;
  setMuted: (v: boolean) => void;
} {
  let muted = false;
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      if (!muted) {
        const str = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        out.write(str);
      }
      cb();
    },
  });
  return { stream, setMuted: (v) => (muted = v) };
}

export function makeTtyPrompts(): LoginPrompts {
  if (!process.stdin.isTTY) {
    const notATty = () =>
      Promise.reject(
        new Error(
          "`tripit-mcp login` needs an interactive terminal (stdin is not a TTY). " +
            "Run it directly in a terminal.",
        ),
      );
    return { question: notATty, password: notATty };
  }

  const { stream: mutedOut, setMuted } = makeMutedWriter(process.stdout);
  const rl = createInterface({ input: process.stdin, output: mutedOut, terminal: true });

  const ask = (query: string, hidden: boolean): Promise<string> =>
    new Promise((resolve, reject) => {
      setMuted(false);
      rl.question(query, (answer) => {
        if (hidden) {
          setMuted(false);
          process.stdout.write("\n");
        }
        resolve(answer);
      });
      if (hidden) setMuted(true);
      rl.once("error", reject);
    });

  return {
    question: (q) => ask(q, false),
    password: (q) => ask(q, true),
    close: () => rl.close(),
  };
}
