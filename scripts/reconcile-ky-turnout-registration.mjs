import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

async function loadPdfParse() {
  try {
    return (await import("pdf-parse")).PDFParse;
  } catch (error) {
    if (!process.env.NODE_PATH) {
      throw error;
    }
    return require(resolve(process.env.NODE_PATH, "pdf-parse")).PDFParse;
  }
}

const PDFParse = await loadPdfParse();

const TURNOUT_SOURCE_URL = "https://elect.ky.gov/Resources/Documents/2024G%20Voter%20Turnout%20by%20County.pdf";
const REGISTRATION_SOURCE_URL =
  "https://elect.ky.gov/Resources/Documents/voterstatscounty-November%20General%202024.pdf";
const TURNOUT_PAGE_URL = "https://elect.ky.gov/Resources/Pages/Turnout.aspx";
const REGISTRATION_PAGE_URL = "https://elect.ky.gov/Resources/Pages/Registration-Statistics.aspx";
const EAC_SOURCE_URL = "https://www.eac.gov/research-and-data/studies-and-reports";

const turnoutPdfPath = resolve(repoRoot, "data/ky-2024-general-turnout-by-county.pdf");
const registrationPdfPath = resolve(repoRoot, "data/ky-2024-general-registration-by-county.pdf");
const eacTurnoutPath = resolve(repoRoot, "data/eac-2024-state-turnout/ky-2024-eac-turnout.csv");
const outputCsvPath = resolve(
  repoRoot,
  process.argv[2] ?? "data/ky-2024-turnout-registration-reconciliation.csv",
);
const outputSummaryPath = resolve(
  repoRoot,
  process.argv[3] ?? "data/ky-2024-turnout-registration-reconciliation-summary.json",
);

function numberFromText(value) {
  return Number(String(value ?? "").replaceAll(",", ""));
}

function countyKey(value) {
  return String(value ?? "")
    .replace(/\s+County$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const COUNTY_NAME_OVERRIDES = new Map([
  ["LARUE", "LaRue County"],
  ["MCCRACKEN", "McCracken County"],
  ["MCCREARY", "McCreary County"],
  ["MCLEAN", "McLean County"],
]);

function countyDisplayName(value) {
  const key = countyKey(value);
  const override = COUNTY_NAME_OVERRIDES.get(key);
  if (override) {
    return override;
  }
  return `${key
    .split(" ")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ")} County`;
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  values.push(current);
  return values;
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const header = parseCsvLine(headerLine);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
    });
}

async function extractText(pdfPath) {
  const parser = new PDFParse({ data: await readFile(pdfPath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function parseCountyTurnoutRows(text) {
  const rows = new Map();
  const pattern =
    /^(\d{3})\s+([A-Z]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const county = match[2];
    rows.set(countyKey(county), {
      countyCode: match[1],
      countyName: countyDisplayName(county),
      registeredVoters: numberFromText(match[3]),
      numberVoting: numberFromText(match[4]),
      turnoutPct: Number(match[5]),
      demRegistered: numberFromText(match[6]),
      demVoting: numberFromText(match[7]),
      demTurnoutPct: Number(match[8]),
      repRegistered: numberFromText(match[9]),
      repVoting: numberFromText(match[10]),
      repTurnoutPct: Number(match[11]),
      otherRegistered: numberFromText(match[12]),
      otherVoting: numberFromText(match[13]),
      otherTurnoutPct: Number(match[14]),
    });
  }

  return rows;
}

function parseCountyRegistrationRows(text) {
  const rows = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const tokens = line.split(" ");
    if (!/^\d{3}$/.test(tokens[0] ?? "") || !/^[A-Z]+$/.test(tokens[1] ?? "")) {
      continue;
    }
    const values = tokens.slice(2).map(numberFromText);
    if (values.length !== 13 || values.some((value) => !Number.isFinite(value))) {
      continue;
    }

    rows.set(countyKey(tokens[1]), {
      countyCode: tokens[0],
      countyName: countyDisplayName(tokens[1]),
      precinctCount: values[0],
      demRegistered: values[1],
      repRegistered: values[2],
      otherRegistered: values[3],
      indRegistered: values[4],
      libertarianRegistered: values[5],
      greenRegistered: values[6],
      constitutionRegistered: values[7],
      reformRegistered: values[8],
      socialistWorkersRegistered: values[9],
      maleRegistered: values[10],
      femaleRegistered: values[11],
      registeredVoters: values[12],
    });
  }

  return rows;
}

function assertParsedTotals(turnoutRows, registrationRows) {
  const turnoutTotals = [...turnoutRows.values()].reduce(
    (acc, row) => ({
      rows: acc.rows + 1,
      registeredVoters: acc.registeredVoters + row.registeredVoters,
      numberVoting: acc.numberVoting + row.numberVoting,
    }),
    { rows: 0, registeredVoters: 0, numberVoting: 0 },
  );
  const registrationTotals = [...registrationRows.values()].reduce(
    (acc, row) => ({
      rows: acc.rows + 1,
      precinctCount: acc.precinctCount + row.precinctCount,
      registeredVoters: acc.registeredVoters + row.registeredVoters,
    }),
    { rows: 0, precinctCount: 0, registeredVoters: 0 },
  );

  const expected = {
    turnoutRows: 120,
    turnoutRegisteredVoters: 3548136,
    turnoutNumberVoting: 2086320,
    registrationRows: 120,
    registrationRegisteredVoters: 3548136,
  };
  const mismatches = [
    ["turnoutRows", turnoutTotals.rows],
    ["turnoutRegisteredVoters", turnoutTotals.registeredVoters],
    ["turnoutNumberVoting", turnoutTotals.numberVoting],
    ["registrationRows", registrationTotals.rows],
    ["registrationRegisteredVoters", registrationTotals.registeredVoters],
  ].filter(([key, actual]) => actual !== expected[key]);

  if (mismatches.length) {
    throw new Error(`Kentucky turnout/registration parse totals mismatch: ${JSON.stringify({ turnoutTotals, registrationTotals, expected })}`);
  }

  return { turnoutTotals, registrationTotals };
}

async function main() {
  const turnoutRows = parseCountyTurnoutRows(await extractText(turnoutPdfPath));
  const registrationRows = parseCountyRegistrationRows(await extractText(registrationPdfPath));
  const { turnoutTotals, registrationTotals } = assertParsedTotals(turnoutRows, registrationRows);
  const eacRows = parseCsv(await readFile(eacTurnoutPath, "utf8"));
  const eacByCounty = new Map(eacRows.map((row) => [countyKey(row.jurisdiction_name), row]));

  const reconciliationRows = [...turnoutRows.entries()]
    .sort(([, left], [, right]) => left.countyCode.localeCompare(right.countyCode))
    .map(([key, turnoutRow]) => {
      const registrationRow = registrationRows.get(key);
      const eacRow = eacByCounty.get(key);
      if (!registrationRow) {
        throw new Error(`Missing Kentucky registration row for ${turnoutRow.countyName}.`);
      }
      if (!eacRow) {
        throw new Error(`Missing Kentucky EAC turnout row for ${turnoutRow.countyName}.`);
      }
      if (registrationRow.registeredVoters !== turnoutRow.registeredVoters) {
        throw new Error(`Kentucky registration/turnout denominator mismatch for ${turnoutRow.countyName}.`);
      }

      const eacBallotsCast = Number(eacRow.ballots_cast);
      const eacRegisteredVoters = Number(eacRow.registered_voters);
      return {
        state: "KY",
        election_year: 2024,
        county_code: turnoutRow.countyCode,
        jurisdiction_name: turnoutRow.countyName,
        source_level: "county",
        registration_pdf_precinct_count: registrationRow.precinctCount,
        state_board_registered_voters: turnoutRow.registeredVoters,
        state_board_number_voting: turnoutRow.numberVoting,
        state_board_turnout_pct: turnoutRow.turnoutPct.toFixed(1),
        eac_ballots_cast: eacBallotsCast,
        eac_registered_voters: eacRegisteredVoters,
        ballots_cast_delta_state_board_minus_eac: turnoutRow.numberVoting - eacBallotsCast,
        registered_voters_delta_state_board_minus_eac: turnoutRow.registeredVoters - eacRegisteredVoters,
        registration_pdf_registered_voters: registrationRow.registeredVoters,
        dem_registered: turnoutRow.demRegistered,
        dem_voting: turnoutRow.demVoting,
        rep_registered: turnoutRow.repRegistered,
        rep_voting: turnoutRow.repVoting,
        other_registered: turnoutRow.otherRegistered,
        other_voting: turnoutRow.otherVoting,
        registration_pdf_ind_registered: registrationRow.indRegistered,
        registration_pdf_libertarian_registered: registrationRow.libertarianRegistered,
        registration_pdf_green_registered: registrationRow.greenRegistered,
        registration_pdf_constitution_registered: registrationRow.constitutionRegistered,
        registration_pdf_reform_registered: registrationRow.reformRegistered,
        registration_pdf_socialist_workers_registered: registrationRow.socialistWorkersRegistered,
        turnout_pdf_source_url: TURNOUT_SOURCE_URL,
        registration_pdf_source_url: REGISTRATION_SOURCE_URL,
        eac_source_url: EAC_SOURCE_URL,
        notes:
          "Candidate State Board county turnout/registration reconciliation only; keep EAC fallback active until unofficial-turnout caveats and county-clerk documentation are reviewed.",
      };
    });

  const eacTotals = reconciliationRows.reduce(
    (acc, row) => ({
      ballotsCast: acc.ballotsCast + row.eac_ballots_cast,
      registeredVoters: acc.registeredVoters + row.eac_registered_voters,
    }),
    { ballotsCast: 0, registeredVoters: 0 },
  );
  const ballotDeltaRows = reconciliationRows.filter((row) => row.ballots_cast_delta_state_board_minus_eac !== 0);
  const registeredDeltaRows = reconciliationRows.filter((row) => row.registered_voters_delta_state_board_minus_eac !== 0);

  const header = [
    "state",
    "election_year",
    "county_code",
    "jurisdiction_name",
    "source_level",
    "registration_pdf_precinct_count",
    "state_board_registered_voters",
    "state_board_number_voting",
    "state_board_turnout_pct",
    "eac_ballots_cast",
    "eac_registered_voters",
    "ballots_cast_delta_state_board_minus_eac",
    "registered_voters_delta_state_board_minus_eac",
    "registration_pdf_registered_voters",
    "dem_registered",
    "dem_voting",
    "rep_registered",
    "rep_voting",
    "other_registered",
    "other_voting",
    "registration_pdf_ind_registered",
    "registration_pdf_libertarian_registered",
    "registration_pdf_green_registered",
    "registration_pdf_constitution_registered",
    "registration_pdf_reform_registered",
    "registration_pdf_socialist_workers_registered",
    "turnout_pdf_source_url",
    "registration_pdf_source_url",
    "eac_source_url",
    "notes",
  ];
  const csv = [
    header.join(","),
    ...reconciliationRows.map((row) => header.map((key) => csvValue(row[key])).join(",")),
  ].join("\n");

  const summary = {
    state: "KY",
    electionYear: 2024,
    generatedAt: "2026-07-01",
    turnoutSourceUrl: TURNOUT_SOURCE_URL,
    turnoutPageUrl: TURNOUT_PAGE_URL,
    registrationSourceUrl: REGISTRATION_SOURCE_URL,
    registrationPageUrl: REGISTRATION_PAGE_URL,
    eacSourceUrl: EAC_SOURCE_URL,
    rowCount: reconciliationRows.length,
    stateBoardTurnoutTotals: {
      rows: turnoutTotals.rows,
      registeredVoters: turnoutTotals.registeredVoters,
      numberVoting: turnoutTotals.numberVoting,
    },
    registrationPdfTotals: {
      rows: registrationTotals.rows,
      precinctCount: registrationTotals.precinctCount,
      registeredVoters: registrationTotals.registeredVoters,
    },
    eacTotals,
    deltas: {
      ballotsCastStateBoardMinusEac: turnoutTotals.numberVoting - eacTotals.ballotsCast,
      registeredVotersStateBoardMinusEac: turnoutTotals.registeredVoters - eacTotals.registeredVoters,
      rowsWithBallotDelta: ballotDeltaRows.length,
      rowsWithRegisteredVoterDelta: registeredDeltaRows.length,
      positiveBallotDeltaRows: ballotDeltaRows.filter((row) => row.ballots_cast_delta_state_board_minus_eac > 0).length,
      negativeBallotDeltaRows: ballotDeltaRows.filter((row) => row.ballots_cast_delta_state_board_minus_eac < 0).length,
    },
    activeTurnoutDecision:
      "Keep EAC fallback turnout active for Kentucky. The State Board page says turnout reports are unofficial and may differ from election results because they are run after voter-registration rolls reopen; county-clerk official documentation is needed before replacing the active turnout source.",
    precinctPdfStatus:
      "County-level PDFs are parsed here. Precinct turnout and registration PDFs remain collected source leads until a reporting-unit crosswalk handles precinct rows and district subtotal rows safely.",
  };

  await mkdir(dirname(outputCsvPath), { recursive: true });
  await writeFile(outputCsvPath, `${csv}\n`, "utf8");
  await writeFile(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Wrote ${reconciliationRows.length} Kentucky turnout/registration reconciliation rows to ${outputCsvPath}`);
  console.log(`Wrote Kentucky turnout/registration reconciliation summary to ${outputSummaryPath}`);
}

await main();
