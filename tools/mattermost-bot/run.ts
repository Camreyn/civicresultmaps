import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { BotError } from "./data.ts";
import { checkMcpHealth, connectReader } from "./mcp.ts";
import { ChannelBot, Mattermost, readConfig } from "./mattermost.ts";

async function main() {
  if (process.argv.slice(2).some(arg => arg !== "--check")) throw new BotError("Usage: node --experimental-strip-types tools/mattermost-bot/run.ts [--check]");
  // Deliberately do not load the application's .env.local/database credentials.
  try { loadEnvFile(fileURLToPath(new URL("./.env.local", import.meta.url))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new BotError("Could not load the bot's private environment file."); }
  const config = readConfig();
  await checkMcpHealth();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const api = new Mattermost(config, fetch, controller.signal);
  try {
    const identity = await api.checkIdentity();
    console.log(`Verified non-admin bot and private channel: ${identity.channelName}.`);
    if (process.argv.includes("--check")) {
      console.log("Read-only connection check passed. No messages or files sent.");
      return;
    }
    const reader = await connectReader();
    try {
      console.log("Listening for !crm commands. Old messages will not be replayed. Keep this process running; Ctrl+C stops it.");
      await new ChannelBot(api, reader).run(controller.signal);
    } finally { await reader.close(); }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

main().catch(error => {
  // Never print raw API responses, headers, tokens, environment, or MCP errors.
  console.error(error instanceof BotError ? error.message : "Bot startup failed. Check the local setup and run the focused tests.");
  process.exitCode = 1;
});
