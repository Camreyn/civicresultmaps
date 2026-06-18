import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VoteMethodRowSummary } from "./types";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function voteMethodPath(state: string, year: number) {
  return path.join(
    process.cwd(),
    "data",
    "eac-2024-vote-methods",
    `${state.toLowerCase()}-${year}-eac-vote-methods.csv`,
  );
}

export async function listVoteMethodRows(input: {
  limit?: number;
  method?: string;
  state: string;
  year: number;
}): Promise<VoteMethodRowSummary[]> {
  let text = "";
  try {
    text = await readFile(voteMethodPath(input.state, input.year), "utf8");
  } catch {
    return [];
  }

  const parsed = parseCsv(text);
  const [header, ...rows] = parsed;
  if (!header) {
    return [];
  }

  const columns = Object.fromEntries(header.map((name, index) => [name, index]));
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 20000);
  const methodFilter = input.method?.trim();
  const output: VoteMethodRowSummary[] = [];

  for (const row of rows) {
    const method = row[columns.method] ?? "";
    if (methodFilter && method !== methodFilter) {
      continue;
    }

    const state = row[columns.state] ?? input.state;
    const year = Number(row[columns.election_year] ?? input.year);
    const jurisdictionCode = row[columns.jurisdiction_code] ?? "";

    output.push({
      county: row[columns.county] ?? "",
      electionYear: Number.isFinite(year) ? year : input.year,
      id: `${state}-${year}-${jurisdictionCode}-${method}`,
      jurisdictionCode,
      jurisdictionName: row[columns.jurisdiction_name] ?? "",
      level: row[columns.level] ?? "",
      localUnit: row[columns.local_unit] ?? "",
      method,
      methodLabel: row[columns.method_label] ?? method,
      methodSharePct: numberOrNull(row[columns.method_share_pct] ?? ""),
      sourceField: row[columns.source_field] ?? "",
      sourceId: row[columns.source_title] ?? "U.S. EAC Election Administration and Voting Survey",
      sourceStatus: row[columns.source_status] ?? "",
      sourceUrl: row[columns.source_url] ?? "",
      state,
      totalVoters: numberOrNull(row[columns.total_voters] ?? ""),
      valueStatus: row[columns.value_status] ?? "",
      voters: numberOrNull(row[columns.voters] ?? ""),
    });

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}
