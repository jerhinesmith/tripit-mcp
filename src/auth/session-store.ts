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
