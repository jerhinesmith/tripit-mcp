# tripit-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only MCP server exposing a personal TripIt account's trips and full itinerary (flights, hotels, cars, activities) over stdio, authenticated via a scraped login flow against TripIt's private web-app API.

**Architecture:** Three layers mirroring `strong-mcp`: an auth/session layer (login flow + persisted cookie jar), an API client layer (typed endpoint wrappers + normalization of TripIt's XML-derived JSON), and an MCP tool layer (thin read-only tools over a `TripService`).

**Tech Stack:** TypeScript (Node ≥ 20), `@modelcontextprotocol/sdk` (stdio transport), `undici` (HTTP), `zod` (tool input schemas), `vitest` (tests), `biome` (lint/format) — identical dependency set to `strong-mcp`.

**Spec:** `docs/superpowers/specs/2026-09-22-tripit-mcp-design.md`

## Global Constraints

- Node.js ≥ 20.
- Dependencies limited to `@modelcontextprotocol/sdk`, `undici`, `zod` (+ dev: `typescript`, `vitest`, `biome`, `tsx`, `@types/node`) — no additional runtime dependencies.
- Read-only in v1 — no write/mutation tools.
- The TripIt password is never persisted to disk — only the resulting session (cookie jar) is.
- Session file (`session.json`) is written with mode `600`.
- No auto-relogin on session expiry — tool calls fail with a clear "run `tripit-mcp login` again" message.
- Normalization fails loudly on unrecognized shapes rather than silently dropping fields.
- Only sanitized fixtures are committed to this repo — no real names/emails/phones/confirmation numbers from the source HAR captures, even though those captures contained real personal data.

## Review Focus

- Wrong password on `tripit-mcp login` — expect a clear "check your email and password" error, not a crash or silent false-success. (Task 5)
- Session expired mid-conversation — expect the "run `tripit-mcp login` again" message from any tool call, not a raw HTTP/parse error. (Task 4, Task 10)
- A trip with a single flight segment or a single car rental — TripIt returns `Segment`/`CarObject` as a bare object (not an array) in that case; expect it to normalize the same as the multi-item case, not crash or silently disappear. (Task 8, Task 9)
- Inconsistent `total_cost` formatting (`"3099.86 USD"` vs `"$428.35 USD"`) — expect both to parse to the same `{amount, currency}` shape rather than one silently falling back to a raw string. (Task 8)
- `tripit_get_trip` called with a uuid the account can't access, or a dead endpoint (404/5xx) — expect a clear tool error, not an unhandled exception. (Task 4)

---

## Task 1: Project scaffold + config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `biome.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): Config`, `interface Config { dataDir: string; proxyUrl?: string; cookieSeed?: string }` — every later task that needs the data directory or an env-driven bootstrap reads it from here.

- [ ] **Step 1: Create project scaffold files**

`package.json`:

```json
{
  "name": "tripit-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "tripit-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "node --loader tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src tests",
    "lint:fix": "biome check --write src tests",
    "format": "biome format --write src tests"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.11.0",
    "undici": "^6.19.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.5",
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=20" }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.5/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["src/**", "tests/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true, "suspicious": { "noExplicitAny": "off" } } },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  },
  "overrides": [
    {
      "includes": ["tests/**"],
      "linter": {
        "rules": {
          "complexity": { "noBannedTypes": "off" },
          "style": { "noNonNullAssertion": "off" }
        }
      }
    }
  ]
}
```

`.gitignore`:

```
node_modules/
dist/
.env
.env.local
.env.*.local
*.log
.tripit-mcp/
session.json
.DS_Store
.superpowers/
```

`.env.example`:

```
# Preferred setup: run `tripit-mcp login` once to sign in with your TripIt
# email + password. It saves your session to session.json — no secrets
# needed here, and the password itself is never written to disk.

# Optional: data dir for session.json (default: ~/.tripit-mcp)
# TRIPIT_DATA_DIR=

# Optional bootstrap: seed session.json from a manually-captured `Cookie`
# header string instead of running `login`. Used once, then session.json
# is authoritative.
# TRIPIT_SESSION_COOKIE=

# Optional: dev proxy (e.g. Proxyman) http://localhost:9090
# TRIPIT_PROXY_URL=
```

- [ ] **Step 2: Write the failing config test**

`tests/config.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npx vitest run tests/config.test.ts`
Expected: FAIL — `src/config.ts` does not exist yet.

- [ ] **Step 4: Implement config.ts**

`src/config.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes, then typecheck**

Run: `npx vitest run tests/config.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts biome.json .gitignore .env.example src/config.ts tests/config.test.ts
git commit -m "Scaffold project and add env config loader"
```

---

## Task 2: Atomic JSON storage

**Files:**
- Create: `src/storage/atomic-json.ts`
- Test: `tests/atomic-json.test.ts`

**Interfaces:**
- Produces: `readJson<T>(path: string): Promise<T | null>`, `writeJsonAtomic(path: string, value: unknown, mode?: number): Promise<void>` — used by Task 3's `SessionStore` for `session.json`.

- [ ] **Step 1: Write the failing tests**

`tests/atomic-json.test.ts`:

```typescript
import { mkdtempSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJson, writeJsonAtomic } from "../src/storage/atomic-json.js";

describe("atomic-json", () => {
  it("readJson returns null when the file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    expect(await readJson(join(dir, "missing.json"))).toBeNull();
  });

  it("readJson throws on corrupt JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    const path = join(dir, "bad.json");
    await writeFile(path, "{not valid json");
    await expect(readJson(path)).rejects.toThrow();
  });

  it("writeJsonAtomic creates parent directories and round-trips the value", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    const path = join(dir, "nested", "value.json");
    await writeJsonAtomic(path, { a: 1, b: [1, 2, 3] });
    expect(await readJson(path)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("writeJsonAtomic applies the given file mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    const path = join(dir, "secret.json");
    await writeJsonAtomic(path, { token: "x" }, 0o600);
    const stats = await stat(path);
    expect(stats.mode & 0o777).toBe(0o600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/atomic-json.test.ts`
Expected: FAIL — `src/storage/atomic-json.ts` does not exist yet.

- [ ] **Step 3: Implement atomic-json.ts**

`src/storage/atomic-json.ts`:

```typescript
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJson<T>(path: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(raw) as T; // throws on corrupt JSON — intentional
}

export async function writeJsonAtomic(path: string, value: unknown, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), mode !== undefined ? { mode } : "utf8");
  if (mode !== undefined) await chmod(tmp, mode);
  await rename(tmp, path);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/atomic-json.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/atomic-json.ts tests/atomic-json.test.ts
git commit -m "Add atomic JSON read/write storage helper"
```

---

## Task 3: Cookie jar + session store

**Files:**
- Create: `src/auth/cookie-jar.ts`
- Create: `src/auth/session-store.ts`
- Test: `tests/cookie-jar.test.ts`
- Test: `tests/session-store.test.ts`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic` from `../storage/atomic-json.js` (Task 2).
- Produces: `class CookieJar` with `applySetCookie(values: string[])`, `toHeader(): string`, `csrfCandidate(): string | undefined`, `isEmpty(): boolean`, `toJSON(): CookieJarData`, static `fromJSON(data: CookieJarData): CookieJar`, static `fromCookieHeaderString(header: string): CookieJar`; `class SessionStore` with `read(): Promise<CookieJar | null>`, `write(jar: CookieJar): Promise<void>`. Task 4 (http client) and Task 5 (login) both consume `CookieJar`; Task 11 (server wiring) consumes `SessionStore`.

- [ ] **Step 1: Write the failing cookie-jar tests**

`tests/cookie-jar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";

describe("CookieJar", () => {
  it("applySetCookie parses name=value and drops attributes", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc123; Path=/; HttpOnly; Secure"]);
    expect(jar.toHeader()).toBe("session_id=abc123");
  });

  it("merges multiple Set-Cookie values, later ones overwriting same-named cookies", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["a=1; Path=/", "b=2; Path=/"]);
    jar.applySetCookie(["a=3; Path=/"]);
    expect(jar.toHeader()).toBe("a=3; b=2");
  });

  it("csrfCandidate finds a cookie whose name looks csrf-related, case-insensitively", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc; Path=/", "csrf_token_wa=XYZ789; Path=/"]);
    expect(jar.csrfCandidate()).toBe("XYZ789");
  });

  it("csrfCandidate returns undefined when no cookie looks csrf-related", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc; Path=/"]);
    expect(jar.csrfCandidate()).toBeUndefined();
  });

  it("isEmpty reflects whether any cookies have been set", () => {
    const jar = new CookieJar();
    expect(jar.isEmpty()).toBe(true);
    jar.applySetCookie(["a=1"]);
    expect(jar.isEmpty()).toBe(false);
  });

  it("toJSON / fromJSON round-trip", () => {
    const jar = new CookieJar();
    jar.applySetCookie(["a=1; Path=/", "b=2; Path=/"]);
    const restored = CookieJar.fromJSON(jar.toJSON());
    expect(restored.toHeader()).toBe(jar.toHeader());
  });

  it("fromCookieHeaderString parses a raw Cookie-header-style string", () => {
    const jar = CookieJar.fromCookieHeaderString("a=1; b=2");
    expect(jar.toHeader()).toBe("a=1; b=2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cookie-jar.test.ts`
Expected: FAIL — `src/auth/cookie-jar.ts` does not exist yet.

- [ ] **Step 3: Implement cookie-jar.ts**

`src/auth/cookie-jar.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cookie-jar.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing session-store tests**

`tests/session-store.test.ts`:

```typescript
import { mkdtempSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";
import { SessionStore } from "../src/auth/session-store.js";

describe("SessionStore", () => {
  it("read returns null when no session has been saved", async () => {
    const dir = mkdtempSync(join(tmpdir(), "session-store-"));
    const store = new SessionStore(dir);
    expect(await store.read()).toBeNull();
  });

  it("write then read round-trips the jar's cookies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "session-store-"));
    const store = new SessionStore(dir);
    const jar = new CookieJar();
    jar.applySetCookie(["a=1; Path=/", "b=2; Path=/"]);
    await store.write(jar);
    const restored = await store.read();
    expect(restored?.toHeader()).toBe("a=1; b=2");
  });

  it("writes session.json with mode 600", async () => {
    const dir = mkdtempSync(join(tmpdir(), "session-store-"));
    const store = new SessionStore(dir);
    await store.write(new CookieJar({ a: "1" }));
    const stats = await stat(join(dir, "session.json"));
    expect(stats.mode & 0o777).toBe(0o600);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/session-store.test.ts`
Expected: FAIL — `src/auth/session-store.ts` does not exist yet.

- [ ] **Step 7: Implement session-store.ts**

`src/auth/session-store.ts`:

```typescript
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "../storage/atomic-json.js";
import { CookieJar, type CookieJarData } from "./cookie-jar.js";

export class SessionStore {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, "session.json");
  }

  async read(): Promise<CookieJar | null> {
    const data = await readJson<CookieJarData>(this.path);
    return data ? CookieJar.fromJSON(data) : null;
  }

  write(jar: CookieJar): Promise<void> {
    return writeJsonAtomic(this.path, jar.toJSON(), 0o600);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/session-store.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/auth/cookie-jar.ts src/auth/session-store.ts tests/cookie-jar.test.ts tests/session-store.test.ts
git commit -m "Add cookie jar and session persistence"
```

---

## Task 4: Authenticated HTTP client

**Files:**
- Create: `src/constants.ts`
- Create: `src/http/client.ts`
- Test: `tests/http-client.test.ts`

**Interfaces:**
- Consumes: `CookieJar` (Task 3).
- Produces: `type FetchLike`, `class SessionExpiredError extends Error`, `class TripitHttpClient` with constructor `{ jar: CookieJar; fetchImpl: FetchLike; proxyUrl?: string }` and `getJson<T>(path: string): Promise<T>`. Task 5 (login), Task 7 (endpoints), and Task 11 (server wiring) all depend on this exact shape.

- [ ] **Step 1: Create constants.ts**

`src/constants.ts`:

```typescript
export const BASE_URL = "https://www.tripit.com";
export const LOGIN_PATH = "/account/login";

export const CLIENT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "X-Tripit-App-Info": "web/0.0.2",
};
```

- [ ] **Step 2: Write the failing http-client tests**

`tests/http-client.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { CookieJar } from "../src/auth/cookie-jar.js";
import { SessionExpiredError, TripitHttpClient } from "../src/http/client.js";

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

describe("TripitHttpClient.getJson", () => {
  it("sends the jar's Cookie header and the csrf candidate header", async () => {
    const jar = new CookieJar();
    jar.applySetCookie(["session_id=abc; Path=/", "csrf_token_wa=XYZ; Path=/"]);
    const fetchImpl = vi.fn(async () => res(200, JSON.stringify({ ok: true })));
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await client.getJson("/api/v2/get/profile");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.tripit.com/api/v2/get/profile");
    expect(init.headers.Cookie).toBe("session_id=abc; csrf_token_wa=XYZ");
    expect(init.headers["x-csrf-token-wa"]).toBe("XYZ");
    expect(init.redirect).toBe("manual");
  });

  it("returns the parsed JSON body on 200", async () => {
    const jar = new CookieJar({ a: "1" });
    const fetchImpl = vi.fn(async () => res(200, JSON.stringify({ hello: "world" })));
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await expect(client.getJson("/x")).resolves.toEqual({ hello: "world" });
  });

  it("throws SessionExpiredError on a redirect response, and still merges any Set-Cookie", async () => {
    const jar = new CookieJar({ a: "1" });
    const fetchImpl = vi.fn(async () =>
      res(302, "", { location: ["https://www.tripit.com/account/login"], "set-cookie": ["b=2; Path=/"] }),
    );
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await expect(client.getJson("/x")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(jar.toHeader()).toContain("b=2");
  });

  it("throws SessionExpiredError when a 200 response isn't valid JSON (e.g. the login page HTML)", async () => {
    const jar = new CookieJar({ a: "1" });
    const fetchImpl = vi.fn(async () => res(200, "<!DOCTYPE html>not json"));
    const client = new TripitHttpClient({ jar, fetchImpl: fetchImpl as any });
    await expect(client.getJson("/x")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws a plain error with the status on other non-2xx responses (404, 500)", async () => {
    const jar = new CookieJar({ a: "1" });
    const client = new TripitHttpClient({
      jar,
      fetchImpl: vi.fn(async () => res(404, "not found")) as any,
    });
    await expect(client.getJson("/x")).rejects.toThrow(/HTTP 404/);

    const client500 = new TripitHttpClient({
      jar,
      fetchImpl: vi.fn(async () => res(500, "boom")) as any,
    });
    await expect(client500.getJson("/y")).rejects.toThrow(/HTTP 500/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/http-client.test.ts`
Expected: FAIL — `src/http/client.ts` does not exist yet.

- [ ] **Step 4: Implement http/client.ts**

`src/http/client.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/http-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/constants.ts src/http/client.ts tests/http-client.test.ts
git commit -m "Add authenticated TripIt HTTP client with session-expiry detection"
```

---

## Task 5: Login flow

**Files:**
- Create: `src/auth/login.ts`
- Test: `tests/login.test.ts`

**Interfaces:**
- Consumes: `CookieJar`, `FetchLike`, `BASE_URL`, `LOGIN_PATH`.
- Produces: `interface LoginCreds { email: string; password: string }`, `interface LoginResult { jar: CookieJar }`, `async function login(fetchImpl: FetchLike, creds: LoginCreds): Promise<LoginResult>` — consumed by Task 6 (login-command).

- [ ] **Step 1: Write the failing login tests**

`tests/login.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { login } from "../src/auth/login.js";

const LOGIN_PAGE_HTML =
  '<form><input type="hidden" name="csrf_token" value="TOKEN123" /></form>';

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

describe("login()", () => {
  it("scrapes the csrf token, POSTs the exact captured field shape, and follows the redirect chain to success", async () => {
    const calls: Array<[string, any]> = [];
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push([url, init]);
      if (calls.length === 1) {
        return res(200, LOGIN_PAGE_HTML, { "set-cookie": ["preauth=p1; Path=/"] });
      }
      if (calls.length === 2) {
        return res(302, "", {
          location: ["https://www.tripit.com/home"],
          "set-cookie": ["session_id=s1; Path=/"],
        });
      }
      if (calls.length === 3) {
        return res(302, "", {
          location: ["https://www.tripit.com/app/"],
          "set-cookie": ["csrf_token_wa=c1; Path=/"],
        });
      }
      return res(200, "<html>app shell</html>");
    });

    const { jar } = await login(fetchImpl as any, { email: "me@example.com", password: "secret" });

    expect(calls[0][0]).toBe("https://www.tripit.com/account/login");
    expect(calls[1][0]).toBe("https://www.tripit.com/account/login");
    expect(calls[1][1].method).toBe("POST");
    const body = new URLSearchParams(calls[1][1].body);
    expect(Object.fromEntries(body)).toEqual({
      csrf_token: "TOKEN123",
      errors: "",
      toc: "1",
      redirect_url: "home/index",
      login_email_address: "me@example.com",
      login_password: "secret",
    });

    expect(jar.toHeader()).toContain("preauth=p1");
    expect(jar.toHeader()).toContain("session_id=s1");
    expect(jar.toHeader()).toContain("csrf_token_wa=c1");
  });

  it("throws a clear error when the login page has no csrf_token field", async () => {
    const fetchImpl = vi.fn(async () => res(200, "<form>no token here</form>"));
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "secret" }),
    ).rejects.toThrow(/csrf_token/);
  });

  it("throws a clear error when the POST redirects back to the login page", async () => {
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      if (init.method !== "POST" && !url.includes("account/login")) return res(200, LOGIN_PAGE_HTML);
      if (init.method === undefined || init.method === "GET") return res(200, LOGIN_PAGE_HTML);
      return res(302, "", { location: ["https://www.tripit.com/account/login?errors=1"] });
    });
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "wrong" }),
    ).rejects.toThrow(/check your email and password/i);
  });

  it("throws a clear error when the POST returns 200 without redirecting at all", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      if (init.method === "POST") return res(200, "<form>invalid credentials</form>");
      return res(200, LOGIN_PAGE_HTML);
    });
    await expect(
      login(fetchImpl as any, { email: "me@example.com", password: "wrong" }),
    ).rejects.toThrow(/check your email and password/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/login.test.ts`
Expected: FAIL — `src/auth/login.ts` does not exist yet.

- [ ] **Step 3: Implement login.ts**

`src/auth/login.ts`:

```typescript
import { BASE_URL, LOGIN_PATH } from "../constants.js";
import type { FetchLike } from "../http/client.js";
import { CookieJar } from "./cookie-jar.js";

export interface LoginCreds {
  email: string;
  password: string;
}

export interface LoginResult {
  jar: CookieJar;
}

const CSRF_PATTERNS = [
  /name=["']csrf_token["']\s+value=["']([^"']+)["']/i,
  /value=["']([^"']+)["']\s+name=["']csrf_token["']/i,
];

function scrapeCsrfToken(html: string): string {
  for (const re of CSRF_PATTERNS) {
    const m = html.match(re);
    if (m) return m[1];
  }
  throw new Error(
    "Login failed: could not find a csrf_token field on the TripIt login page. " +
      "TripIt may have changed their login form.",
  );
}

/**
 * Reverse-engineered from a single captured login (see the design spec's
 * "Open items"): GET the login page for a pre-auth cookie + csrf_token, POST
 * credentials, then follow the redirect chain by hand. Automatic
 * `redirect: "follow"` is deliberately NOT used — it would not expose the
 * intermediate 302 responses' Set-Cookie headers, and the session cookie is
 * set on exactly one of those intermediate hops.
 */
export async function login(fetchImpl: FetchLike, creds: LoginCreds): Promise<LoginResult> {
  const jar = new CookieJar();

  const loginPage = await fetchImpl(`${BASE_URL}${LOGIN_PATH}`, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "text/html" },
  });
  jar.applySetCookie(loginPage.headers.getSetCookie?.() ?? []);
  if (loginPage.status < 200 || loginPage.status >= 300) {
    throw new Error(`Login failed: could not load the login page (HTTP ${loginPage.status}).`);
  }
  const csrfToken = scrapeCsrfToken(await loginPage.text());

  const body = new URLSearchParams({
    csrf_token: csrfToken,
    errors: "",
    toc: "1",
    redirect_url: "home/index",
    login_email_address: creds.email,
    login_password: creds.password,
  }).toString();

  let nextUrl = `${BASE_URL}${LOGIN_PATH}`;
  let nextInit: any = {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.toHeader() },
    body,
  };
  let lastLocation = LOGIN_PATH; // stays LOGIN_PATH unless we actually get redirected away

  for (let hop = 0; hop < 5; hop++) {
    const r = await fetchImpl(nextUrl, nextInit);
    jar.applySetCookie(r.headers.getSetCookie?.() ?? []);

    if (r.status < 300 || r.status >= 400) break; // not a redirect — chain ends here

    const loc = r.headers.get("location");
    if (!loc) break;
    lastLocation = loc;
    nextUrl = loc.startsWith("http") ? loc : `${BASE_URL}${loc}`;
    nextInit = { method: "GET", redirect: "manual", headers: { Cookie: jar.toHeader() } };
  }

  if (/\/account\/login/.test(lastLocation)) {
    throw new Error("Login failed: check your email and password.");
  }

  return { jar };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/login.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/login.ts tests/login.test.ts
git commit -m "Add login flow: csrf scrape, credential POST, manual redirect chain"
```

---

## Task 6: Login CLI command

**Files:**
- Create: `src/auth/login-command.ts`
- Test: `tests/login-command.test.ts`

**Interfaces:**
- Consumes: `login` (Task 5), `SessionStore` (Task 3), `FetchLike` (Task 4).
- Produces: `interface LoginPrompts`, `interface RunLoginDeps`, `async function runLogin(deps: RunLoginDeps): Promise<void>`, `function makeMutedWriter(out)`, `function makeTtyPrompts(): LoginPrompts` — consumed by Task 11's `index.ts`.

- [ ] **Step 1: Write the failing login-command tests**

`tests/login-command.test.ts`:

```typescript
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
      return res(200, "<html>app</html>");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/login-command.test.ts`
Expected: FAIL — `src/auth/login-command.ts` does not exist yet.

- [ ] **Step 3: Implement login-command.ts**

`src/auth/login-command.ts`:

```typescript
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
    write(chunk, encoding, cb) {
      if (!muted) out.write(chunk, encoding);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/login-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/login-command.ts tests/login-command.test.ts
git commit -m "Add tripit-mcp login CLI command"
```

---

## Task 7: Raw TripIt endpoint client

**Files:**
- Create: `src/tripit/raw-types.ts`
- Create: `src/tripit/endpoints.ts`
- Test: `tests/endpoints.test.ts`

**Interfaces:**
- Consumes: `TripitHttpClient` (Task 4).
- Produces: raw types (`RawProfile`, `RawTrip`, `RawAirObject`, `RawSegment`, `RawLodgingObject`, `RawCarObject`, `RawActivityObject`, `RawTripDetail`, `RawTripListResponse`, `RawProAlert`, `RawProAlertsResponse`) and `getProfileRaw`, `listTripsRaw`, `getTripRaw`, `listProAlertsRaw`, `interface ListTripsOptions { past?: boolean; pageSize?: number; pageNum?: number }` — consumed by Task 8 (normalize) and Task 9 (trip service).

- [ ] **Step 1: Create raw-types.ts**

`src/tripit/raw-types.ts`:

```typescript
export interface RawAddress {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

export interface RawDateTime {
  date?: string;
  time?: string;
  timezone?: string;
  utc_offset?: string;
}

export interface RawProfileEmail {
  address?: string;
  is_primary?: string;
}

export interface RawProfile {
  screen_name?: string;
  public_display_name?: string;
  home_city?: string;
  home_airport?: string;
  is_pro?: string;
  ical_url?: string;
  ProfileEmailAddresses?: { ProfileEmailAddress?: RawProfileEmail | RawProfileEmail[] };
}

export interface RawTrip {
  id: string;
  uuid: string;
  display_name?: string;
  start_date?: string;
  end_date?: string;
  primary_location?: string;
  PrimaryLocationAddress?: RawAddress;
  TripStatuses?: { TripStatus?: { status?: string } };
  is_private?: string;
}

export interface RawSegment {
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  start_airport_code?: string;
  start_airport_name?: string;
  start_city_name?: string;
  end_airport_code?: string;
  end_airport_name?: string;
  end_city_name?: string;
  marketing_airline?: string;
  marketing_airline_code?: string;
  marketing_flight_number?: string;
  Status?: { flight_status?: string };
}

export interface RawAirObject {
  id: string;
  uuid: string;
  display_name?: string;
  booking_site_name?: string;
  supplier_conf_num?: string;
  total_cost?: string;
  Segment?: RawSegment | RawSegment[];
}

export interface RawLodgingObject {
  id: string;
  uuid: string;
  display_name?: string;
  supplier_name?: string;
  supplier_conf_num?: string;
  total_cost?: string;
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  Address?: RawAddress;
}

export interface RawCarObject {
  id: string;
  uuid: string;
  display_name?: string;
  supplier_name?: string;
  supplier_conf_num?: string;
  total_cost?: string;
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  StartLocationAddress?: RawAddress;
  EndLocationAddress?: RawAddress;
}

export interface RawActivityObject {
  id: string;
  uuid: string;
  display_name?: string;
  supplier_name?: string;
  booking_site_conf_num?: string;
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  Address?: RawAddress;
}

export interface RawTripDetail {
  Trip: RawTrip;
  AirObject?: RawAirObject | RawAirObject[];
  LodgingObject?: RawLodgingObject | RawLodgingObject[];
  CarObject?: RawCarObject | RawCarObject[];
  ActivityObject?: RawActivityObject | RawActivityObject[];
}

export interface RawTripListResponse {
  Trip?: RawTrip | RawTrip[];
}

export interface RawProAlert {
  id?: string;
  trip_uuid?: string;
  title?: string;
  message?: string;
  created_at?: string;
  is_new?: string;
}

export interface RawProAlertsResponse {
  AccountPremiumAlert?: RawProAlert | RawProAlert[];
}
```

- [ ] **Step 2: Write the failing endpoints tests**

`tests/endpoints.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { getProfileRaw, getTripRaw, listProAlertsRaw, listTripsRaw } from "../src/tripit/endpoints.js";

function fakeHttp(response: unknown) {
  return { getJson: vi.fn(async () => response) } as any;
}

describe("endpoints", () => {
  it("getProfileRaw calls the profile endpoint and unwraps Profile", async () => {
    const http = fakeHttp({ Profile: { screen_name: "jdoe" } });
    const profile = await getProfileRaw(http);
    expect(http.getJson).toHaveBeenCalledWith("/api/v2/get/profile");
    expect(profile).toEqual({ screen_name: "jdoe" });
  });

  it("listTripsRaw builds the query string with defaults", async () => {
    const http = fakeHttp({ Trip: [] });
    await listTripsRaw(http);
    const [path] = http.getJson.mock.calls[0];
    expect(path).toBe(
      "/api/v2/list/trip?exclude_types=weather&page_size=10&past=false&should_sort_trips_by_date=true&traveler=true&trip_permission_filter=all&page_num=1&isPast=false",
    );
  });

  it("listTripsRaw honors past/pageSize/pageNum overrides", async () => {
    const http = fakeHttp({ Trip: [] });
    await listTripsRaw(http, { past: true, pageSize: 25, pageNum: 2 });
    const [path] = http.getJson.mock.calls[0];
    expect(path).toContain("page_size=25");
    expect(path).toContain("past=true");
    expect(path).toContain("page_num=2");
    expect(path).toContain("isPast=true");
  });

  it("getTripRaw builds the include_objects URL for the given uuid", async () => {
    const http = fakeHttp({ Trip: { id: "1", uuid: "u1" } });
    await getTripRaw(http, "u1");
    const [path] = http.getJson.mock.calls[0];
    expect(path).toBe(
      "/api/v2/get/trip/uuid/u1/include_objects/true?exclude_types=weather&should_get_new_seat_tracker_subscriptions=true",
    );
  });

  it("listProAlertsRaw calls the alerts endpoint", async () => {
    const http = fakeHttp({ AccountPremiumAlert: undefined });
    await listProAlertsRaw(http);
    expect(http.getJson).toHaveBeenCalledWith("/api/v2/listProAlerts");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/endpoints.test.ts`
Expected: FAIL — `src/tripit/endpoints.ts` does not exist yet.

- [ ] **Step 4: Implement endpoints.ts**

`src/tripit/endpoints.ts`:

```typescript
import type { TripitHttpClient } from "../http/client.js";
import type {
  RawProAlertsResponse,
  RawProfile,
  RawTripDetail,
  RawTripListResponse,
} from "./raw-types.js";

export interface ListTripsOptions {
  past?: boolean;
  pageSize?: number;
  pageNum?: number;
}

export async function getProfileRaw(http: TripitHttpClient): Promise<RawProfile> {
  const data = await http.getJson<{ Profile: RawProfile }>("/api/v2/get/profile");
  return data.Profile;
}

export async function listTripsRaw(
  http: TripitHttpClient,
  opts: ListTripsOptions = {},
): Promise<RawTripListResponse> {
  const pageSize = opts.pageSize ?? 10;
  const pageNum = opts.pageNum ?? 1;
  const past = opts.past ?? false;
  const qs = new URLSearchParams({
    exclude_types: "weather",
    page_size: String(pageSize),
    past: String(past),
    should_sort_trips_by_date: "true",
    traveler: "true",
    trip_permission_filter: "all",
    page_num: String(pageNum),
    isPast: String(past),
  });
  return http.getJson<RawTripListResponse>(`/api/v2/list/trip?${qs.toString()}`);
}

export async function getTripRaw(http: TripitHttpClient, uuid: string): Promise<RawTripDetail> {
  const qs = new URLSearchParams({
    exclude_types: "weather",
    should_get_new_seat_tracker_subscriptions: "true",
  });
  return http.getJson<RawTripDetail>(
    `/api/v2/get/trip/uuid/${encodeURIComponent(uuid)}/include_objects/true?${qs.toString()}`,
  );
}

export async function listProAlertsRaw(http: TripitHttpClient): Promise<RawProAlertsResponse> {
  return http.getJson<RawProAlertsResponse>("/api/v2/listProAlerts");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/endpoints.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tripit/raw-types.ts src/tripit/endpoints.ts tests/endpoints.test.ts
git commit -m "Add raw TripIt endpoint types and fetchers"
```

---

## Task 8: Normalization

**Files:**
- Create: `src/tripit/types.ts`
- Create: `src/tripit/normalize.ts`
- Create: `tests/fixtures/profile.json`
- Create: `tests/fixtures/trip-detail.json`
- Create: `tests/fixtures/pro-alerts.json`
- Test: `tests/normalize.test.ts`

**Interfaces:**
- Consumes: raw types (Task 7).
- Produces: domain types (`Profile`, `Address`, `Cost`, `TripSummary`, `FlightSegment`, `Flight`, `Lodging`, `CarRental`, `Activity`, `ProAlert`) and pure functions `toBool`, `asArray`, `combineDateTime`, `parseCost`, `normalizeAddress`, `normalizeProfile`, `normalizeTripSummary`, `normalizeFlight`, `normalizeLodging`, `normalizeCar`, `normalizeActivity`, `normalizeProAlert` — consumed by Task 9 (trip service). `asArray` is also reused directly by Task 9.

- [ ] **Step 1: Create sanitized fixtures**

These are structurally identical to the real captured responses, with all personal data (names, emails, phone numbers, confirmation numbers, UUIDs) replaced by fake values.

`tests/fixtures/profile.json`:

```json
{
  "Profile": {
    "screen_name": "sample_user",
    "public_display_name": "Jamie Q. Traveler",
    "home_city": "Walnut Creek, CA",
    "home_airport": "San Francisco International Airport (SFO)",
    "is_pro": "true",
    "ical_url": "https://www.tripit.com/feed/ical/private/FAKE0000FAKE0000FAKE0000FAKE00/tripit.ics",
    "ProfileEmailAddresses": {
      "ProfileEmailAddress": [
        { "address": "jamie.work@example.com", "is_primary": "false" },
        { "address": "jamie@example.com", "is_primary": "true" }
      ]
    }
  }
}
```

`tests/fixtures/trip-detail.json`:

```json
{
  "Trip": {
    "id": "111111111",
    "uuid": "aaaaaaaa-0000-9000-0001-000000000001",
    "display_name": "Barcelona, Spain, October 2026",
    "start_date": "2026-10-08",
    "end_date": "2026-10-23",
    "primary_location": "Barcelona, Spain",
    "PrimaryLocationAddress": {
      "address": "Barcelona, Spain",
      "city": "Barcelona",
      "state": "Catalonia",
      "country": "ES",
      "latitude": "41.388790",
      "longitude": "2.158990"
    },
    "TripStatuses": { "TripStatus": { "status": "all_clear" } },
    "is_private": "false"
  },
  "AirObject": [
    {
      "id": "222222222",
      "uuid": "bbbbbbbb-0000-9000-0004-000000000001",
      "display_name": "Flight",
      "booking_site_name": "United Airlines",
      "supplier_conf_num": "FAKE01",
      "total_cost": "3099.86 USD",
      "Segment": [
        {
          "StartDateTime": {
            "date": "2026-10-08",
            "time": "17:30:00",
            "timezone": "America/Los_Angeles",
            "utc_offset": "-07:00"
          },
          "EndDateTime": {
            "date": "2026-10-09",
            "time": "13:55:00",
            "timezone": "Europe/Madrid",
            "utc_offset": "+02:00"
          },
          "start_airport_code": "SFO",
          "start_airport_name": "San Francisco International Airport",
          "start_city_name": "San Francisco",
          "end_airport_code": "BCN",
          "end_airport_name": "Barcelona-El Prat Airport",
          "end_city_name": "Barcelona",
          "marketing_airline": "United Airlines",
          "marketing_airline_code": "UA",
          "marketing_flight_number": "672",
          "Status": { "flight_status": "300" }
        }
      ]
    },
    {
      "id": "222222233",
      "uuid": "bbbbbbbb-0000-9000-0004-000000000002",
      "display_name": "Flight",
      "booking_site_name": "Iberia",
      "supplier_conf_num": "FAKE02",
      "total_cost": "$428.35 USD",
      "Segment": {
        "StartDateTime": {
          "date": "2026-10-20",
          "time": "09:00:00",
          "timezone": "Europe/Madrid",
          "utc_offset": "+02:00"
        },
        "EndDateTime": {
          "date": "2026-10-20",
          "time": "10:15:00",
          "timezone": "Europe/Madrid",
          "utc_offset": "+02:00"
        },
        "start_airport_code": "SCQ",
        "end_airport_code": "MAD",
        "marketing_airline": "Iberia",
        "marketing_airline_code": "IB",
        "marketing_flight_number": "1234",
        "Status": { "flight_status": "300" }
      }
    }
  ],
  "LodgingObject": [
    {
      "id": "333333333",
      "uuid": "cccccccc-0000-9000-0004-000000000001",
      "display_name": "Sample Hotel Barcelona",
      "supplier_name": "Sample Hotel Barcelona",
      "supplier_conf_num": "FAKE03",
      "total_cost": "827.20 EUR",
      "StartDateTime": {
        "date": "2026-10-09",
        "time": "15:00:00",
        "timezone": "Europe/Madrid",
        "utc_offset": "+02:00"
      },
      "EndDateTime": {
        "date": "2026-10-11",
        "time": "11:00:00",
        "timezone": "Europe/Madrid",
        "utc_offset": "+02:00"
      },
      "Address": {
        "address": "Carrer Fake 1, 08013 Barcelona",
        "city": "Barcelona",
        "country": "ES",
        "latitude": "41.400000",
        "longitude": "2.180000"
      }
    }
  ],
  "CarObject": {
    "id": "444444444",
    "uuid": "dddddddd-0000-9000-0004-000000000001",
    "display_name": "Sample Car Rental",
    "supplier_name": "Sample Rentals",
    "supplier_conf_num": "FAKE04",
    "total_cost": "$428.35 USD",
    "StartDateTime": {
      "date": "2026-10-12",
      "time": "09:00:00",
      "timezone": "Europe/Madrid",
      "utc_offset": "+02:00"
    },
    "EndDateTime": {
      "date": "2026-10-20",
      "time": "15:00:00",
      "timezone": "Europe/Madrid",
      "utc_offset": "+02:00"
    },
    "StartLocationAddress": { "city": "Bilbao", "country": "ES" },
    "EndLocationAddress": { "city": "Santiago de Compostela", "country": "ES" }
  },
  "ActivityObject": [
    {
      "id": "555555555",
      "uuid": "eeeeeeee-0000-9000-0004-000000000001",
      "display_name": "Sample Landmark Tour",
      "supplier_name": "Sample Landmark",
      "booking_site_conf_num": "FAKE05",
      "StartDateTime": {
        "date": "2026-10-10",
        "time": "09:15:00",
        "timezone": "Europe/Madrid",
        "utc_offset": "+02:00"
      },
      "EndDateTime": {
        "date": "2026-10-10",
        "time": "10:15:00",
        "timezone": "Europe/Madrid",
        "utc_offset": "+02:00"
      },
      "Address": { "city": "Barcelona", "country": "ES" }
    }
  ]
}
```

`tests/fixtures/pro-alerts.json`:

```json
{
  "AccountPremiumAlert": {
    "id": "666666666",
    "trip_uuid": "aaaaaaaa-0000-9000-0001-000000000001",
    "title": "Barcelona, Spain, October 2026",
    "message": "Sample advisory message for this trip.",
    "created_at": "1790097872",
    "is_new": "true"
  }
}
```

- [ ] **Step 2: Create types.ts**

`src/tripit/types.ts`:

```typescript
export interface Profile {
  screenName?: string;
  displayName?: string;
  primaryEmail?: string;
  homeCity?: string;
  homeAirport?: string;
  isPro: boolean;
  icalUrl?: string;
}

export interface Address {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface Cost {
  amount: number;
  currency: string;
}

export interface TripSummary {
  id: string;
  uuid: string;
  displayName: string;
  startDate?: string;
  endDate?: string;
  primaryLocation?: string;
  address?: Address;
  status?: string;
  isPrivate: boolean;
}

export interface FlightSegment {
  startDateTime?: string;
  endDateTime?: string;
  startTimezone?: string;
  endTimezone?: string;
  startAirportCode?: string;
  startAirportName?: string;
  startCityName?: string;
  endAirportCode?: string;
  endAirportName?: string;
  endCityName?: string;
  airline?: string;
  airlineCode?: string;
  flightNumber?: string;
  status?: string;
}

export interface Flight {
  id: string;
  uuid: string;
  displayName?: string;
  bookingSite?: string;
  confirmationNumber?: string;
  cost?: Cost | string;
  segments: FlightSegment[];
}

export interface Lodging {
  id: string;
  uuid: string;
  displayName?: string;
  supplier?: string;
  confirmationNumber?: string;
  cost?: Cost | string;
  startDateTime?: string;
  endDateTime?: string;
  address?: Address;
}

export interface CarRental {
  id: string;
  uuid: string;
  displayName?: string;
  supplier?: string;
  confirmationNumber?: string;
  cost?: Cost | string;
  startDateTime?: string;
  endDateTime?: string;
  pickupAddress?: Address;
  dropoffAddress?: Address;
}

export interface Activity {
  id: string;
  uuid: string;
  displayName?: string;
  supplier?: string;
  confirmationNumber?: string;
  startDateTime?: string;
  endDateTime?: string;
  address?: Address;
}

export interface TripDetail {
  trip: TripSummary;
  flights: Flight[];
  lodgings: Lodging[];
  cars: CarRental[];
  activities: Activity[];
}

export interface ProAlert {
  id?: string;
  tripUuid?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  isNew: boolean;
}
```

- [ ] **Step 3: Write the failing normalize tests**

`tests/normalize.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  asArray,
  combineDateTime,
  normalizeActivity,
  normalizeAddress,
  normalizeCar,
  normalizeFlight,
  normalizeLodging,
  normalizeProAlert,
  normalizeProfile,
  normalizeTripSummary,
  parseCost,
  toBool,
} from "../src/tripit/normalize.js";
import type { RawProAlertsResponse, RawProfile, RawTripDetail } from "../src/tripit/raw-types.js";

function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("primitive helpers", () => {
  it("toBool", () => {
    expect(toBool("true")).toBe(true);
    expect(toBool("false")).toBe(false);
    expect(toBool(undefined)).toBe(false);
  });

  it("asArray normalizes bare object / array / undefined uniformly", () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
    expect(asArray([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("combineDateTime joins date/time/offset into ISO 8601, defaulting missing time", () => {
    expect(combineDateTime({ date: "2026-10-08", time: "17:30:00", utc_offset: "-07:00" })).toBe(
      "2026-10-08T17:30:00-07:00",
    );
    expect(combineDateTime({ date: "2026-10-08" })).toBe("2026-10-08T00:00:00");
    expect(combineDateTime(undefined)).toBeUndefined();
  });

  it("parseCost handles both observed formats and falls back to the raw string otherwise", () => {
    expect(parseCost("3099.86 USD")).toEqual({ amount: 3099.86, currency: "USD" });
    expect(parseCost("$428.35 USD")).toEqual({ amount: 428.35, currency: "USD" });
    expect(parseCost("827.20 EUR")).toEqual({ amount: 827.2, currency: "EUR" });
    expect(parseCost("Free")).toBe("Free");
    expect(parseCost(undefined)).toBeUndefined();
  });

  it("normalizeAddress converts lat/long strings to numbers", () => {
    expect(normalizeAddress({ city: "Barcelona", latitude: "41.38879", longitude: "2.15899" })).toEqual({
      address: undefined,
      city: "Barcelona",
      state: undefined,
      zip: undefined,
      country: undefined,
      latitude: 41.38879,
      longitude: 2.15899,
    });
    expect(normalizeAddress(undefined)).toBeUndefined();
  });
});

describe("normalizeProfile", () => {
  it("picks the primary email, keeps the rest of the fields, coerces isPro", () => {
    const raw = fixture<{ Profile: RawProfile }>("profile.json").Profile;
    expect(normalizeProfile(raw)).toEqual({
      screenName: "sample_user",
      displayName: "Jamie Q. Traveler",
      primaryEmail: "jamie@example.com",
      homeCity: "Walnut Creek, CA",
      homeAirport: "San Francisco International Airport (SFO)",
      isPro: true,
      icalUrl: "https://www.tripit.com/feed/ical/private/FAKE0000FAKE0000FAKE0000FAKE00/tripit.ics",
    });
  });
});

describe("domain normalizers against the sanitized trip-detail fixture", () => {
  const detail = fixture<RawTripDetail>("trip-detail.json");

  it("normalizeTripSummary maps the trip fields", () => {
    const trip = normalizeTripSummary(detail.Trip);
    expect(trip.displayName).toBe("Barcelona, Spain, October 2026");
    expect(trip.status).toBe("all_clear");
    expect(trip.isPrivate).toBe(false);
    expect(trip.address?.latitude).toBeCloseTo(41.38879);
  });

  it("normalizeFlight keeps a multi-segment array as-is and wraps a bare Segment object into a 1-item array", () => {
    const [multi, single] = asArray(detail.AirObject).map(normalizeFlight);
    expect(multi.segments).toHaveLength(1);
    expect(multi.segments[0].startAirportCode).toBe("SFO");
    expect(multi.cost).toEqual({ amount: 3099.86, currency: "USD" });

    expect(single.segments).toHaveLength(1);
    expect(single.segments[0].startAirportCode).toBe("SCQ");
    expect(single.cost).toEqual({ amount: 428.35, currency: "USD" });
  });

  it("normalizeLodging maps supplier/cost/address", () => {
    const [lodging] = asArray(detail.LodgingObject).map(normalizeLodging);
    expect(lodging.supplier).toBe("Sample Hotel Barcelona");
    expect(lodging.cost).toEqual({ amount: 827.2, currency: "EUR" });
    expect(lodging.address?.city).toBe("Barcelona");
  });

  it("normalizeCar handles CarObject being a bare object rather than an array", () => {
    const [car] = asArray(detail.CarObject).map(normalizeCar);
    expect(car.supplier).toBe("Sample Rentals");
    expect(car.pickupAddress?.city).toBe("Bilbao");
    expect(car.dropoffAddress?.city).toBe("Santiago de Compostela");
  });

  it("normalizeActivity maps supplier/address/confirmation", () => {
    const [activity] = asArray(detail.ActivityObject).map(normalizeActivity);
    expect(activity.supplier).toBe("Sample Landmark");
    expect(activity.confirmationNumber).toBe("FAKE05");
  });
});

describe("normalizeProAlert", () => {
  it("maps fields and coerces isNew", () => {
    const raw = fixture<RawProAlertsResponse>("pro-alerts.json").AccountPremiumAlert;
    const alert = normalizeProAlert(Array.isArray(raw) ? raw[0] : raw!);
    expect(alert.title).toBe("Barcelona, Spain, October 2026");
    expect(alert.isNew).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL — `src/tripit/normalize.ts` does not exist yet.

- [ ] **Step 5: Implement normalize.ts**

`src/tripit/normalize.ts`:

```typescript
import type {
  RawActivityObject,
  RawAddress,
  RawAirObject,
  RawCarObject,
  RawDateTime,
  RawLodgingObject,
  RawProAlert,
  RawProfile,
  RawSegment,
  RawTrip,
} from "./raw-types.js";
import type {
  Activity,
  Address,
  CarRental,
  Cost,
  Flight,
  FlightSegment,
  Lodging,
  ProAlert,
  Profile,
  TripSummary,
} from "./types.js";

export function toBool(v: unknown): boolean {
  return v === "true" || v === true;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function combineDateTime(dt?: RawDateTime): string | undefined {
  if (!dt?.date) return undefined;
  const time = dt.time ?? "00:00:00";
  const offset = dt.utc_offset ?? "";
  return `${dt.date}T${time}${offset}`;
}

const COST_PATTERN = /^\$?([\d,]+\.\d{2})\s+([A-Z]{3})$/;

export function parseCost(raw?: string): Cost | string | undefined {
  if (!raw) return undefined;
  const m = raw.match(COST_PATTERN);
  if (!m) return raw; // leave unparsed rather than guess at an unfamiliar format
  const amount = Number(m[1].replace(/,/g, ""));
  if (Number.isNaN(amount)) return raw;
  return { amount, currency: m[2] };
}

export function normalizeAddress(raw?: RawAddress): Address | undefined {
  if (!raw) return undefined;
  return {
    address: raw.address,
    city: raw.city,
    state: raw.state,
    zip: raw.zip,
    country: raw.country,
    latitude: raw.latitude !== undefined ? Number(raw.latitude) : undefined,
    longitude: raw.longitude !== undefined ? Number(raw.longitude) : undefined,
  };
}

export function normalizeProfile(raw: RawProfile): Profile {
  const emails = asArray(raw.ProfileEmailAddresses?.ProfileEmailAddress);
  const primary = emails.find((e) => toBool(e.is_primary)) ?? emails[0];
  return {
    screenName: raw.screen_name,
    displayName: raw.public_display_name,
    primaryEmail: primary?.address,
    homeCity: raw.home_city,
    homeAirport: raw.home_airport,
    isPro: toBool(raw.is_pro),
    icalUrl: raw.ical_url,
  };
}

export function normalizeTripSummary(raw: RawTrip): TripSummary {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name ?? "",
    startDate: raw.start_date,
    endDate: raw.end_date,
    primaryLocation: raw.primary_location,
    address: normalizeAddress(raw.PrimaryLocationAddress),
    status: raw.TripStatuses?.TripStatus?.status,
    isPrivate: toBool(raw.is_private),
  };
}

function normalizeSegment(raw: RawSegment): FlightSegment {
  return {
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    startTimezone: raw.StartDateTime?.timezone,
    endTimezone: raw.EndDateTime?.timezone,
    startAirportCode: raw.start_airport_code,
    startAirportName: raw.start_airport_name,
    startCityName: raw.start_city_name,
    endAirportCode: raw.end_airport_code,
    endAirportName: raw.end_airport_name,
    endCityName: raw.end_city_name,
    airline: raw.marketing_airline,
    airlineCode: raw.marketing_airline_code,
    flightNumber: raw.marketing_flight_number,
    status: raw.Status?.flight_status,
  };
}

export function normalizeFlight(raw: RawAirObject): Flight {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    bookingSite: raw.booking_site_name,
    confirmationNumber: raw.supplier_conf_num,
    cost: parseCost(raw.total_cost),
    segments: asArray(raw.Segment).map(normalizeSegment),
  };
}

export function normalizeLodging(raw: RawLodgingObject): Lodging {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    supplier: raw.supplier_name,
    confirmationNumber: raw.supplier_conf_num,
    cost: parseCost(raw.total_cost),
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    address: normalizeAddress(raw.Address),
  };
}

export function normalizeCar(raw: RawCarObject): CarRental {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    supplier: raw.supplier_name,
    confirmationNumber: raw.supplier_conf_num,
    cost: parseCost(raw.total_cost),
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    pickupAddress: normalizeAddress(raw.StartLocationAddress),
    dropoffAddress: normalizeAddress(raw.EndLocationAddress),
  };
}

export function normalizeActivity(raw: RawActivityObject): Activity {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    supplier: raw.supplier_name,
    confirmationNumber: raw.booking_site_conf_num,
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    address: normalizeAddress(raw.Address),
  };
}

export function normalizeProAlert(raw: RawProAlert): ProAlert {
  return {
    id: raw.id,
    tripUuid: raw.trip_uuid,
    title: raw.title,
    message: raw.message,
    createdAt: raw.created_at,
    isNew: toBool(raw.is_new),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/normalize.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tripit/types.ts src/tripit/normalize.ts tests/fixtures/profile.json tests/fixtures/trip-detail.json tests/fixtures/pro-alerts.json tests/normalize.test.ts
git commit -m "Add domain types and normalization for TripIt's XML-derived JSON"
```

---

## Task 9: Trip service

**Files:**
- Create: `src/services/trip-service.ts`
- Test: `tests/trip-service.test.ts`

**Interfaces:**
- Consumes: `getProfileRaw`, `listTripsRaw`, `getTripRaw`, `listProAlertsRaw`, `ListTripsOptions` (Task 7); `normalizeProfile`, `normalizeTripSummary`, `normalizeFlight`, `normalizeLodging`, `normalizeCar`, `normalizeActivity`, `normalizeProAlert`, `asArray` (Task 8); `TripitHttpClient` (Task 4).
- Produces: `class TripService` with constructor `(http: TripitHttpClient)` and methods `whoami(): Promise<Profile>`, `listTrips(opts?: ListTripsOptions): Promise<TripSummary[]>`, `getTrip(uuid: string): Promise<TripDetail>`, `listAlerts(): Promise<ProAlert[]>` — consumed by Task 10 (tools) and Task 11 (server wiring).

- [ ] **Step 1: Write the failing trip-service tests**

`tests/trip-service.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { TripService } from "../src/services/trip-service.js";

function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fakeHttp(responses: Record<string, unknown>) {
  return {
    getJson: vi.fn(async (path: string) => {
      for (const [prefix, body] of Object.entries(responses)) {
        if (path.startsWith(prefix)) return body;
      }
      throw new Error(`unexpected path in test: ${path}`);
    }),
  } as any;
}

describe("TripService", () => {
  it("whoami returns a normalized profile", async () => {
    const http = fakeHttp({ "/api/v2/get/profile": fixture("profile.json") });
    const service = new TripService(http);
    const profile = await service.whoami();
    expect(profile.primaryEmail).toBe("jamie@example.com");
  });

  it("listTrips normalizes a Trip array and forwards options", async () => {
    const http = fakeHttp({
      "/api/v2/list/trip": { Trip: [fixture<{ Trip: unknown }>("trip-detail.json").Trip] },
    });
    const service = new TripService(http);
    const trips = await service.listTrips({ past: true, pageSize: 5 });
    expect(trips).toHaveLength(1);
    expect(trips[0].displayName).toBe("Barcelona, Spain, October 2026");
    const [path] = http.getJson.mock.calls[0];
    expect(path).toContain("past=true");
    expect(path).toContain("page_size=5");
  });

  it("getTrip assembles and sorts the full itinerary chronologically", async () => {
    // Feed AirObject in reverse chronological order (later flight first) so
    // this test actually proves getTrip sorts, rather than just passing
    // already-ordered fixture data through unchanged.
    const detailFixture = fixture<{ AirObject: unknown[] }>("trip-detail.json");
    const reversed = { ...detailFixture, AirObject: [...detailFixture.AirObject].reverse() };
    const http = fakeHttp({ "/api/v2/get/trip": reversed });
    const service = new TripService(http);
    const detail = await service.getTrip("aaaaaaaa-0000-9000-0001-000000000001");

    expect(detail.trip.displayName).toBe("Barcelona, Spain, October 2026");
    expect(detail.flights).toHaveLength(2);
    // Input was reversed (Oct 20 flight first); output must be re-sorted so
    // the earlier Oct 8 departure comes first.
    expect(detail.flights[0].segments[0].startAirportCode).toBe("SFO");
    expect(detail.flights[1].segments[0].startAirportCode).toBe("SCQ");
    expect(detail.lodgings).toHaveLength(1);
    expect(detail.cars).toHaveLength(1); // CarObject was a bare object, not an array
    expect(detail.activities).toHaveLength(1);
  });

  it("listAlerts normalizes a bare AccountPremiumAlert object into a 1-item array", async () => {
    const http = fakeHttp({ "/api/v2/listProAlerts": fixture("pro-alerts.json") });
    const service = new TripService(http);
    const alerts = await service.listAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].isNew).toBe(true);
  });

  it("propagates errors from the http client un-mangled (e.g. a 404 for an inaccessible trip)", async () => {
    const http = {
      getJson: vi.fn(async () => {
        throw new Error("GET /api/v2/get/trip/uuid/bad → HTTP 404");
      }),
    } as any;
    const service = new TripService(http);
    await expect(service.getTrip("bad")).rejects.toThrow(/HTTP 404/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/trip-service.test.ts`
Expected: FAIL — `src/services/trip-service.ts` does not exist yet.

- [ ] **Step 3: Implement trip-service.ts**

`src/services/trip-service.ts`:

```typescript
import type { TripitHttpClient } from "../http/client.js";
import { type ListTripsOptions, getProfileRaw, getTripRaw, listProAlertsRaw, listTripsRaw } from "../tripit/endpoints.js";
import {
  asArray,
  normalizeActivity,
  normalizeCar,
  normalizeFlight,
  normalizeLodging,
  normalizeProAlert,
  normalizeProfile,
  normalizeTripSummary,
} from "../tripit/normalize.js";
import type { Profile, ProAlert, TripDetail, TripSummary } from "../tripit/types.js";

function byStart(a?: string, b?: string): number {
  const ta = a ? Date.parse(a) : Number.POSITIVE_INFINITY;
  const tb = b ? Date.parse(b) : Number.POSITIVE_INFINITY;
  return ta - tb;
}

export class TripService {
  constructor(private readonly http: TripitHttpClient) {}

  async whoami(): Promise<Profile> {
    return normalizeProfile(await getProfileRaw(this.http));
  }

  async listTrips(opts: ListTripsOptions = {}): Promise<TripSummary[]> {
    const raw = await listTripsRaw(this.http, opts);
    return asArray(raw.Trip).map(normalizeTripSummary);
  }

  async getTrip(uuid: string): Promise<TripDetail> {
    const raw = await getTripRaw(this.http, uuid);
    const flights = asArray(raw.AirObject)
      .map(normalizeFlight)
      .sort((a, b) => byStart(a.segments[0]?.startDateTime, b.segments[0]?.startDateTime));
    const lodgings = asArray(raw.LodgingObject)
      .map(normalizeLodging)
      .sort((a, b) => byStart(a.startDateTime, b.startDateTime));
    const cars = asArray(raw.CarObject)
      .map(normalizeCar)
      .sort((a, b) => byStart(a.startDateTime, b.startDateTime));
    const activities = asArray(raw.ActivityObject)
      .map(normalizeActivity)
      .sort((a, b) => byStart(a.startDateTime, b.startDateTime));
    return { trip: normalizeTripSummary(raw.Trip), flights, lodgings, cars, activities };
  }

  async listAlerts(): Promise<ProAlert[]> {
    const raw = await listProAlertsRaw(this.http);
    return asArray(raw.AccountPremiumAlert).map(normalizeProAlert);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/trip-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/trip-service.ts tests/trip-service.test.ts
git commit -m "Add TripService combining endpoints and normalization"
```

---

## Task 10: MCP read tools

**Files:**
- Create: `src/tools/read-tools.ts`
- Test: `tests/read-tools.test.ts`

**Interfaces:**
- Consumes: `TripService` (Task 9), `SessionExpiredError` (Task 4).
- Produces: `function registerReadTools(server: McpServer, deps: { service: TripService }): void` registering `tripit_whoami`, `tripit_list_trips`, `tripit_get_trip`, `tripit_list_alerts` — consumed by Task 11 (server wiring).

- [ ] **Step 1: Write the failing read-tools tests**

`tests/read-tools.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "../src/http/client.js";
import { registerReadTools } from "../src/tools/read-tools.js";

function fakeServer() {
  const handlers: Record<string, Function> = {};
  return {
    handlers,
    registerTool(name: string, _def: unknown, handler: Function) {
      handlers[name] = handler;
    },
  };
}

const service = {
  whoami: vi.fn(async () => ({ displayName: "Jamie Q. Traveler", isPro: true })),
  listTrips: vi.fn(async () => [{ id: "1", uuid: "u1", displayName: "Trip", isPrivate: false }]),
  getTrip: vi.fn(async () => ({ trip: { id: "1", uuid: "u1" }, flights: [], lodgings: [], cars: [], activities: [] })),
  listAlerts: vi.fn(async () => [{ id: "a1", isNew: true }]),
} as any;

describe("registerReadTools", () => {
  it("registers all four read tools", () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    expect(Object.keys(server.handlers).sort()).toEqual(
      ["tripit_get_trip", "tripit_list_alerts", "tripit_list_trips", "tripit_whoami"].sort(),
    );
  });

  it("tripit_whoami returns service.whoami() as text content", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    const out = await server.handlers.tripit_whoami({});
    expect(out.content[0].type).toBe("text");
    expect(JSON.parse(out.content[0].text)).toEqual({ displayName: "Jamie Q. Traveler", isPro: true });
  });

  it("tripit_list_trips forwards past/limit to the service", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    await server.handlers.tripit_list_trips({ past: true, limit: 5 });
    expect(service.listTrips).toHaveBeenCalledWith({ past: true, pageSize: 5 });
  });

  it("tripit_get_trip forwards uuid to the service", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    await server.handlers.tripit_get_trip({ uuid: "u1" });
    expect(service.getTrip).toHaveBeenCalledWith("u1");
  });

  it("tripit_list_alerts returns service.listAlerts() as text content", async () => {
    const server = fakeServer();
    registerReadTools(server as any, { service });
    const out = await server.handlers.tripit_list_alerts({});
    expect(JSON.parse(out.content[0].text)).toEqual([{ id: "a1", isNew: true }]);
  });

  it("propagates SessionExpiredError out of a tool handler instead of swallowing it", async () => {
    const failingService = { ...service, listTrips: vi.fn(async () => { throw new SessionExpiredError(); }) };
    const server = fakeServer();
    registerReadTools(server as any, { service: failingService });
    await expect(server.handlers.tripit_list_trips({})).rejects.toThrow(/run `tripit-mcp login` again/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/read-tools.test.ts`
Expected: FAIL — `src/tools/read-tools.ts` does not exist yet.

- [ ] **Step 3: Implement read-tools.ts**

`src/tools/read-tools.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TripService } from "../services/trip-service.js";

type Deps = { service: TripService };

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function registerReadTools(server: McpServer, deps: Deps): void {
  const { service } = deps;

  server.registerTool(
    "tripit_whoami",
    {
      description: "Current TripIt profile: name, home city/airport, pro status, ical feed URL.",
      inputSchema: {},
    },
    async () => text(await service.whoami()),
  );

  server.registerTool(
    "tripit_list_trips",
    {
      description: "List trips (upcoming by default), soonest first.",
      inputSchema: { past: z.boolean().optional(), limit: z.number().int().positive().optional() },
    },
    async (args: { past?: boolean; limit?: number }) =>
      text(await service.listTrips({ past: args.past, pageSize: args.limit })),
  );

  server.registerTool(
    "tripit_get_trip",
    {
      description: "Full itinerary for one trip: flights, hotels, car rentals, and activities.",
      inputSchema: { uuid: z.string() },
    },
    async (args: { uuid: string }) => text(await service.getTrip(args.uuid)),
  );

  server.registerTool(
    "tripit_list_alerts",
    {
      description: "Active TripIt Pro alerts (schedule changes, advisories, etc.).",
      inputSchema: {},
    },
    async () => text(await service.listAlerts()),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/read-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/read-tools.ts tests/read-tools.test.ts
git commit -m "Add MCP read tools for trips, itinerary, profile, and alerts"
```

---

## Task 11: Server + CLI wiring

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1), `SessionStore`, `CookieJar` (Task 3), `TripitHttpClient`, `FetchLike` (Task 4), `TripService` (Task 9), `registerReadTools` (Task 10), `runLogin`, `makeTtyPrompts` (Task 6).
- Produces: `async function buildServer(config: Config, fetchImpl: FetchLike): Promise<{ server: McpServer }>`; `index.ts` CLI entrypoint (no exported interface — consumed only by `package.json`'s `bin`).

- [ ] **Step 1: Write the failing server test**

`tests/server.test.ts`:

```typescript
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
    const fetchImpl = vi.fn(async () => res(200, JSON.stringify({ Profile: { screen_name: "u" } })));

    const { server } = await buildServer(config, fetchImpl as any);
    expect(server).toBeDefined();
  });

  it("throws a clear error when there is no session and no cookieSeed", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "server-test-"));
    const config: Config = { dataDir };
    await expect(buildServer(config, vi.fn() as any)).rejects.toThrow(/tripit-mcp login/);
  });

  it("bootstraps from cookieSeed when no session file exists yet", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "server-test-"));
    const config: Config = { dataDir, cookieSeed: "session_id=seeded" };
    const { server } = await buildServer(config, vi.fn() as any);
    expect(server).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL — `src/server.ts` does not exist yet.

- [ ] **Step 3: Implement server.ts**

`src/server.ts`:

```typescript
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
  if (config.cookieSeed) return CookieJar.fromCookieHeaderString(config.cookieSeed);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement index.ts (no dedicated test — thin CLI glue, covered indirectly by Task 6 and this task's tests)**

`src/index.ts`:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetch } from "undici";
import { makeTtyPrompts, runLogin } from "./auth/login-command.js";
import { loadConfig } from "./config.js";
import type { FetchLike } from "./http/client.js";
import { buildServer } from "./server.js";

async function runLoginCommand() {
  const config = loadConfig(process.env);
  await runLogin({
    fetchImpl: fetch as unknown as FetchLike,
    dataDir: config.dataDir,
    prompts: makeTtyPrompts(),
  });
}

async function runServer() {
  const config = loadConfig(process.env);
  const { server } = await buildServer(config, fetch as unknown as FetchLike);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  if (process.argv[2] === "login") {
    await runLoginCommand();
    process.exit(0); // the TTY readline keeps stdin ref'd; exit explicitly
  }
  await runServer();
}

main().catch((err) => {
  process.stderr.write(`tripit-mcp fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
```

- [ ] **Step 6: Full build + typecheck + test + lint**

Run: `npm run build && npm run typecheck && npm test && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/index.ts tests/server.test.ts
git commit -m "Wire server and CLI entrypoint together"
```

---

## Task 12: README and final verification

**Files:**
- Create: `README.md`
- Create: `LICENSE`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Write README.md**

`README.md`:

```markdown
# tripit-mcp

An [MCP](https://modelcontextprotocol.io) server for [TripIt](https://www.tripit.com). It gives an MCP client (Claude, etc.) **read-only** access to your trips and full itinerary — flights, hotels, car rentals, and activities — over stdio.

> **Unofficial.** This project is not affiliated with or endorsed by TripIt. It talks to TripIt's private web-app API, reverse-engineered from captured browser traffic, not TripIt's documented public API. The login flow's CSRF-cookie handling and failed-login detection were inferred from a single captured login rather than directly observed in every case — see `docs/superpowers/specs/2026-09-22-tripit-mcp-design.md` for what's confirmed vs. assumed. Use at your own risk against your own account.

## Requirements

- Node.js ≥ 20
- A TripIt account. Sign in once with `tripit-mcp login` (below). **Your password is never stored** — login exchanges it for a session on the spot, saves only the resulting cookies, and you re-run `login` if the session ever expires.

## Install

```bash
npm install
npm run build
```

## Sign in

```bash
node dist/index.js login
```

It prompts for your TripIt email and password (the password is not echoed), logs in, and writes the resulting session to `session.json` (mode `600`) in the data directory. **Your password is never written to disk.**

## Configuration

Once you've logged in, no secrets are needed — the server finds `session.json` on its own. See [`.env.example`](.env.example) for optional overrides: `TRIPIT_DATA_DIR` (default `~/.tripit-mcp`), `TRIPIT_PROXY_URL` (dev proxy), and `TRIPIT_SESSION_COOKIE` (bootstrap from a manually-captured cookie string instead of running `login`).

## Usage

Run over stdio from an MCP client:

```json
{
  "mcpServers": {
    "tripit": {
      "command": "node",
      "args": ["/absolute/path/to/tripit-mcp/dist/index.js"]
    }
  }
}
```

If a tool call fails with a message to run `tripit-mcp login` again, your session has expired — run it again in a terminal.

## Tools

| Tool | Description |
| --- | --- |
| `tripit_whoami` | Current profile: name, home city/airport, pro status, ical feed URL. |
| `tripit_list_trips` | List trips (upcoming by default); optional `past`, `limit`. |
| `tripit_get_trip` | Full itinerary for one trip (by `uuid`): flights, hotels, car rentals, activities, sorted chronologically. |
| `tripit_list_alerts` | Active TripIt Pro alerts (schedule changes, advisories). |

## Development

```bash
npm test        # vitest
npm run lint     # biome
npm run typecheck
```

Fixtures under `tests/fixtures/` are sanitized: structurally identical to real captured TripIt responses, with all personal data replaced.
```

`LICENSE`:

```
MIT License

Copyright (c) 2026 Justin Rhinesmith

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Full verification**

Run: `npm run build && npm run typecheck && npm test && npm run lint`
Expected: all pass, zero lint errors.

- [ ] **Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "Add README and license"
```
