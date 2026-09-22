import { ProxyAgent } from "undici";
import type { CookieJar } from "../auth/cookie-jar.js";
import { BASE_URL, CLIENT_HEADERS } from "../constants.js";

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null; getSetCookie?: () => string[] };
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: any) => Promise<FetchResponse>;

export class SessionExpiredError extends Error {
  constructor() {
    super("Run `tripit-mcp login` again to sign in.");
    this.name = "SessionExpiredError";
  }
}

interface Options {
  jar: CookieJar;
  fetchImpl: FetchLike;
  proxyUrl?: string;
}

export class TripitHttpClient {
  private readonly dispatcher?: ProxyAgent;

  constructor(private readonly opts: Options) {
    this.dispatcher = opts.proxyUrl ? new ProxyAgent(opts.proxyUrl) : undefined;
  }

  async getJson<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const csrf = this.opts.jar.csrfCandidate();
    const init: any = {
      method: "GET",
      redirect: "manual",
      headers: {
        ...CLIENT_HEADERS,
        Cookie: this.opts.jar.toHeader(),
        ...(csrf ? { "x-csrf-token-wa": csrf } : {}),
      },
    };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    const r = await this.opts.fetchImpl(url, init);
    this.opts.jar.applySetCookie(r.headers.getSetCookie?.() ?? []);

    if (r.status >= 300 && r.status < 400) {
      throw new SessionExpiredError();
    }
    const body = await r.text();
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`GET ${path} → HTTP ${r.status}`);
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      // Symptom of an expired session TripIt reports with a 200 instead of a
      // redirect: the login page's HTML where JSON was expected.
      throw new SessionExpiredError();
    }
  }
}
