import { loginWithBrowser } from "./browser-login.js";
import { SessionStore } from "./session-store.js";

export interface RunLoginDeps {
  dataDir: string;
  log?: (msg: string) => void;
  /** Injectable for testing; defaults to the real browser-driven login. */
  loginWithBrowser?: typeof loginWithBrowser;
}

export async function runLogin(deps: RunLoginDeps): Promise<void> {
  const log = deps.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  const doLogin = deps.loginWithBrowser ?? loginWithBrowser;

  const jar = await doLogin({ log });

  const store = new SessionStore(deps.dataDir);
  await store.write(jar);

  log(`✓ Logged in. Session saved to ${deps.dataDir}/session.json`);
}
