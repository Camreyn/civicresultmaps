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

const CANVASS_SOURCE_URL =
  "https://sos.nebraska.gov/sites/default/files/doc/elections/2024/2024%20General%20Canvass%20Book.pdf";
const EAC_SOURCE_URL = "https://www.eac.gov/research-and-data/studies-and-reports";

const canvassPdfPath = resolve(repoRoot, "data/ne-2024-general-canvass-book.pdf");
const eacTurnoutPath = resolve(repoRoot, "data/eac-2024-state-turnout/ne-2024-eac-turnout.csv");
const outputCsvPath = resolve(
  repoRoot,
  process.argv[2] ?? "data/ne-2024-canvass-voting-statistics-reconciliation.csv",
);
const outputSummaryPath = resolve(
  repoRoot,
  process.argv[3] ?? "data/ne-2024-canvass-voting-statistics-reconciliation-summary.json",
);

function numberFromText(value) {
  return Number(String(value).replaceAll(",", ""));
}

function normalizeCountyName(value) {
  return String(value)
    .trim()
    .replace(/\s+County$/i, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
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

function parseRegistrationRows(text) {
  const rows = new Map();
  let statewide = null;

  for (const line of text.split(/\r?\n/)) {
    const match = line
      .trim()
      .match(
        /^(.+?)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)$/,
      );
    if (!match) {
      continue;
    }

    const jurisdictionName = match[1].trim();
    const row = {
      jurisdictionName,
      precincts: numberFromText(match[2]),
      registeredRepublican: numberFromText(match[3]),
      registeredDemocratic: numberFromText(match[4]),
      registeredLibertarian: numberFromText(match[5]),
      registeredLegalMarijuanaNow: numberFromText(match[6]),
      registeredNoLabelsNebraska: numberFromText(match[7]),
      registeredNonpartisan: numberFromText(match[8]),
      registeredVoters: numberFromText(match[9]),
    };

    if (/^Statewide Total$/i.test(jurisdictionName)) {
      statewide = row;
      continue;
    }
    rows.set(normalizeCountyName(jurisdictionName), row);
  }

  return { rows, statewide };
}

function parseVotingRows(text) {
  const rows = new Map();
  let statewide = null;

  for (const line of text.split(/\r?\n/)) {
    const match = line
      .trim()
      .match(
        /^(.+?)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+([0-9][0-9,]*)$/,
      );
    if (!match) {
      continue;
    }

    const jurisdictionName = match[1].trim();
    const row = {
      jurisdictionName,
      pollingPlaceVoting: numberFromText(match[2]),
      earlyVoting: numberFromText(match[3]),
      allMailPrecincts: numberFromText(match[4]),
      provisionalBallots: numberFromText(match[5]),
      militaryOverseas: numberFromText(match[6]),
      newFormerResident: numberFromText(match[7]),
      totalVoting: numberFromText(match[8]),
    };

    if (/^Statewide Total$/i.test(jurisdictionName)) {
      statewide = row;
      continue;
    }
    rows.set(normalizeCountyName(jurisdictionName), row);
  }

  return { rows, statewide };
}

function assertTotals(rows, statewideRegistration, statewideVoting) {
  const totals = [...rows.values()].reduce(
    (acc, row) => ({
      rows: acc.rows + 1,
      precincts: acc.precincts + row.precincts,
      registeredVoters: acc.registeredVoters + row.registeredVoters,
      totalVoting: acc.totalVoting + row.totalVoting,
      pollingPlaceVoting: acc.pollingPlaceVoting + row.pollingPlaceVoting,
      earlyVoting: acc.earlyVoting + row.earlyVoting,
      allMailPrecincts: acc.allMailPrecincts + row.allMailPrecincts,
      provisionalBallots: acc.provisionalBallots + row.provisionalBallots,
      militaryOverseas: acc.militaryOverseas + row.militaryOverseas,
      newFormerResident: acc.newFormerResident + row.newFormerResident,
    }),
    {
      rows: 0,
      precincts: 0,
      registeredVoters: 0,
      totalVoting: 0,
      pollingPlaceVoting: 0,
      earlyVoting: 0,
      allMailPrecincts: 0,
      provisionalBallots: 0,
      militaryOverseas: 0,
      newFormerResident: 0,
    },
  );

  const expected = {
    rows: 93,
    precincts: statewideRegistration.precincts,
    registeredVoters: statewideRegistration.registeredVoters,
    totalVoting: statewideVoting.totalVoting,
    pollingPlaceVoting: statewideVoting.pollingPlaceVoting,
    earlyVoting: statewideVoting.earlyVoting,
    allMailPrecincts: statewideVoting.allMailPrecincts,
    provisionalBallots: statewideVoting.provisionalBallots,
    militaryOverseas: statewideVoting.militaryOverseas,
    newFormerResident: statewideVoting.newFormerResident,
  };
  const mismatches = Object.entries(expected).filter(([key, expectedValue]) => totals[key] !== expectedValue);
  if (mismatches.length) {
    throw new Error(`Nebraska canvass voting-statistics totals mismatch: ${JSON.stringify({ totals, expected })}`);
  }

  return totals;
}

async function extractCanvassRows() {
  const data = await readFile(canvassPdfPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const registrationText = [5, 6].map((pageIndex) => result.pages[pageIndex]?.text ?? "").join("\n");
    const votingText = [7, 8].map((pageIndex) => result.pages[pageIndex]?.text ?? "").join("\n");
    const registration = parseRegistrationRows(registrationText);
    const voting = parseVotingRows(votingText);

    if (!registration.statewide || !voting.statewide) {
      throw new Error("Could not parse Nebraska canvass statewide voting-statistics totals.");
    }

    const rows = new Map();
    for (const [countyKey, registrationRow] of registration.rows) {
      const votingRow = voting.rows.get(countyKey);
      if (!votingRow) {
        throw new Error(`Missing Nebraska canvass voting row for ${registrationRow.jurisdictionName}.`);
      }
      rows.set(countyKey, { ...registrationRow, ...votingRow, jurisdictionName: registrationRow.jurisdictionName });
    }

    assertTotals(rows, registration.statewide, voting.statewide);
    return { rows, statewideRegistration: registration.statewide, statewideVoting: voting.statewide };
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const { rows, statewideRegistration, statewideVoting } = await extractCanvassRows();
  const eacRows = parseCsv(await readFile(eacTurnoutPath, "utf8"));
  const eacByCounty = new Map(eacRows.map((row) => [normalizeCountyName(row.jurisdiction_name), row]));

  const reconciliationRows = [...rows.entries()]
    .sort(([, left], [, right]) => left.jurisdictionName.localeCompare(right.jurisdictionName))
    .map(([countyKey, row]) => {
      const eacRow = eacByCounty.get(countyKey);
      if (!eacRow) {
        throw new Error(`Missing EAC turnout row for ${row.jurisdictionName}.`);
      }
      const eacBallotsCast = Number(eacRow.ballots_cast);
      const eacRegisteredVoters = Number(eacRow.registered_voters);
      return {
        state: "NE",
        election_year: 2024,
        jurisdiction_name: row.jurisdictionName,
        source_level: "county",
        precincts: row.precincts,
        registered_republican: row.registeredRepublican,
        registered_democratic: row.registeredDemocratic,
        registered_libertarian: row.registeredLibertarian,
        registered_legal_marijuana_now: row.registeredLegalMarijuanaNow,
        registered_no_labels_nebraska: row.registeredNoLabelsNebraska,
        registered_nonpartisan: row.registeredNonpartisan,
        registered_voters: row.registeredVoters,
        canvass_polling_place_voting: row.pollingPlaceVoting,
        canvass_early_voting: row.earlyVoting,
        canvass_all_mail_precincts: row.allMailPrecincts,
        canvass_provisional_ballots: row.provisionalBallots,
        canvass_military_overseas: row.militaryOverseas,
        canvass_new_former_resident: row.newFormerResident,
        canvass_total_voting: row.totalVoting,
        eac_ballots_cast: eacBallotsCast,
        eac_registered_voters: eacRegisteredVoters,
        ballots_cast_delta_canvass_minus_eac: row.totalVoting - eacBallotsCast,
        registered_voters_delta_canvass_minus_eac: row.registeredVoters - eacRegisteredVoters,
        turnout_pct_canvass: ((row.totalVoting / row.registeredVoters) * 100).toFixed(4),
        turnout_pct_eac: ((eacBallotsCast / eacRegisteredVoters) * 100).toFixed(4),
        source_url: CANVASS_SOURCE_URL,
        eac_source_url: EAC_SOURCE_URL,
        notes:
          "Official canvass voting-statistics cross-check only; active NE ETL turnout rows remain EAC fallback until this source difference is reviewed.",
      };
    });

  const eacTotals = reconciliationRows.reduce(
    (acc, row) => ({
      ballotsCast: acc.ballotsCast + row.eac_ballots_cast,
      registeredVoters: acc.registeredVoters + row.eac_registered_voters,
    }),
    { ballotsCast: 0, registeredVoters: 0 },
  );
  const canvassTotals = assertTotals(rows, statewideRegistration, statewideVoting);
  const deltaRows = reconciliationRows.filter((row) => row.ballots_cast_delta_canvass_minus_eac !== 0);
  const registeredDeltaRows = reconciliationRows.filter((row) => row.registered_voters_delta_canvass_minus_eac !== 0);

  const header = [
    "state",
    "election_year",
    "jurisdiction_name",
    "source_level",
    "precincts",
    "registered_republican",
    "registered_democratic",
    "registered_libertarian",
    "registered_legal_marijuana_now",
    "registered_no_labels_nebraska",
    "registered_nonpartisan",
    "registered_voters",
    "canvass_polling_place_voting",
    "canvass_early_voting",
    "canvass_all_mail_precincts",
    "canvass_provisional_ballots",
    "canvass_military_overseas",
    "canvass_new_former_resident",
    "canvass_total_voting",
    "eac_ballots_cast",
    "eac_registered_voters",
    "ballots_cast_delta_canvass_minus_eac",
    "registered_voters_delta_canvass_minus_eac",
    "turnout_pct_canvass",
    "turnout_pct_eac",
    "source_url",
    "eac_source_url",
    "notes",
  ];
  const csv = [
    header.join(","),
    ...reconciliationRows.map((row) => header.map((key) => csvValue(row[key])).join(",")),
  ].join("\n");

  const summary = {
    state: "NE",
    electionYear: 2024,
    generatedAt: "2026-07-01",
    canvassSourceUrl: CANVASS_SOURCE_URL,
    eacSourceUrl: EAC_SOURCE_URL,
    rowCount: reconciliationRows.length,
    canvassTotals: {
      precincts: canvassTotals.precincts,
      registeredVoters: canvassTotals.registeredVoters,
      pollingPlaceVoting: canvassTotals.pollingPlaceVoting,
      earlyVoting: canvassTotals.earlyVoting,
      allMailPrecincts: canvassTotals.allMailPrecincts,
      provisionalBallots: canvassTotals.provisionalBallots,
      militaryOverseas: canvassTotals.militaryOverseas,
      newFormerResident: canvassTotals.newFormerResident,
      totalVoting: canvassTotals.totalVoting,
    },
    eacTotals,
    deltas: {
      ballotsCastCanvassMinusEac: canvassTotals.totalVoting - eacTotals.ballotsCast,
      registeredVotersCanvassMinusEac: canvassTotals.registeredVoters - eacTotals.registeredVoters,
      rowsWithBallotDelta: deltaRows.length,
      rowsWithRegisteredVoterDelta: registeredDeltaRows.length,
      positiveBallotDeltaRows: deltaRows.filter((row) => row.ballots_cast_delta_canvass_minus_eac > 0).length,
      negativeBallotDeltaRows: deltaRows.filter((row) => row.ballots_cast_delta_canvass_minus_eac < 0).length,
    },
    activeTurnoutDecision:
      "Keep EAC fallback turnout active for Nebraska until the canvass Total Voting versus EAC ballots-cast source difference is reviewed and the ETL turnout contract is intentionally switched.",
  };

  await mkdir(dirname(outputCsvPath), { recursive: true });
  await writeFile(outputCsvPath, `${csv}\n`, "utf8");
  await writeFile(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Wrote ${reconciliationRows.length} Nebraska canvass voting-statistics rows to ${outputCsvPath}`);
  console.log(`Wrote Nebraska canvass voting-statistics summary to ${outputSummaryPath}`);
}

await main();
