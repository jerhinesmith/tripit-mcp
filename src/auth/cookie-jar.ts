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
    for (const [name, value] of this.cookies) {
      if (/csrf/i.test(name)) return value;
    }
    return undefined;
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
