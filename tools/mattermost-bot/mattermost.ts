import { setTimeout as delay } from "node:timers/promises";
import { BotError, MAX_CSV_BYTES, record, type Row } from "./data.ts";
import { executeCommand, parseCommand, type Reply } from "./commands.ts";
import type { Reader } from "./mcp.ts";

export type BotConfig = { url: string; token: string; channelId: string; channelName: string; allowedUsers: string[]; pollMs: number };
const ID = /^[a-z0-9]{26}$/;
export function readConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  let url: URL;
  try { url = new URL(env.MATTERMOST_URL ?? ""); } catch { throw new BotError("Set MATTERMOST_URL to the HTTPS server address."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new BotError("MATTERMOST_URL must be HTTPS, without credentials, query, or fragment.");
  const token = env.MATTERMOST_BOT_TOKEN ?? "";
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) throw new BotError("Set MATTERMOST_BOT_TOKEN to a dedicated bot access token in the private environment file.");
  const channelId = env.MATTERMOST_CHANNEL_ID ?? "";
  if (!ID.test(channelId)) throw new BotError("Set MATTERMOST_CHANNEL_ID to the private channel's 26-character ID.");
  const channelName = env.MATTERMOST_CHANNEL_NAME ?? "";
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(channelName)) throw new BotError("Set MATTERMOST_CHANNEL_NAME to the private channel's exact URL-safe name.");
  const allowedUsers = (env.MATTERMOST_ALLOWED_USER_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (allowedUsers.some(id => !ID.test(id))) throw new BotError("MATTERMOST_ALLOWED_USER_IDS contains an invalid user ID.");
  const pollMs = Number(env.MATTERMOST_POLL_MS ?? 5000);
  if (!Number.isInteger(pollMs) || pollMs < 3000 || pollMs > 60_000) throw new BotError("Polling interval must be between 3000 and 60000 milliseconds.");
  return { url: url.href.replace(/\/$/, ""), token, channelId, channelName, allowedUsers, pollMs };
}

export class Mattermost {
  readonly config: BotConfig;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
  botId = "";
  constructor(config: BotConfig, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
    this.config = config; this.fetcher = fetcher; this.signal = signal;
  }
  async request(route: string, init: RequestInit = {}): Promise<Row> {
    const signals = [AbortSignal.timeout(20_000), ...(this.signal ? [this.signal] : [])];
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.url}/api/v4${route}`, {
        ...init, redirect: "error", signal: AbortSignal.any(signals),
        headers: { ...init.headers, Authorization: `Bearer ${this.config.token}` },
      });
    } catch { throw new BotError("Mattermost connection failed or timed out. No automatic write retry was attempted."); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new BotError(`Mattermost returned HTTP ${response.status}. Check bot membership, permissions and file-upload settings.`);
    }
    if (Number(response.headers.get("content-length")) > 4 * 1024 * 1024) {
      await response.body?.cancel(); throw new BotError("Mattermost response exceeds the safe size limit.");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new BotError("Mattermost returned an empty response.");
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        total += item.value.byteLength;
        if (total > 4 * 1024 * 1024) { await reader.cancel(); throw new BotError("Mattermost response exceeds the safe size limit."); }
        chunks.push(item.value);
      }
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch (error) {
      if (error instanceof BotError) throw error;
      throw new BotError("Mattermost returned an invalid response.");
    } finally { reader.releaseLock(); }
  }
  async checkIdentity() {
    const me = await this.request("/users/me");
    if (me.is_bot !== true || !ID.test(String(me.id)) || String(me.roles).split(" ").includes("system_admin")) {
      throw new BotError("Use a dedicated non-admin bot account, not your personal login or an administrator token.");
    }
    this.botId = String(me.id);
    await this.checkChannel();
    return { botId: this.botId, botUsername: me.username, channelId: this.config.channelId, channelName: this.config.channelName };
  }
  async checkChannel() {
    const channel = await this.request(`/channels/${this.config.channelId}`);
    if (channel.id !== this.config.channelId || channel.name !== this.config.channelName || channel.type !== "P" || channel.delete_at) {
      throw new BotError("The configured destination must be the named, active private channel. Refusing to post elsewhere.");
    }
    if (!this.botId || !await this.isMember(this.botId)) throw new BotError("Invite the bot account to the private channel first.");
  }
  async isMember(userId: string) {
    if (!ID.test(userId)) return false;
    const member = await this.request(`/channels/${this.config.channelId}/members/${userId}`);
    return member.channel_id === this.config.channelId && member.user_id === userId;
  }
  async page(before?: string) {
    if (before && !ID.test(before)) throw new BotError("Invalid channel post cursor.");
    const result = await this.request(`/channels/${this.config.channelId}/posts?per_page=100${before ? `&before=${before}` : ""}`);
    if (!Array.isArray(result.order) || result.order.some(id => !ID.test(String(id)))) throw new BotError("Mattermost returned an invalid post list.");
    return result.order.map(id => record(record(result.posts)[String(id)]));
  }
  async reply(post: Row, reply: Reply) {
    if (post.channel_id !== this.config.channelId || !ID.test(String(post.id))) throw new BotError("Refusing a reply outside the configured channel.");
    // Recheck destination privacy and both memberships immediately before upload.
    await this.checkChannel();
    if (!await this.isMember(String(post.user_id))) throw new BotError("The requesting user is no longer in the channel.");
    const fileIds: string[] = [];
    for (const file of reply.files ?? []) {
      if (!/^[a-z0-9.-]+$/.test(file.filename) || Buffer.byteLength(file.text) > MAX_CSV_BYTES) throw new BotError("Attachment failed its name/size guard.");
      const data = new FormData();
      data.set("channel_id", this.config.channelId);
      data.append("files", new Blob([file.text], { type: file.mime }), file.filename);
      const uploaded = await this.request("/files", { method: "POST", body: data });
      const infos = uploaded.file_infos;
      if (!Array.isArray(infos) || infos.length !== 1 || !ID.test(String(record(infos[0]).id))) throw new BotError("Mattermost did not confirm the attachment; no post was created.");
      fileIds.push(String(record(infos[0]).id));
    }
    await this.checkChannel();
    const rootId = post.root_id || post.id;
    if (!ID.test(String(rootId))) throw new BotError("Invalid reply thread.");
    // No automatic retry: a timed-out POST may already have succeeded.
    await this.request("/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      channel_id: this.config.channelId, root_id: rootId, message: reply.message.slice(0, 12_000), file_ids: fileIds,
    }) });
  }
}

export function eligiblePost(post: Row, config: BotConfig, botId: string): boolean {
  return post.channel_id === config.channelId && ID.test(String(post.id)) && ID.test(String(post.user_id))
    && post.user_id !== botId && !post.delete_at && !post.type && record(post.props).from_bot !== "true" && record(post.props).from_bot !== true
    && typeof post.message === "string" && Number.isSafeInteger(post.create_at)
    && (!config.allowedUsers.length || config.allowedUsers.includes(String(post.user_id)));
}

function validatePage(page: Row[], channelId: string) {
  if (page.length > 100 || page.some(post => post.channel_id !== channelId || !ID.test(String(post.id)) || !Number.isSafeInteger(post.create_at) || Number(post.create_at) < 0)) {
    throw new BotError("Mattermost returned invalid or out-of-channel posts.");
  }
  if (new Set(page.map(post => post.id)).size !== page.length
    || page.some((post, index) => index > 0 && Number(post.create_at) > Number(page[index - 1].create_at))) {
    throw new BotError("Mattermost returned duplicated or unordered posts.");
  }
}

export class ChannelBot {
  readonly api: Mattermost;
  readonly reader: Reader;
  readonly log: (message: string) => void;
  readonly seen = new Set<string>();
  readonly lastCommand = new Map<string, number>();
  watermark = 0;
  initialized = false;
  backlogNotice = "";
  constructor(api: Mattermost, reader: Reader, log: (message: string) => void = console.log) {
    this.api = api; this.reader = reader; this.log = log;
  }
  remember(id: string) {
    this.seen.add(id);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
  }
  async poll() {
    // Pages are anchored by post ID, not a moving numeric page offset. No use of
    // Mattermost's since endpoint, which can return nonconsecutive capped rows.
    let page = await this.api.page();
    validatePage(page, this.api.config.channelId);
    if (!this.initialized) {
      const startupWatermark = Math.max(0, ...page.map(post => Number(post.create_at) || 0));
      const startupIds = new Set<string>();
      const pageIds = new Set<string>();
      for (let count = 0; ; count++) {
        validatePage(page, this.api.config.channelId);
        page.forEach(post => startupIds.add(String(post.id)));
        if (page.length < 100 || page.some(post => Number(post.create_at) < startupWatermark)) break;
        const before = String(page.at(-1)!.id);
        if (pageIds.has(before)) throw new BotError("Startup channel pagination did not progress. No history was accepted.");
        if (count >= 9) throw new BotError("Startup history has more than 1,000 posts at the newest timestamp. No commands were processed.");
        pageIds.add(before);
        page = await this.api.page(before);
      }
      startupIds.forEach(id => this.remember(id));
      this.watermark = startupWatermark;
      this.initialized = true;
      return; // Never replay historical chat commands on startup/restart.
    }
    const candidates: Row[] = [];
    const pageIds = new Set<string>();
    for (let count = 0; ; count++) {
      validatePage(page, this.api.config.channelId);
      candidates.push(...page.filter(post => Number(post.create_at) >= this.watermark));
      if (page.length < 100 || page.some(post => Number(post.create_at) < this.watermark)) break;
      const before = String(page.at(-1)!.id);
      if (pageIds.has(before)) throw new BotError("Channel pagination did not progress. No watermark advanced.");
      if (count >= 9) {
        this.backlogNotice = "Command backlog exceeded 1,000 posts. Older queued commands were skipped; please resend any unanswered request. CSV exports themselves are never truncated.";
        this.log(this.backlogNotice);
        break;
      }
      pageIds.add(before);
      page = await this.api.page(before);
    }
    const unique = [...new Map(candidates.map(post => [String(post.id), post])).values()]
      .sort((a, b) => Number(a.create_at) - Number(b.create_at) || String(a.id).localeCompare(String(b.id)));
    let handled = 0;
    for (const post of unique) {
      const id = String(post.id);
      if (this.seen.has(id)) continue;
      this.remember(id);
      if (!eligiblePost(post, this.api.config, this.api.botId)) continue;
      if (!/^!crm(?:\s|$)/i.test(String(post.message).trim())) continue;
      if (handled >= 10) { this.log("Command burst limit reached; ignored excess commands. Ask users to retry."); continue; }
      const now = Date.now();
      const userId = String(post.user_id);
      if (now - (this.lastCommand.get(userId) ?? 0) < 5000) { this.log("Command rate-limited; ask user to retry after five seconds."); continue; }
      handled++;
      this.lastCommand.set(userId, now);
      if (this.lastCommand.size > 2000) this.lastCommand.delete(this.lastCommand.keys().next().value!);
      if (!await this.api.isMember(userId)) continue;
      let reply: Reply;
      try {
        const command = parseCommand(String(post.message));
        if (!command) continue;
        reply = await executeCommand(command, this.reader);
      } catch (error) {
        reply = { message: error instanceof BotError ? error.message : "The read failed. No data was returned. Ask the operator to inspect the bot locally." };
      }
      if (this.backlogNotice) reply.message = `${this.backlogNotice}\n\n${reply.message}`;
      try { await this.api.reply(post, reply); this.backlogNotice = ""; this.log("Command completed in the configured private channel."); }
      catch (error) { this.log(error instanceof BotError ? error.message : "Reply failed. No automatic write retry; ask the user to submit a new command."); }
    }
    this.watermark = Math.max(this.watermark, ...unique.map(post => Number(post.create_at)));
  }
  async run(signal: AbortSignal) {
    while (!signal.aborted) {
      try { await this.poll(); }
      catch (error) { if (!signal.aborted) this.log(error instanceof BotError ? error.message : "Polling failed; retrying on the next interval."); }
      try { await delay(this.api.config.pollMs, undefined, { signal }); } catch { break; }
    }
  }
}
