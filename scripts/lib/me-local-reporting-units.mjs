import * as XLSX from "xlsx";

export const MAINE_COUNTIES = Object.freeze({
  AND: { fips: "001", name: "Androscoggin" },
  ARO: { fips: "003", name: "Aroostook" },
  CUM: { fips: "005", name: "Cumberland" },
  FRA: { fips: "007", name: "Franklin" },
  HAN: { fips: "009", name: "Hancock" },
  KEN: { fips: "011", name: "Kennebec" },
  KNO: { fips: "013", name: "Knox" },
  LIN: { fips: "015", name: "Lincoln" },
  OXF: { fips: "017", name: "Oxford" },
  PEN: { fips: "019", name: "Penobscot" },
  PIS: { fips: "021", name: "Piscataquis" },
  SAG: { fips: "023", name: "Sagadahoc" },
  SOM: { fips: "025", name: "Somerset" },
  WAL: { fips: "027", name: "Waldo" },
  WAS: { fips: "029", name: "Washington" },
  YOR: { fips: "031", name: "York" },
});

const COUNTY_CODE_BY_KEY = new Map(
  Object.entries(MAINE_COUNTIES).map(([code, county]) => [normalizeMaineLabel(county.name), code]),
);
COUNTY_CODE_BY_KEY.set("androgscoggin", "AND");

export const MAINE_ELECTIONS = Object.freeze({
  2012: { id: "2012-11-06-general", date: "2012-11-06" },
  2016: { id: "2016-11-08-general", date: "2016-11-08" },
  2020: { id: "2020-11-03-general", date: "2020-11-03" },
  2024: { id: "2024-11-05-general", date: "2024-11-05" },
});

function integer(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Maine result value is not numeric: ${JSON.stringify(value)}`);
  }
  return Math.trunc(parsed);
}

export function normalizeMaineLabel(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll("&", " and ")
    .replaceAll("'", "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bst[.]\s*/g, "st ")
    .replace(/\bplantation\b/g, "plt")
    .replace(/\btownships?\b/g, "twp")
    .replace(/\btwps\b/g, "twp")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateValues(year, row) {
  if (year === 2012) {
    const demVotes = integer(row[3]);
    const repVotes = integer(row[5]);
    const otherVotes = [1, 7, 9, 11, 13].reduce((sum, index) => sum + integer(row[index]), 0);
    return {
      demVotes,
      repVotes,
      otherVotes,
      totalVotes: demVotes + repVotes + otherVotes,
      ballotsCast: integer(row[17]),
    };
  }
  if (year === 2016) {
    const demVotes = integer(row[2]);
    const repVotes = integer(row[5]);
    const otherVotes = [3, 4, 6, 7, 8, 9].reduce((sum, index) => sum + integer(row[index]), 0);
    return {
      demVotes,
      repVotes,
      otherVotes,
      totalVotes: demVotes + repVotes + otherVotes,
      ballotsCast: integer(row[11]),
    };
  }
  if (year === 2020) {
    const demVotes = integer(row[2]);
    const repVotes = integer(row[6]);
    const otherVotes = [3, 4, 5, 7].reduce((sum, index) => sum + integer(row[index]), 0);
    return {
      demVotes,
      repVotes,
      otherVotes,
      totalVotes: demVotes + repVotes + otherVotes,
      ballotsCast: integer(row[9]),
    };
  }
  if (year === 2024) {
    const demVotes = integer(row[2]);
    const repVotes = integer(row[5]);
    const otherVotes = [3, 4, 6, 7].reduce((sum, index) => sum + integer(row[index]), 0);
    return {
      demVotes,
      repVotes,
      otherVotes,
      totalVotes: demVotes + repVotes + otherVotes,
      ballotsCast: integer(row[9]),
    };
  }
  throw new Error(`Unsupported Maine election year: ${year}`);
}

function classifyModernLabel(label) {
  const key = normalizeMaineLabel(label);
  if (!key) return "blank";
  if (key.includes("statewide") || key.startsWith("grand total")) return "state_total";
  if (key.includes("uocava")) return "non_geographic";
  if (key === "total" || key.endsWith(" total") || key.endsWith(" totals")) return "county_total";
  return "local";
}

function makeLocalUnit(year, countyCode, label, values, sourceRow) {
  const county = MAINE_COUNTIES[countyCode];
  if (!county) {
    throw new Error(`Unknown Maine county code ${JSON.stringify(countyCode)} at source row ${sourceRow}`);
  }
  const localKey = normalizeMaineLabel(label);
  const election = MAINE_ELECTIONS[year];
  if (!election) {
    throw new Error(`Unsupported Maine election year: ${year}`);
  }
  if (!localKey) {
    throw new Error(`Maine local result row ${sourceRow} has no label`);
  }
  return {
    id: `me-${year}-${county.fips}-${localKey.replaceAll(" ", "-")}`,
    year,
    electionId: election.id,
    electionDate: election.date,
    countyCode,
    countyFips: county.fips,
    countyName: county.name,
    label: String(label).trim(),
    localKey,
    sourceRow,
    ...values,
  };
}

function parse2012(rows) {
  const localUnits = [];
  const nonGeographic = [];
  let pending = [];
  for (let index = 6; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const label = String(row[0] ?? "").trim();
    if (!label) continue;
    const key = normalizeMaineLabel(label);
    if (key === "state uocava") {
      nonGeographic.push({ label, sourceRow: index + 1, ...candidateValues(2012, row) });
      continue;
    }
    if (key === "totals") continue;
    const countyMatch = key.match(/^(.+?) county totals?$/);
    if (countyMatch) {
      const countyCode = COUNTY_CODE_BY_KEY.get(countyMatch[1]);
      if (!countyCode) {
        throw new Error(`Unknown 2012 Maine county total label: ${label}`);
      }
      localUnits.push(...pending.map(({ label: unitLabel, row: unitRow, sourceRow }) =>
        makeLocalUnit(2012, countyCode, unitLabel, candidateValues(2012, unitRow), sourceRow)));
      pending = [];
      continue;
    }
    pending.push({ label, row, sourceRow: index + 1 });
  }
  if (pending.length) {
    throw new Error(`2012 Maine workbook ended with ${pending.length} unassigned local rows`);
  }
  return { localUnits, nonGeographic };
}

function parseModern(year, rows) {
  const localUnits = [];
  const nonGeographic = [];
  const startIndex = year === 2016 ? 2 : 3;
  let countyCode = "";
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rawCountyCode = String(row[0] ?? "").trim().toUpperCase();
    if (rawCountyCode) countyCode = rawCountyCode;
    const label = String(row[1] ?? "").trim();
    const kind = classifyModernLabel(label);
    if (kind === "blank" || kind === "county_total" || kind === "state_total") continue;
    if (kind === "non_geographic") {
      nonGeographic.push({ label, sourceRow: index + 1, ...candidateValues(year, row) });
      continue;
    }
    localUnits.push(makeLocalUnit(year, countyCode, label, candidateValues(year, row), index + 1));
  }
  return { localUnits, nonGeographic };
}

export function parseMainePresidentialWorkbook(year, bytes) {
  const workbook = XLSX.read(bytes);
  const sheetName = year === 2012
    ? "President - By Municipality"
    : year === 2016
      ? "Sheet1"
      : year === 2020
        ? "Statewide"
        : year === 2024
          ? "President & VP"
          : null;
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error(`Maine ${year} presidential workbook is missing sheet ${JSON.stringify(sheetName)}`);
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
  const parsed = year === 2012 ? parse2012(rows) : parseModern(year, rows);
  const duplicateIds = parsed.localUnits
    .map((row) => row.id)
    .filter((id, index, values) => values.indexOf(id) !== index);
  if (duplicateIds.length) {
    throw new Error(`Maine ${year} has duplicate normalized local result identities: ${[...new Set(duplicateIds)].join(", ")}`);
  }
  return {
    year,
    sheetName,
    localUnits: parsed.localUnits,
    nonGeographic: parsed.nonGeographic,
    totals: parsed.localUnits.reduce(
      (totals, row) => ({
        demVotes: totals.demVotes + row.demVotes,
        repVotes: totals.repVotes + row.repVotes,
        otherVotes: totals.otherVotes + row.otherVotes,
        totalVotes: totals.totalVotes + row.totalVotes,
        ballotsCast: totals.ballotsCast + row.ballotsCast,
      }),
      { demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0, ballotsCast: 0 },
    ),
  };
}

function decodeSimplePythonString(value) {
  return value
    .replaceAll("\\'", "'")
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\");
}

export function extractPythonStringDictionary(notebook, variableName) {
  const assignment = `${variableName} = {`;
  const cell = (notebook?.cells ?? []).find((candidate) =>
    Array.isArray(candidate?.source) && candidate.source.join("").includes(assignment));
  if (!cell) {
    throw new Error(`Validation notebook is missing ${variableName}`);
  }
  const source = cell.source.join("");
  const lines = source.slice(source.indexOf(assignment) + assignment.length).split(/\r?\n/);
  const entries = {};
  let closed = false;
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line === "}" || line === "};") {
      closed = true;
      break;
    }
    if (line.endsWith("}")) {
      line = line.slice(0, -1).trim();
      closed = true;
    }
    line = line.replace(/,\s*$/, "");
    const match = line.match(/^(['"])((?:[^\\]|\\.)*?)\1\s*:\s*(['"])((?:[^\\]|\\.)*?)\3$/);
    if (!match) {
      throw new Error(`Cannot parse ${variableName} entry: ${rawLine}`);
    }
    entries[decodeSimplePythonString(match[2])] = decodeSimplePythonString(match[4]);
    if (closed) break;
  }
  if (!closed) {
    throw new Error(`Validation notebook dictionary ${variableName} is not closed`);
  }
  return entries;
}
