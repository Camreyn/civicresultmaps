import { BotError, CAVEAT, FAMILIES, publicText, record, type Family, type Row } from "./data.ts";
import type { Reader } from "./mcp.ts";

export const HELP = [
  "CivicResultMaps read-only bot (local staging)",
  "`!crm state WI` — inventory, row counts, gaps and caveats",
  "`!crm sources WI` — complete source inventory CSV",
  "`!crm indicators WI 2024` — calculated advisory counts (2016/2020/2024)",
  "`!crm csv WI results 2024` — candidate vote rows",
  "`!crm csv WI turnout 2024` — turnout and denominator context",
  "`!crm csv WI historical 2020` — historical rows; omit year for all years",
  "`!crm csv WI sources` — all source references and limitations",
  "Use a two-letter state/DC code. These are channel messages, not slash commands.",
  CAVEAT,
].join("\n");

export type Command = { action: "help" | "state" | "sources" | "indicators" | "csv"; state?: string; family?: Family; year?: number };
export function parseCommand(message: string): Command | null {
  if (!/^!crm(?:\s|$)/i.test(message.trim())) return null;
  if (message.length > 160) throw new BotError("Command is too long. Use !crm help.");
  const parts = message.trim().split(/\s+/);
  if (parts.length === 1 || (parts.length === 2 && parts[1].toLowerCase() === "help")) return { action: "help" };
  const action = parts[1].toLowerCase();
  if (!["state", "sources", "indicators", "csv"].includes(action)) throw new BotError("Unknown command. Use !crm help.");
  const state = (parts[2] ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new BotError("Use a two-letter state code, such as !crm state WI.");
  if ((action === "state" || action === "sources") && parts.length !== 3) throw new BotError("This command accepts only a state code.");
  const family = action === "csv" ? parts[3]?.toLowerCase() : undefined;
  if (action === "csv" && !FAMILIES.includes(family as Family)) throw new BotError(`Choose a dataset: ${FAMILIES.join(", ")}.`);
  if (parts.length > (action === "csv" ? 5 : action === "indicators" ? 4 : 3)) throw new BotError("Unexpected arguments. Use !crm help.");
  const yearText = action === "csv" ? parts[4] : action === "indicators" ? parts[3] : undefined;
  if (yearText !== undefined && !/^(2012|2016|2020|2024)$/.test(yearText)) throw new BotError("Supported years: 2012, 2016, 2020, 2024.");
  const year = yearText === undefined ? undefined : Number(yearText);
  if (action === "indicators" && year === 2012) throw new BotError("Advisory calculations do not support 2012.");
  return { action: action as Command["action"], state, ...(family ? { family: family as Family } : {}), ...(year !== undefined ? { year } : {}) };
}

// Neutralize mentions/formatting in source-owned text; bot-authored syntax alone
// controls messages. CSV preserves text values, protected against formulas.
function chat(value: unknown) {
  return publicText(value).replace(/@/g, "@\u200b").replace(/[`*_[\]<>]/g, "").replace(/[\r\n]+/g, " ");
}
export type Reply = { message: string; files?: { filename: string; text: string; mime: string }[] };
export async function executeCommand(command: Command, reader: Reader): Promise<Reply> {
  if (command.action === "help") return { message: HELP };
  const state = command.state!;
  if (command.action === "state") {
    const info = await reader.call("crm_state_inventory", { state });
    const staging = record(info.staging);
    const counts = record(staging.rows);
    return { message: [
      `${chat(info.name)} (${state}) — local staging inventory`,
      `Authority: ${chat(info.authority)}; sources: ${chat(info.sourceCount)}`,
      staging.exists ? `Native rows: results ${chat(counts.results)}, review ${chat(counts.review)}, turnout ${chat(counts.turnout)}, historical ${chat(counts.historical)}.` : "No staging artifact available.",
      staging.exists ? `Artifact modified: ${chat(staging.modifiedAt)} (file timestamp, not certification date).` : "",
      ...[...new Set(Array.isArray(info.gaps) ? info.gaps : [])].slice(0, 12).map(gap => `Gap: ${chat(gap)}`),
      ...(Array.isArray(info.sourceCaveats) ? info.sourceCaveats : []).slice(0, 4).map(caveat => `Source caveat: ${chat(caveat)}`),
      ...(Array.isArray(info.warnings) ? info.warnings : []).map(warning => `Warning: ${chat(warning)}`), CAVEAT,
    ].filter(Boolean).join("\n") };
  }
  if (command.action === "indicators") {
    const info = await reader.call("crm_report_indicators", { state, year: command.year ?? 2024 });
    return { message: [
      `${state} ${chat(info.year)} — calculated staging advisory indicators`,
      `Review rows: ${chat(info.reviewRows)}; indicator rows: ${chat(info.indicatorRows)}; flagged county/jurisdictions: ${chat(info.uniqueFlaggedCountyJurisdictions)}; flagged areas: ${chat(info.flaggedAreas)}.`,
      `Types: ${Object.entries(record(info.byType)).map(([key, value]) => `${chat(key)}: ${chat(value)}`).join(", ") || "none"}`,
      `Evaluation: ${chat(info.evaluationReason)}. ${chat(info.evaluationCaveat)}`,
      chat(info.broadSignalWarning), "Production indicator counts were not checked.", CAVEAT,
    ].filter(Boolean).join("\n") };
  }
  const args: Row = { state, family: command.action === "sources" ? "sources" : command.family };
  if (command.year !== undefined) args.year = command.year;
  const exported = await reader.call("crm_export_state_csv", args);
  if (typeof exported.csv !== "string" || typeof exported.filename !== "string") throw new BotError("MCP returned an invalid export.");
  const { csv, ...manifest } = exported;
  // Sources are delivered as an attachment too, avoiding a second parser or a
  // truncated source list being mistaken for the complete inventory.
  const message = `${state} — ${chat(exported.family)} (${exported.year ?? "all package years"}): ${chat(exported.rowCount)} CSV rows from ${chat(exported.nativeRowCount)} native rows.\n${chat(exported.notes)}\nArtifact modified: ${chat(exported.artifactModifiedAt)}.\n${CAVEAT}`;
  return { message, files: [
    { filename: exported.filename, text: csv, mime: "text/csv;charset=utf-8" },
    { filename: exported.filename.replace(/\.csv$/, ".manifest.json"), text: JSON.stringify(manifest, null, 2) + "\n", mime: "application/json" },
  ] };
}
