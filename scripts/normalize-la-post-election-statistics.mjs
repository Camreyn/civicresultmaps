import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = {
  statewide: {
    url: "https://electionstatistics.sos.la.gov/data/Post_Election_Statistics/statewide/2024_1105_sta.xls",
    localFile: "data/la-2024-post-election-statistics-statewide.xls",
  },
  parish: {
    url: "https://electionstatistics.sos.la.gov/data/Post_Election_Statistics/parish/2024_1105_par.xls",
    localFile: "data/la-2024-post-election-statistics-parish.xls",
  },
};

const OUTPUT_CSV = "data/la-2024-post-election-statistics-turnout.csv";
const OUTPUT_SUMMARY = "data/la-2024-post-election-statistics-reconciliation-summary.json";
const EAC_CSV = "data/eac-2024-state-turnout/la-2024-eac-turnout.csv";

const FIPS_BY_PARISH = new Map([
  ["ACADIA", "22001"],
  ["ALLEN", "22003"],
  ["ASCENSION", "22005"],
  ["ASSUMPTION", "22007"],
  ["AVOYELLES", "22009"],
  ["BEAUREGARD", "22011"],
  ["BIENVILLE", "22013"],
  ["BOSSIER", "22015"],
  ["CADDO", "22017"],
  ["CALCASIEU", "22019"],
  ["CALDWELL", "22021"],
  ["CAMERON", "22023"],
  ["CATAHOULA", "22025"],
  ["CLAIBORNE", "22027"],
  ["CONCORDIA", "22029"],
  ["DE SOTO", "22031"],
  ["EAST BATON ROUGE", "22033"],
  ["EAST CARROLL", "22035"],
  ["EAST FELICIANA", "22037"],
  ["EVANGELINE", "22039"],
  ["FRANKLIN", "22041"],
  ["GRANT", "22043"],
  ["IBERIA", "22045"],
  ["IBERVILLE", "22047"],
  ["JACKSON", "22049"],
  ["JEFFERSON", "22051"],
  ["JEFFERSON DAVIS", "22053"],
  ["LAFAYETTE", "22055"],
  ["LAFOURCHE", "22057"],
  ["LA SALLE", "22059"],
  ["LASALLE", "22059"],
  ["LINCOLN", "22061"],
  ["LIVINGSTON", "22063"],
  ["MADISON", "22065"],
  ["MOREHOUSE", "22067"],
  ["NATCHITOCHES", "22069"],
  ["ORLEANS", "22071"],
  ["OUACHITA", "22073"],
  ["PLAQUEMINES", "22075"],
  ["POINTE COUPEE", "22077"],
  ["RAPIDES", "22079"],
  ["RED RIVER", "22081"],
  ["RICHLAND", "22083"],
  ["SABINE", "22085"],
  ["ST. BERNARD", "22087"],
  ["ST. CHARLES", "22089"],
  ["ST. HELENA", "22091"],
  ["ST. JAMES", "22093"],
  ["ST. JOHN THE BAPTIST", "22095"],
  ["ST. LANDRY", "22097"],
  ["ST. MARTIN", "22099"],
  ["ST. MARY", "22101"],
  ["ST. TAMMANY", "22103"],
  ["TANGIPAHOA", "22105"],
  ["TENSAS", "22107"],
  ["TERREBONNE", "22109"],
  ["UNION", "22111"],
  ["VERMILION", "22113"],
  ["VERNON", "22115"],
  ["WASHINGTON", "22117"],
  ["WEBSTER", "22119"],
  ["WEST BATON ROUGE", "22121"],
  ["WEST CARROLL", "22123"],
  ["WEST FELICIANA", "22125"],
  ["WINN", "22127"],
]);

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function download(url, target) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(target), { recursive: true });
    get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`GET ${url} returned ${response.statusCode}`));
        response.resume();
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        writeFileSync(target, Buffer.concat(chunks));
        resolve();
      });
    }).on("error", reject);
  });
}

function parseIntCell(value) {
  const cleaned = String(value ?? "").replace(/[^\d-]/g, "");
  return cleaned ? Number.parseInt(cleaned, 10) : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body
    .filter((entry) => entry.some(Boolean))
    .map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index] ?? ""])));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function extractParishRows() {
  const workbook = XLSX.readFile(absolute(SOURCES.parish.localFile), { cellDates: false });
  return workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    const parish = String(rows[9]?.[1] ?? "").trim();
    const registeredVoters = parseIntCell(rows[10]?.[3]);
    const ballotsCast = parseIntCell(rows[11]?.[3]);
    const fips = FIPS_BY_PARISH.get(parish);
    if (!parish || !fips || !registeredVoters || !ballotsCast) {
      throw new Error(`Could not parse parish totals from ${sheetName}`);
    }
    const jurisdictionName = `${parish} PARISH`;
    return {
      state: "LA",
      election_year: 2024,
      jurisdiction_code: `${fips}00000`,
      jurisdiction_name: jurisdictionName,
      county: jurisdictionName,
      local_unit: jurisdictionName,
      level: "parish",
      ballots_cast: ballotsCast,
      registered_voters: registeredVoters,
      turnout_pct: ((ballotsCast / registeredVoters) * 100).toFixed(4),
      denominator_type: "qualifiedVoters",
      denominator_timing: "closeOfRegistrationRecordsThirtyDaysPrior",
      denominator_note:
        "Louisiana SOS post-election statistics qualified voters as of the close of registration records thirty days before the election; active and inactive status rows are included.",
      warning_required: "false",
      source_url: SOURCES.parish.url,
      source_title: "Louisiana Secretary of State parish post-election statistics workbook",
      source_status: "loaded",
      notes:
        "Voted is election-level turnout from the SOS post-election statistics workbook, not presidential contest votes.",
    };
  }).sort((a, b) => a.jurisdiction_name.localeCompare(b.jurisdiction_name));
}

function extractStatewideTotals() {
  const workbook = XLSX.readFile(absolute(SOURCES.statewide.localFile), { cellDates: false });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    raw: false,
    defval: "",
  });
  return {
    registeredVoters: parseIntCell(rows[10]?.[3]),
    ballotsCast: parseIntCell(rows[11]?.[3]),
  };
}

function readEacRows() {
  return parseCsv(readFileSync(absolute(EAC_CSV), "utf8")).map((row) => ({
    jurisdictionName: row.jurisdiction_name,
    ballotsCast: parseIntCell(row.ballots_cast),
    registeredVoters: parseIntCell(row.registered_voters),
  }));
}

async function main() {
  if (process.argv.includes("--download")) {
    for (const source of Object.values(SOURCES)) {
      await download(source.url, absolute(source.localFile));
    }
  }

  for (const source of Object.values(SOURCES)) {
    if (!existsSync(absolute(source.localFile))) {
      throw new Error(`Missing ${source.localFile}; rerun with --download to collect it.`);
    }
  }

  const rows = extractParishRows();
  const statewide = extractStatewideTotals();
  const eacRows = readEacRows();
  const eacByName = new Map(eacRows.map((row) => [row.jurisdictionName, row]));
  const reconciliationRows = rows
    .map((row) => {
      const eac = eacByName.get(row.jurisdiction_name);
      return {
        jurisdictionName: row.jurisdiction_name,
        sosBallotsCast: row.ballots_cast,
        eacBallotsCast: eac?.ballotsCast ?? 0,
        ballotsCastDeltaSosMinusEac: row.ballots_cast - (eac?.ballotsCast ?? 0),
        sosRegisteredVoters: row.registered_voters,
        eacRegisteredVoters: eac?.registeredVoters ?? 0,
        registeredVotersDeltaSosMinusEac: row.registered_voters - (eac?.registeredVoters ?? 0),
      };
    })
    .filter((row) => row.ballotsCastDeltaSosMinusEac || row.registeredVotersDeltaSosMinusEac);

  const totals = rows.reduce(
    (acc, row) => ({
      registeredVoters: acc.registeredVoters + row.registered_voters,
      ballotsCast: acc.ballotsCast + row.ballots_cast,
    }),
    { registeredVoters: 0, ballotsCast: 0 },
  );
  const eacTotals = eacRows.reduce(
    (acc, row) => ({
      registeredVoters: acc.registeredVoters + row.registeredVoters,
      ballotsCast: acc.ballotsCast + row.ballotsCast,
    }),
    { registeredVoters: 0, ballotsCast: 0 },
  );

  if (rows.length !== 64) {
    throw new Error(`Expected 64 parish rows, got ${rows.length}`);
  }
  if (totals.registeredVoters !== statewide.registeredVoters || totals.ballotsCast !== statewide.ballotsCast) {
    throw new Error(`Parish totals do not match statewide workbook totals: ${JSON.stringify({ totals, statewide })}`);
  }

  const headers = Object.keys(rows[0]);
  writeFileSync(
    absolute(OUTPUT_CSV),
    `${headers.join(",")}\n${rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")).join("\n")}\n`,
  );

  const summary = {
    checkedAt: "2026-07-05",
    state: "LA",
    source: {
      authority: "Louisiana Secretary of State",
      pageUrl: "https://voterportal.sos.la.gov/graphical",
      statewideWorkbookUrl: SOURCES.statewide.url,
      parishWorkbookUrl: SOURCES.parish.url,
      statewideWorkbookLocalFile: SOURCES.statewide.localFile,
      parishWorkbookLocalFile: SOURCES.parish.localFile,
      normalizedTurnoutLocalFile: OUTPUT_CSV,
      statewideWorkbookSha256: sha256(absolute(SOURCES.statewide.localFile)),
      parishWorkbookSha256: sha256(absolute(SOURCES.parish.localFile)),
    },
    sosTotals: {
      rowCount: rows.length,
      ...totals,
    },
    statewideWorkbookTotals: statewide,
    eacFallbackTotals: {
      rowCount: eacRows.length,
      ...eacTotals,
    },
    deltas: {
      ballotsCastSosMinusEac: totals.ballotsCast - eacTotals.ballotsCast,
      registeredVotersSosMinusEac: totals.registeredVoters - eacTotals.registeredVoters,
      rowsWithBallotDelta: reconciliationRows.filter((row) => row.ballotsCastDeltaSosMinusEac).length,
      rowsWithRegisteredVoterDelta: reconciliationRows.filter((row) => row.registeredVotersDeltaSosMinusEac).length,
    },
    reconciliationRows,
    activeTurnoutDecision:
      "Use the Louisiana Secretary of State parish post-election statistics workbook as the active 2024 turnout source. The SOS parish rows reconcile exactly to the SOS statewide statistics workbook; EAC remains a retained official benchmark with a 424-voter turnout delta and one registered-voter denominator delta.",
    caveats: [
      "The SOS graphical page describes these as qualified voter statistics and says qualified voters are registrants deemed eligible as of the close of registration records thirty days before the election.",
      "The Voted field is election-level turnout from post-election statistics, not presidential contest votes.",
      "The statistics page notes the qualified-voter count may not equal votes because voters may not cast ballots on every race for which they are eligible.",
    ],
  };
  writeFileSync(absolute(OUTPUT_SUMMARY), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(JSON.stringify({ wrote: [OUTPUT_CSV, OUTPUT_SUMMARY], totals, eacTotals }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
