import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CookieJar } from "./auth/cookie-jar.js";
import { SessionStore } from "./auth/session-store.js";
import type { Config } from "./config.js";
import { type FetchLike, TripitHttpClient } from "./http/client.js";
import { TripService } from "./services/trip-service.js";
import { registerReadTools } from "./tools/read-tools.js";

async function resolveJar(store: SessionStore, config: Config): Promise<CookieJar> {
  const stored = await store.read();
  if (stored) return stored;
  if (config.cookieSeed) {
    const jar = CookieJar.fromCookieHeaderString(config.cookieSeed);
    await store.write(jar);
    return jar;
  }
  throw new Error(
    "No TripIt session found. Run `tripit-mcp login` to sign in, or set TRIPIT_SESSION_COOKIE.",
  );
}

export async function buildServer(
  config: Config,
  fetchImpl: FetchLike,
): Promise<{ server: McpServer }> {
  const store = new SessionStore(config.dataDir);
  const jar = await resolveJar(store, config);
  const http = new TripitHttpClient({ jar, fetchImpl, proxyUrl: config.proxyUrl });
  const service = new TripService(http);

  const server = new McpServer({ name: "tripit-mcp", version: "0.1.0" });
  registerReadTools(server, { service });
  return { server };
}
