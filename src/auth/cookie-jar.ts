export interface CookieJarData {
  cookies: Record<string, string>;
}

/**
 * A minimal single-host cookie jar. TripIt's exact session/CSRF cookie names
 * were never directly observed — every captured HAR stripped Set-Cookie —
 * so this stores whatever the server actually sends rather than hardcoding
 * names. See docs/superpowers/specs/2026-09-22-tripit-mcp-design.md, "Open
 * items", for the csrfCandidate() heuristic this enables.
 */
export class CookieJar {
  private readonly cookies: Map<string, string>;

  constructor(initial?: Record<string, string>) {
    this.cookies = new Map(Object.entries(initial ?? {}));
  }

  applySetCookie(setCookieValues: string[]): void {
    for (const raw of setCookieValues) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  toHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  csrfCandidate(): string | undefined {
    // TripIt uses (at least) two differently-scoped cookies whose names
    // contain "csrf" — confirmed live 2026-09-22: `it_csrf` guards the login
    // form's own POST, and `it_wa_csrf` is the one that mirrors into the web
    // app's `x-csrf-token-wa` API header. Prefer a web-app-scoped name
    // (contains "wa") before falling back to the first generic csrf-looking
    // cookie, since a plain /csrf/i scan would always resolve to whichever
    // csrf-named cookie was set first — Map preserves original insertion
    // order even after a later `.set()` on the same key.
    let genericFallback: string | undefined;
    for (const [name, value] of this.cookies) {
      if (!/csrf/i.test(name)) continue;
      if (/wa/i.test(name)) return value;
      if (genericFallback === undefined) genericFallback = value;
    }
    return genericFallback;
  }

  isEmpty(): boolean {
    return this.cookies.size === 0;
  }

  toJSON(): CookieJarData {
    return { cookies: Object.fromEntries(this.cookies) };
  }

  static fromJSON(data: CookieJarData): CookieJar {
    return new CookieJar(data.cookies);
  }

  static fromCookieHeaderString(header: string): CookieJar {
    const jar = new CookieJar();
    for (const pair of header.split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) jar.cookies.set(name, value);
    }
    return jar;
  }
}
