import type { ResultRow } from "./types";
import type { WorkspaceNavigationContext } from "./workspace-navigation";

export const WORKSPACE_R_RUNTIME_VERSION = "0.6.0";
export const WORKSPACE_R_RUNTIME_R_VERSION = "4.6.0";
export const WORKSPACE_R_RUNTIME_PUBLIC_PATH = `/vendor/webr/v${WORKSPACE_R_RUNTIME_VERSION}/`;
export const WORKSPACE_R_RUNTIME_STARTUP_TIMEOUT_MS = 60_000;
export const WORKSPACE_R_MAX_INPUT_RESULT_ROWS = 5_000;
export const WORKSPACE_R_MAX_INPUT_VOTE_ROWS = 25_000;
export const WORKSPACE_R_MAX_INPUT_BYTES = 2_000_000;
export const WORKSPACE_R_MAX_INPUT_STRING_LENGTH = 512;
export const WORKSPACE_R_MAX_OUTPUT_ROWS = 100;
export const WORKSPACE_R_MAX_OUTPUT_COLUMNS = 12;
export const WORKSPACE_R_MAX_OUTPUT_VALUES = 100;
export const WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH = 2_000;
export const WORKSPACE_R_MAX_OUTPUT_LABEL_LENGTH = 200;

export type WorkspaceRDataFrameColumns = Record<string, Array<boolean | number | string | null>>;

export type WorkspaceRCalculationInputs = {
  context: {
    fips: string | null;
    inputByteLimit: number;
    inputBytes: number;
    inputTruncated: boolean;
    mode: string | null;
    resultRowCount: number;
    state: string;
    tab: string;
    truncatedStringCount: number;
    viewResultRowCount: number;
    viewVoteRowCount: number;
    voteRowCount: number;
    year: number;
  };
  results: WorkspaceRDataFrameColumns;
  viewResults: WorkspaceRDataFrameColumns;
  viewVotes: WorkspaceRDataFrameColumns;
  votes: WorkspaceRDataFrameColumns;
};

export type WorkspaceRDisplayScalar = boolean | number | string | null;

export type WorkspaceRDisplayResult =
  | { detail?: string; kind: "metric"; label: string; value: WorkspaceRDisplayScalar }
  | { kind: "object"; entries: Array<{ label: string; value: WorkspaceRDisplayScalar }>; truncated: boolean }
  | { kind: "scalar"; value: WorkspaceRDisplayScalar }
  | { kind: "table"; columns: string[]; rows: WorkspaceRDisplayScalar[][]; truncated: boolean }
  | { kind: "vector"; names?: string[]; truncated: boolean; values: WorkspaceRDisplayScalar[] };

type IndexedResultRow = {
  fips?: string;
  row: {
    jurisdictionCode: string;
    jurisdictionName: string;
    jurisdictionTag: string | null;
    level: ResultRow["level"];
    marginPct: number | null;
    marginVotes: number | null;
    office: string;
    sourceId: string;
    state: string;
    totalVotes: number | null;
    winner: string;
    year: number;
  };
  rowId: number;
  votes: Record<string, number>;
};

type VoteInputRow = {
  candidate: string;
  rowId: number;
  votes: number | null;
};

export function buildWorkspaceRCalculationInputs(
  results: ResultRow[],
  navigationContext: WorkspaceNavigationContext,
): WorkspaceRCalculationInputs {
  let resultLimit = Math.min(results.length, WORKSPACE_R_MAX_INPUT_RESULT_ROWS);
  let voteLimit = WORKSPACE_R_MAX_INPUT_VOTE_ROWS;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const inputs = buildInputsAtLimits(results, navigationContext, resultLimit, voteLimit);
    setExactInputBytes(inputs);
    if (inputs.context.inputBytes <= WORKSPACE_R_MAX_INPUT_BYTES) return inputs;

    const reduction = Math.max(0.05, (WORKSPACE_R_MAX_INPUT_BYTES / inputs.context.inputBytes) * 0.9);
    const nextResultLimit = Math.floor(resultLimit * reduction);
    const nextVoteLimit = Math.floor(voteLimit * reduction);
    if (nextResultLimit === resultLimit && nextVoteLimit === voteLimit) {
      resultLimit = Math.max(0, resultLimit - 1);
      voteLimit = Math.max(0, voteLimit - 1);
    } else {
      resultLimit = nextResultLimit;
      voteLimit = nextVoteLimit;
    }
  }

  const emptyInputs = buildInputsAtLimits(results, navigationContext, 0, 0);
  setExactInputBytes(emptyInputs);
  return emptyInputs;
}

export function normalizeWorkspaceRResult(value: unknown): WorkspaceRDisplayResult {
  if (!isRecord(value) || typeof value.format !== "string") {
    throw new Error("The R runtime returned an unsupported result envelope.");
  }
  if (value.format === "data-frame") return normalizeDataFrame(value.rows);
  if (value.format === "r-object") return normalizeSerializedRObject(value.value);
  throw new Error("The R runtime returned an unknown result format.");
}

export function resultRowFips(row: ResultRow) {
  const tagged = row.jurisdictionTag?.match(/^county:(\d{5})$/)?.[1];
  if (tagged) return tagged;
  return row.level === "county" && /^\d{5}$/.test(row.jurisdictionCode)
    ? row.jurisdictionCode
    : undefined;
}

function buildInputsAtLimits(
  results: ResultRow[],
  navigationContext: WorkspaceNavigationContext,
  resultLimit: number,
  voteLimit: number,
): WorkspaceRCalculationInputs {
  let truncatedStringCount = 0;
  const safeString = (value: string) => {
    if (value.length <= WORKSPACE_R_MAX_INPUT_STRING_LENGTH) return value;
    truncatedStringCount += 1;
    return `${value.slice(0, WORKSPACE_R_MAX_INPUT_STRING_LENGTH - 3)}...`;
  };
  const limitedResults = results.slice(0, resultLimit).map((row, index): IndexedResultRow => ({
    fips: resultRowFips(row),
    row: {
      jurisdictionCode: safeString(row.jurisdictionCode),
      jurisdictionName: safeString(row.jurisdictionName),
      jurisdictionTag: row.jurisdictionTag ? safeString(row.jurisdictionTag) : null,
      level: row.level,
      marginPct: finiteNumber(row.marginPct),
      marginVotes: finiteNumber(row.marginVotes),
      office: safeString(row.office),
      sourceId: safeString(row.sourceId),
      state: safeString(row.state),
      totalVotes: finiteNumber(row.totalVotes),
      winner: safeString(row.winner),
      year: row.year,
    },
    rowId: index + 1,
    votes: row.votes,
  }));
  const selectedFips = navigationContext.fips ? safeString(navigationContext.fips) : null;
  const selectedMode = navigationContext.mode ? safeString(navigationContext.mode) : null;
  const selectedState = safeString(navigationContext.state);
  const selectedTab = safeString(navigationContext.tab);
  const viewResults = selectedFips
    ? limitedResults.filter((entry) => entry.fips === selectedFips)
    : limitedResults;
  const viewRowIds = new Set(viewResults.map((entry) => entry.rowId));
  const votes: VoteInputRow[] = [];
  let voteRowsTruncated = false;

  for (const entry of limitedResults) {
    for (const candidate of Object.keys(entry.votes)) {
      if (votes.length >= voteLimit) {
        voteRowsTruncated = true;
        break;
      }
      votes.push({
        candidate: safeString(candidate),
        rowId: entry.rowId,
        votes: finiteNumber(entry.votes[candidate]),
      });
    }
    if (voteRowsTruncated) break;
  }

  const viewVotes = votes.filter((entry) => viewRowIds.has(entry.rowId));
  return {
    context: {
      fips: selectedFips,
      inputByteLimit: WORKSPACE_R_MAX_INPUT_BYTES,
      inputBytes: 0,
      inputTruncated: results.length > limitedResults.length || voteRowsTruncated || truncatedStringCount > 0,
      mode: selectedMode,
      resultRowCount: limitedResults.length,
      state: selectedState,
      tab: selectedTab,
      truncatedStringCount,
      viewResultRowCount: viewResults.length,
      viewVoteRowCount: viewVotes.length,
      voteRowCount: votes.length,
      year: navigationContext.year,
    },
    results: resultRowsToColumns(limitedResults),
    viewResults: resultRowsToColumns(viewResults),
    viewVotes: voteRowsToColumns(viewVotes),
    votes: voteRowsToColumns(votes),
  };
}

function setExactInputBytes(inputs: WorkspaceRCalculationInputs) {
  const encoder = new TextEncoder();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bytes = encoder.encode(JSON.stringify(inputs)).byteLength;
    if (bytes === inputs.context.inputBytes) break;
    inputs.context.inputBytes = bytes;
  }
  if (inputs.context.inputBytes > WORKSPACE_R_MAX_INPUT_BYTES) inputs.context.inputTruncated = true;
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : null;
}

function resultRowsToColumns(entries: IndexedResultRow[]): WorkspaceRDataFrameColumns {
  return {
    rowId: entries.map((entry) => entry.rowId),
    state: entries.map((entry) => entry.row.state),
    year: entries.map((entry) => entry.row.year),
    office: entries.map((entry) => entry.row.office),
    level: entries.map((entry) => entry.row.level),
    jurisdictionCode: entries.map((entry) => entry.row.jurisdictionCode),
    jurisdictionName: entries.map((entry) => entry.row.jurisdictionName),
    jurisdictionTag: entries.map((entry) => entry.row.jurisdictionTag ?? null),
    totalVotes: entries.map((entry) => entry.row.totalVotes),
    marginVotes: entries.map((entry) => entry.row.marginVotes),
    marginPct: entries.map((entry) => entry.row.marginPct),
    winner: entries.map((entry) => entry.row.winner),
    sourceId: entries.map((entry) => entry.row.sourceId),
  };
}

function voteRowsToColumns(entries: VoteInputRow[]): WorkspaceRDataFrameColumns {
  return {
    rowId: entries.map((entry) => entry.rowId),
    candidate: entries.map((entry) => entry.candidate),
    votes: entries.map((entry) => entry.votes),
  };
}

function normalizeDataFrame(rowsValue: unknown): WorkspaceRDisplayResult {
  if (!Array.isArray(rowsValue)) throw new Error("The R data-frame result is malformed.");
  const rows = rowsValue.filter(isRecord);
  const columnSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (columnSet.size >= WORKSPACE_R_MAX_OUTPUT_COLUMNS) break;
      columnSet.add(key);
    }
  }
  const sourceColumns = [...columnSet];
  const limitedRows = rows.slice(0, WORKSPACE_R_MAX_OUTPUT_ROWS);
  return {
    columns: sourceColumns.map(truncateLabel),
    kind: "table",
    rows: limitedRows.map((row) => sourceColumns.map((column) => displayScalar(row[column]))),
    truncated: rows.length > limitedRows.length
      || rows.some((row) => Object.keys(row).some((key) => !columnSet.has(key))),
  };
}

function normalizeSerializedRObject(value: unknown): WorkspaceRDisplayResult {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { kind: "scalar", value: displayScalar(value) };
  }
  if (value.type === "null") return { kind: "scalar", value: null };
  const values = Array.isArray(value.values) ? value.values : [];
  const names = Array.isArray(value.names)
    ? value.names.map((name) => typeof name === "string" ? truncateLabel(name) : "")
    : undefined;

  if (value.type === "list" || value.type === "pairlist" || value.type === "environment") {
    const labelIndex = names?.indexOf("label") ?? -1;
    const valueIndex = names?.indexOf("value") ?? -1;
    if (labelIndex >= 0 && valueIndex >= 0) {
      const detailIndex = names?.indexOf("detail") ?? -1;
      return {
        detail: detailIndex >= 0 ? String(displayScalar(values[detailIndex]) ?? "") : undefined,
        kind: "metric",
        label: String(displayScalar(values[labelIndex]) ?? "Result"),
        value: displayScalar(values[valueIndex]),
      };
    }
    const limitedValues = values.slice(0, WORKSPACE_R_MAX_OUTPUT_VALUES);
    if (names?.some(Boolean)) {
      return {
        entries: limitedValues.map((entry, index) => ({
          label: names[index] || `Value ${index + 1}`,
          value: displayScalar(entry),
        })),
        kind: "object",
        truncated: values.length > limitedValues.length,
      };
    }
    return {
      kind: "vector",
      truncated: values.length > limitedValues.length,
      values: limitedValues.map(displayScalar),
    };
  }

  const limitedValues = values.slice(0, WORKSPACE_R_MAX_OUTPUT_VALUES);
  if (limitedValues.length <= 1) {
    return { kind: "scalar", value: displayScalar(limitedValues[0] ?? null) };
  }
  return {
    kind: "vector",
    names: names?.slice(0, limitedValues.length),
    truncated: values.length > limitedValues.length,
    values: limitedValues.map(displayScalar),
  };
}

function displayScalar(value: unknown): WorkspaceRDisplayScalar {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return truncateCell(value);
  if (isRecord(value)) {
    if (value.type === "null") return null;
    const values = Array.isArray(value.values) ? value.values : [];
    if (values.length === 1) return displayScalar(values[0]);
    if (values.length > 1) {
      const rendered = values.slice(0, 12).map((entry) => String(displayScalar(entry) ?? "NA"));
      return truncateCell(`[${rendered.join(", ")}${values.length > rendered.length ? ", ..." : ""}]`);
    }
  }
  return truncateCell(String(value ?? "NA"));
}

function truncateCell(value: string) {
  return value.length > WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH
    ? `${value.slice(0, WORKSPACE_R_MAX_OUTPUT_CELL_LENGTH - 3)}...`
    : value;
}

function truncateLabel(value: string) {
  return value.length > WORKSPACE_R_MAX_OUTPUT_LABEL_LENGTH
    ? `${value.slice(0, WORKSPACE_R_MAX_OUTPUT_LABEL_LENGTH - 3)}...`
    : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
