import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const Env = z.object({
  TRIPIT_DATA_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  TRIPIT_SESSION_COOKIE: z.preprocess(emptyToUndefined, z.string().optional()),
  TRIPIT_PROXY_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  HOME: z.string().optional(),
});

export interface Config {
  dataDir: string;
  proxyUrl?: string;
  /** Optional env bootstrap: a manually-captured `Cookie` header value, used
   * once to seed session.json when no session exists yet. */
  cookieSeed?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${msgs}`);
  }
  const e = parsed.data;
  const dataDir = e.TRIPIT_DATA_DIR ?? join(e.HOME ?? homedir(), ".tripit-mcp");
  return { dataDir, proxyUrl: e.TRIPIT_PROXY_URL, cookieSeed: e.TRIPIT_SESSION_COOKIE };
}
