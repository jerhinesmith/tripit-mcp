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
