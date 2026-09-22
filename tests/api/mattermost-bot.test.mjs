import assert from "node:assert/strict";
import { mkdtemp, mkdir, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";
import { BotError, CAVEAT, csvCell, exportSnapshot, exportState, makeCsv, MAX_ARTIFACT_BYTES, MAX_CSV_BYTES, publicText, publicUrl, readSnapshot, sourceFields } from "../../tools/mattermost-bot/data.ts";
import { HELP, executeCommand, parseCommand } from "../../tools/mattermost-bot/commands.ts";
import { BOT_TOOL_NAMES, connectReader, createBotMcpServer } from "../../tools/mattermost-bot/mcp.ts";
import { ChannelBot, eligiblePost, Mattermost, readConfig } from "../../tools/mattermost-bot/mattermost.ts";
import { buildArtifactIndicatorReport, buildStagingIndicatorReport } from "../../scripts/report-staging-indicator-counts.mjs";

const id = n => String(n).padStart(26, "a");
const state = "WI";
const source = { id: "wi-official", authority: "Election Office", sourceUrl: "https://official.example/results?year=2024", confidence: "Official source; denominator timing caveat.", parser: "officialCsv", status: "loaded", localArtifact: "C:\\private\\votes.csv", metadata: { token: "DO-NOT-LEAK" } };
const artifact = () => ({
  state: { code: state }, election: { year: 2024 }, sources: [source, { ...source, id: "wi-history", confidence: "Secondary mirror, context only." }],
  native: {
    resultRows: [{ jurisdictionName: 'Dane, "County"', jurisdictionCode: "025", level: "county", totalVotes: 30, votes: { "Candidate A": 20, "Candidate B": 10 }, sourceId: "wi-official" }],
    turnoutRows: [{ county: "Dane", localUnit: "Ward 1", level: "local", ballotsCast: 12, registeredVoters: null, warningRequired: true, denominatorType: "registeredVoters", registrationDenominatorTiming: "pre-election", sourceId: "wi-official" }],
    historicalRows: [2012, 2016, 2020].map(year => ({ electionYear: year, jurisdictionName: "Dane", repVotes: 10, demVotes: 20, sourceDocumentId: "wi-history", sourceId: "history", sourceUrl: `https://official.example/${year}` })),
  },
});
const snapshot = value => ({ artifact: value ?? artifact(), sha256: "a".repeat(64), modifiedAt: "2026-09-14T12:00:00.000Z" });
const env = () => ({ MATTERMOST_URL: "https://chat.example", MATTERMOST_BOT_TOKEN: "test-token-that-is-not-a-real-secret", MATTERMOST_CHANNEL_ID: id(1), MATTERMOST_CHANNEL_NAME: "private-data-channel" });
const post = (n, time, message = "!crm state WI", overrides = {}) => ({ id: id(n), create_at: time, user_id: id(2), channel_id: id(1), message, type: "", props: {}, ...overrides });
const replyReader = () => ({ call: async () => ({ name: "Wisconsin", authority: "State Office", sourceCount: 2, staging: { exists: false } }), close: async () => {} });

test("parser accepts only fixed read commands, strict state selectors and years", () => {
  assert.equal(parseCommand("ordinary discussion"), null);
  assert.equal(parseCommand("!crmish state WI"), null);
  assert.deepEqual(parseCommand("!CRM csv wi historical 2020"), { action: "csv", state: "WI", family: "historical", year: 2020 });
  assert.deepEqual(parseCommand("!crm"), { action: "help" });
  for (const command of ["!crm import WI", "!crm csv ../wi results", "!crm csv WI secrets", "!crm state WI extra", "!crm csv WI results 2024 extra", "!crm csv WI historical 2020junk", "!crm indicators WI 2012", "!crm state WIS", "!crm " + "a".repeat(200)]) {
    assert.throws(() => parseCommand(command), BotError, command);
  }
});

test("CSV escaping handles quotes, newlines, formulas, zero, missing and real numbers", () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const value of ["=HYPERLINK(\"x\")", "+cmd", "-cmd", "@SUM(1)", " \t=1", "\n=1"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell(-2), '"-2"');
  assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell(null), '""');
  assert.ok(makeCsv(["x"], [{ x: 0 }]).startsWith("\uFEFF"));
  assert.ok(makeCsv(["x"], [{ x: 0 }]).endsWith("\r\n"));
  assert.throws(() => makeCsv(["x"], [{ x: "a".repeat(MAX_CSV_BYTES) }]), /8 MiB/);
});

test("only approved data is exported with source caveats, timestamps and hashes", () => {
  const result = exportSnapshot(snapshot(), "WI", "results", 2024);
  assert.equal(result.rowCount, 2);
  assert.equal(result.nativeRowCount, 1);
  assert.match(result.csv, /Candidate A/);
  assert.match(result.csv, /https:\/\/official.example\/results\?year=2024/);
  assert.match(result.csv, /denominator timing caveat/);
  assert.match(result.notes, /do not sum/);
  assert.match(result.csv, /local-staging/);
  assert.match(result.csvSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.bytes, Buffer.byteLength(result.csv));
  assert.doesNotMatch(result.csv, /DO-NOT-LEAK|private|localArtifact|metadata/);
  const turnout = exportSnapshot(snapshot(), "WI", "turnout");
  assert.match(turnout.csv, /pre-election/);
  assert.match(turnout.csv, /"12",""/);
});

test("historical selectors, package-wide sources, missing and ambiguous provenance stay explicit", () => {
  assert.equal(exportSnapshot(snapshot(), "WI", "historical").rowCount, 3);
  const one = exportSnapshot(snapshot(), "WI", "historical", 2020);
  assert.equal(one.rowCount, 1);
  assert.match(one.csv, /Secondary mirror/);
  assert.match(one.csv, /https:\/\/official.example\/2020/);
  assert.equal(exportSnapshot(snapshot(), "WI", "sources").rowCount, 2);
  assert.equal(sourceFields({ sourceId: "unknown" }, [source], "WI").sourceMatch, "missing");
  assert.equal(sourceFields({ sourceId: source.id }, [source, source], "WI").sourceMatch, "ambiguous");
  for (const [family, year] of [["results", 2020], ["turnout", 2016], ["sources", 2024], ["historical", 2024], ["files", 2024]]) {
    assert.throws(() => exportSnapshot(snapshot(), "WI", family, year), BotError);
  }
  const empty = artifact(); empty.native.resultRows = [];
  assert.throws(() => exportSnapshot(snapshot(empty), "WI", "results"), /Missing data is not zero/);
  const bad = artifact(); bad.native.resultRows[0].votes = { A: -1 };
  assert.throws(() => exportSnapshot(snapshot(bad), "WI", "results"), /invalid candidate/);
});

test("public presentation preserves HTTPS URLs but omits local paths and credentials", () => {
  assert.equal(publicText("https://official.example/data.csv"), "https://official.example/data.csv");
  assert.doesNotMatch(publicText("C:\\Users\\person\\secret.txt /home/person/file Bearer abc password=abc"), /person|abc/);
  for (const url of ["file:///secret", "https://user:pass@example.com", "https://example.com?token=secret", "https://example.com#access_token=secret", "https://example.com/token/DO-NOT-LEAK", "http://127.0.0.1/test", "https://172.16.0.1/data", "https://169.254.1.2/data", "https://source.internal.local/data", "http://[::1]/data"]) assert.equal(publicUrl(url), "");
});

test("state replies neutralize mass mentions and source Markdown", async () => {
  const reader = replyReader();
  reader.call = async () => ({ name: "@channel [`click`](bad)", sourceCaveats: ["@here"], staging: { exists: false } });
  const result = await executeCommand(parseCommand("!crm state WI"), reader);
  assert.doesNotMatch(result.message, /@channel|@here|\[`click`\]/);
  assert.match(result.message, /not proof of fraud/);
  const exported = exportSnapshot(snapshot(), "WI", "results");
  reader.call = async () => exported;
  const reply = await executeCommand(parseCommand("!crm csv WI results"), reader);
  assert.equal(reply.files.length, 2);
  assert.equal(JSON.parse(reply.files[1].text).rowCount, 2);
  assert.ok(!Object.hasOwn(JSON.parse(reply.files[1].text), "csv"));
  assert.match(HELP, /not slash commands/);
});

test("config is HTTPS-only, channel-locked, and rejects invalid IDs and tokens", () => {
  const config = readConfig(env());
  assert.equal(config.channelName, "private-data-channel");
  for (const patch of [{ MATTERMOST_URL: "http://chat.example" }, { MATTERMOST_URL: "https://user:pass@chat.example" }, { MATTERMOST_URL: "https://chat.example?token=abc" }, { MATTERMOST_CHANNEL_ID: "../secret" }, { MATTERMOST_CHANNEL_NAME: "" }, { MATTERMOST_CHANNEL_NAME: "Unsafe Channel" }, { MATTERMOST_BOT_TOKEN: "" }, { MATTERMOST_ALLOWED_USER_IDS: "invalid" }, { MATTERMOST_POLL_MS: "1" }]) {
    assert.throws(() => readConfig({ ...env(), ...patch }), BotError);
  }
});

test("only human-looking posts in the authorized channel are eligible", () => {
  const config = readConfig(env());
  assert.ok(eligiblePost(post(1, 100), config, id(3)));
  for (const change of [{ channel_id: id(8) }, { user_id: id(3) }, { delete_at: 1 }, { type: "system_join_channel" }, { props: { from_bot: "true" } }, { props: { from_bot: true } }]) {
    assert.equal(eligiblePost(post(1, 100, "!crm help", change), config, id(3)), false);
  }
  assert.equal(eligiblePost(post(1, 100), { ...config, allowedUsers: [id(4)] }, id(3)), false);
});

test("REST identity check refuses personal/admin tokens and public/wrong channels", async () => {
  let me = { id: id(3), is_bot: true, roles: "system_user" };
  let channel = { id: id(1), type: "P", name: "private-data-channel" };
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    return Response.json(url.endsWith("/users/me") ? me : url.includes("/members/") ? { channel_id: id(1), user_id: id(3) } : channel);
  };
  const api = new Mattermost(readConfig(env()), fetcher);
  await api.checkIdentity();
  assert.equal(requests.every(req => req.init.redirect === "error"), true);
  assert.equal(requests.some(req => req.init.method === "POST"), false);
  me.is_bot = false; await assert.rejects(api.checkIdentity(), /dedicated non-admin/);
  me.is_bot = true; me.roles = "system_user system_admin"; await assert.rejects(api.checkIdentity(), /dedicated non-admin/);
  me.roles = "system_user"; channel.type = "O"; await assert.rejects(api.checkIdentity(), /active private channel/);
  channel.type = "P"; channel.name = "other"; await assert.rejects(api.checkIdentity(), /active private channel/);
});

test("REST attachment flow uses private uploads and thread replies, never public file links", async () => {
  const requests = [];
  const api = new Mattermost(readConfig(env()), async (url, init) => {
    requests.push({ url, init });
    if (url.includes("/members/")) return Response.json({ channel_id: id(1), user_id: url.split("/").at(-1) });
    if (url.endsWith("/channels/" + id(1))) return Response.json({ id: id(1), name: "private-data-channel", type: "P" });
    if (url.endsWith("/files")) return Response.json({ file_infos: [{ id: id(5) }] }, { status: 201 });
    return Response.json({ id: id(6) }, { status: 201 });
  });
  api.botId = id(3);
  await api.reply(post(4, 100), { message: "Data", files: [{ filename: "wi.csv", text: "a,b", mime: "text/csv" }] });
  const upload = requests.find(req => req.url.endsWith("/files"));
  assert.equal(upload.init.body.get("channel_id"), id(1));
  const created = JSON.parse(requests.find(req => req.url.endsWith("/posts")).init.body);
  assert.equal(created.channel_id, id(1)); assert.equal(created.root_id, id(4)); assert.deepEqual(created.file_ids, [id(5)]);
  assert.equal(requests.some(req => req.url.includes("link")), false);
  await assert.rejects(api.reply(post(4, 100, "", { channel_id: id(9) }), { message: "No" }), /outside/);
});

test("API failures never echo tokens or response bodies; writes are not retried", async () => {
  let called = 0;
  const api = new Mattermost(readConfig(env()), async () => { called++; return new Response("secret=DO-NOT-LEAK", { status: 403 }); });
  await assert.rejects(api.request("/posts", { method: "POST" }), error => !error.message.includes("DO-NOT-LEAK") && /HTTP 403/.test(error.message));
  assert.equal(called, 1);
});

test("poller skips startup history, ignores edits/replays and serializes private commands", async () => {
  let current = [post(1, 100)];
  const sent = [];
  const api = { config: readConfig(env()), botId: id(3), page: async () => current, isMember: async () => true, reply: async (p, r) => sent.push({ p, r }) };
  const bot = new ChannelBot(api, replyReader(), () => {});
  await bot.poll(); assert.equal(sent.length, 0);
  current = [post(4, 101), post(1, 100)];
  await bot.poll(); assert.equal(sent.length, 1);
  await bot.poll(); assert.equal(sent.length, 1);
  current = [post(4, 101, "!crm csv WI sources"), post(1, 100)];
  await bot.poll(); assert.equal(sent.length, 1);
  assert.equal(bot.watermark, 101);
});

test("startup scans the complete newest-timestamp boundary without replaying old commands", async () => {
  const first = Array.from({ length: 100 }, (_, n) => post(200 - n, 100, "discussion"));
  const second = [post(100, 100, "!crm state WI"), post(1, 99, "discussion")];
  const calls = [];
  const sent = [];
  const api = {
    config: readConfig(env()), botId: id(3),
    page: async before => { calls.push(before); return before ? second : first; },
    isMember: async () => true, reply: async (p, r) => sent.push({ p, r }),
  };
  const bot = new ChannelBot(api, replyReader(), () => {});
  await bot.poll();
  assert.equal(calls[1], id(101));
  assert.equal(bot.initialized, true);
  assert.equal(bot.watermark, 100);
  assert.equal(bot.seen.has(id(100)), true);
  await bot.poll();
  assert.equal(sent.length, 0);
});

test("poll pagination catches up by fixed cursor and rejects nonprogressing cursors", async () => {
  const config = readConfig(env());
  const pages = [Array.from({ length: 100 }, (_, n) => post(n + 100, 200 - n, "discussion")), [post(1, 99, "discussion")]];
  let calls = [];
  const api = { config, botId: id(3), page: async before => { calls.push(before); return before ? pages[1] : pages[0]; }, isMember: async () => true, reply: async () => {} };
  const bot = new ChannelBot(api, replyReader(), () => {});
  bot.initialized = true; bot.watermark = 100;
  await bot.poll(); assert.equal(calls[1], id(199)); assert.equal(bot.watermark, 200);
  api.page = async () => pages[0]; bot.watermark = 1;
  await assert.rejects(bot.poll(), /did not progress/); assert.equal(bot.watermark, 1);
});

test("large backlogs recover with an explicit notice and never replay the same backlog", async () => {
  const logs = [];
  let index = 0;
  const api = { config: readConfig(env()), botId: id(3), page: async () => Array.from({ length: 100 }, (_, n) => post(2000 - (index * 100 + n), 2000 - (index * 100 + n), "discussion")).map((p, n) => { if (n === 99) index++; return p; }), isMember: async () => true, reply: async () => {} };
  const bot = new ChannelBot(api, replyReader(), message => logs.push(message));
  bot.initialized = true; bot.watermark = 1;
  await bot.poll();
  assert.equal(index, 10); assert.equal(bot.watermark, 2000);
  assert.match(bot.backlogNotice, /Older queued commands were skipped/);
  assert.equal(logs.length, 1);
});

test("malformed startup pages cannot initialize or mutate the cursor", async () => {
  const api = { config: readConfig(env()), botId: id(3), page: async () => [{}] };
  const bot = new ChannelBot(api, replyReader(), () => {});
  await assert.rejects(bot.poll(), /invalid/);
  assert.equal(bot.initialized, false); assert.equal(bot.seen.size, 0); assert.equal(bot.watermark, 0);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "crm-mattermost-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "etl", "state-configs"), { recursive: true });
  await mkdir(path.join(root, ".etl", "staging"), { recursive: true });
  await writeFile(path.join(root, "scripts", "state-metadata.mjs"), 'export const states=[{code:"WI",name:"Wisconsin",fips:"55"}];');
  await writeFile(path.join(root, "etl", "state-configs", "wi.json"), "{}");
  await writeFile(path.join(root, ".etl", "staging", "wi-2024-staging.json"), JSON.stringify(artifact()));
  return { root, context: createRuntimeContext({ repoRoot: root }) };
}

test("artifact readers reject oversized files before JSON parsing", async t => {
  const { root, context } = await fixture(t);
  const file = await open(path.join(root, ".etl", "staging", "wi-2024-staging.json"), "r+");
  try { await file.truncate(MAX_ARTIFACT_BYTES + 1); } finally { await file.close(); }
  await assert.rejects(readSnapshot(context, "WI"), /safe read limit/);
});

test("state inventory and indicator MCP calls enforce the same artifact-size boundary", async t => {
  const { root, context } = await fixture(t);
  await mkdir(path.join(root, "data"));
  await writeFile(path.join(root, "data", "source-acquisition-tiers.json"), '{"states":[]}');
  await writeFile(path.join(root, "package.json"), '{"scripts":{}}');
  const file = await open(path.join(root, ".etl", "staging", "wi-2024-staging.json"), "r+");
  try { await file.truncate(MAX_ARTIFACT_BYTES + 1); } finally { await file.close(); }
  const reader = await connectReader(context);
  t.after(() => reader.close());
  for (const name of ["crm_state_inventory", "crm_report_indicators"]) await assert.rejects(reader.call(name, { state: "WI" }), /safe read limit/);
});

test("single-artifact advisory helper preserves directory-report rows and no-data reasons", async t => {
  const { root } = await fixture(t);
  const data = artifact();
  data.native.metrics = { nativeReviewWarning: "Current review caveat", nativeHistoricalReviewWarning: "Historical caveat" };
  data.native.reviewRows = Array.from({ length: 20 }, (_, n) => ({ county: "Dane", localUnit: `Unit ${n}`, sourceId: "wi-official", totalVotes: 100 + n, harris: 60 + n, trump: 40, harrisShare: 60, trumpShare: 40, demDropoff: 10, repDropoff: -5, coverageMode: "presidentVsSenate" }));
  await writeFile(path.join(root, ".etl", "staging", "wi-2024-staging.json"), JSON.stringify(data));
  for (const year of [2016, 2020, 2024]) {
    const directory = await buildStagingIndicatorReport({ stagingDir: path.join(root, ".etl", "staging"), year });
    const single = buildArtifactIndicatorReport(data, year, "WI");
    assert.deepEqual(directory.states, [single]);
    assert.equal(single.evaluationCaveat, year === 2024 ? "Current review caveat" : "Historical caveat");
    if (year !== 2024) assert.equal(single.evaluationReason, "no_historical_review_rows");
  }
});

test("CSV rejects fractional/unsafe counts while preserving reporting-unit names", () => {
  for (const bad of [1.2, Number.MAX_SAFE_INTEGER + 1]) {
    const data = artifact(); data.native.resultRows[0].votes["Candidate A"] = bad;
    assert.throws(() => exportSnapshot(snapshot(data), "WI", "results"), /invalid candidate/);
    const turnout = artifact(); turnout.native.turnoutRows[0].ballotsCast = bad;
    assert.throws(() => exportSnapshot(snapshot(turnout), "WI", "turnout"), /invalid integer/);
  }
  const data = artifact(); data.native.resultRows[0].reportingUnit = "County-equivalent unit";
  assert.match(exportSnapshot(snapshot(data), "WI", "results").csv, /County-equivalent unit/);
  data.native.resultRows[0].reportingUnit = { sourceUnitId: "0005", sourceDisplayName: "Unit five", reportingGrain: "precinct", parentGeoid: "27001", isGeographic: true, private: "DO-NOT-LEAK" };
  const csv = exportSnapshot(snapshot(data), "WI", "results").csv;
  assert.match(csv, /0005/); assert.match(csv, /27001/); assert.doesNotMatch(csv, /DO-NOT-LEAK/);
});

test("real bounded artifact reader verifies state identity and hash from the exact CSV input", async t => {
  const { root, context } = await fixture(t);
  const result = await exportState(context, "WI", "results", 2024);
  assert.equal(result.rowCount, 2);
  await assert.rejects(readSnapshot(context, "../WI"), /two-letter/);
  await assert.rejects(readSnapshot(context, "XX"));
  const wrong = artifact(); wrong.state.code = "MN";
  await writeFile(path.join(root, ".etl", "staging", "wi-2024-staging.json"), JSON.stringify(wrong));
  await assert.rejects(readSnapshot(context, "WI"), /identity/);
});

test("MCP transport exposes only three read tools and rejects action/extra arguments", async t => {
  const { context } = await fixture(t);
  const server = createBotMcpServer(context);
  const client = new Client({ name: "bot-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  t.after(async () => { await client.close(); await server.close(); });
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name), [...BOT_TOOL_NAMES]);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
  const csv = await client.callTool({ name: "crm_export_state_csv", arguments: { state: "WI", family: "results", year: 2024 } });
  assert.equal(csv.structuredContent.rowCount, 2);
  for (const args of [{ state: "WI", family: "results", path: ".env.local" }, { state: "../WI", family: "results" }]) {
    const result = await client.callTool({ name: "crm_export_state_csv", arguments: args });
    assert.equal(result.isError, true);
  }
  await assert.rejects(client.callTool({ name: "crm_import_staging", arguments: { state: "WI" } }), /not found/);
});

test("reader wrapper round-trips MCP export and refuses arbitrary tool names", async t => {
  const { context } = await fixture(t);
  const reader = await connectReader(context);
  t.after(() => reader.close());
  const result = await reader.call("crm_export_state_csv", { state: "WI", family: "turnout" });
  assert.equal(result.rowCount, 1);
  await assert.rejects(reader.call("crm_import_staging", { state: "WI" }), /not available/);
});

test("bot source never loads application env or registers the full development MCP", async () => {
  const run = await readFile(new URL("../../tools/mattermost-bot/run.ts", import.meta.url), "utf8");
  const mcp = await readFile(new URL("../../tools/mattermost-bot/mcp.ts", import.meta.url), "utf8");
  assert.match(run, /new URL\("\.\/\.env\.local", import.meta.url\)/);
  assert.doesNotMatch(mcp, /createCivicResultMapsMcpServer|StdioClientTransport|serveStdio/);
});
