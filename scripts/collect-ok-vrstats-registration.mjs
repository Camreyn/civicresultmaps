import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PDFParse } from "pdf-parse";

const defaults = {
  sourceUrl:
    "https://oklahoma.gov/content/dam/ok/en/elections/voter-registration-statistics/2024-vr-statistics/vrstats-district-nov1-2024.pdf",
  sourcePage: "https://oklahoma.gov/elections/voter-registration/voter-registration-statistics.html",
  pdfOut: "data/ok-2024-vrstats-district-nov1-2024.pdf",
  csvOut: "data/ok-2024-vrstats-county-denominator-lead.csv",
  summaryOut: "data/ok-2024-vrstats-denominator-summary.json",
  eacTurnoutCsv: "data/eac-2024-state-turnout/ok-2024-eac-turnout.csv",
  sourceDate: "2024-11-01",
  expectedRows: 77,
  force: false,
};

function usage() {
  console.log(
    [
      "Usage: node scripts/collect-ok-vrstats-registration.mjs [options]",
      "",
      "Download and normalize Oklahoma's official Nov. 1, 2024 voter-registration PDF.",
      "The output is a denominator lead only; it does not replace turnout rows because the source has no ballots-cast field.",
      "",
      "Options:",
      "  --source-url <url>     Source PDF URL. Default: " + defaults.sourceUrl,
      "  --source-page <url>    Source index page used as referer. Default: " + defaults.sourcePage,
      "  --pdf-out <file>      Downloaded PDF path. Default: " + defaults.pdfOut,
      "  --csv-out <file>      Normalized CSV path. Default: " + defaults.csvOut,
      "  --summary-out <file>  Generated denominator-lead summary JSON. Default: " + defaults.summaryOut,
      "  --eac-turnout-csv <file> Active EAC fallback turnout CSV to compare. Default: " + defaults.eacTurnoutCsv,
      "  --source-date <YYYY-MM-DD> Source date label. Default: " + defaults.sourceDate,
      "  --expected-rows <n>   Expected county rows. Default: " + defaults.expectedRows,
      "  --force              Re-download the PDF even when it exists.",
      "  --help               Show this help.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--source-url") options.sourceUrl = argv[++index];
    else if (arg === "--source-page") options.sourcePage = argv[++index];
    else if (arg === "--pdf-out") options.pdfOut = argv[++index];
    else if (arg === "--csv-out") options.csvOut = argv[++index];
    else if (arg === "--summary-out") options.summaryOut = argv[++index];
    else if (arg === "--eac-turnout-csv") options.eacTurnoutCsv = argv[++index];
    else if (arg === "--source-date") options.sourceDate = argv[++index];
    else if (arg === "--expected-rows") options.expectedRows = Number(argv[++index]);
    else if (arg === "--force") options.force = true;
    else throw new Error("Unknown option: " + arg);
  }
  return options;
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function numberValue(value) {
  return Number(String(value ?? "0").replace(/[,\s]/g, ""));
}

function titleCase(value) {
  const small = new Set(["of"]);
  return String(value)
    .toLowerCase()
    .split(" ")
    .map((part, index) => (index > 0 && small.has(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

const okCountyDisplayNames = new Map([
  ["LEFLORE", "LeFlore"],
  ["MCCLAIN", "McClain"],
  ["MCCURTAIN", "McCurtain"],
]);

function okCountyName(value) {
  const upper = String(value ?? "")
    .replace(/\s+COUNTY$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const special = okCountyDisplayNames.get(upper.replace(/\s+/g, ""));
  return (special ?? titleCase(upper)) + " County";
}

async function fetchPdf(options) {
  const response = await fetch(options.sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      accept: "application/pdf,text/html,*/*;q=0.8",
      referer: options.sourcePage,
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(options.sourceUrl + " returned " + response.status + "\n" + buffer.toString("utf8", 0, 500));
  }
  if (!String(response.headers.get("content-type") ?? "").toLowerCase().includes("pdf")) {
    throw new Error(options.sourceUrl + " did not return a PDF");
  }
  return buffer;
}

async function ensurePdf(options) {
  if (!options.force && fs.existsSync(options.pdfOut)) {
    return fs.readFileSync(options.pdfOut);
  }
  const buffer = await fetchPdf(options);
  ensureDir(options.pdfOut);
  fs.writeFileSync(options.pdfOut, buffer);
  return buffer;
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.replace(/\r\n/g, "\n");
  } finally {
    await parser.destroy();
  }
}

function emptyCounty(row) {
  return {
    county_code: row.code,
    county: okCountyName(row.name),
    libertarian: 0,
    republican: 0,
    democrat: 0,
    independent: 0,
    registered_voters: 0,
  };
}

function parseCongressionalDistrictRows(text, options) {
  const byCode = new Map();
  let sawStateTotals = false;
  const linePattern =
    /^(?:(?:CDCD|CD)\s+\d{2}\s+)?(\d{2})\s+([A-Z][A-Z ]*?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/;

  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
    if (line.startsWith("State Totals")) {
      sawStateTotals = true;
      break;
    }
    if (!line || line.includes("Total") || line.includes("Current Registration") || line.includes("District County")) {
      continue;
    }
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }
    const code = match[1];
    const name = match[2].trim();
    const existing = byCode.get(code) ?? emptyCounty({ code, name });
    existing.libertarian += numberValue(match[3]);
    existing.republican += numberValue(match[4]);
    existing.democrat += numberValue(match[5]);
    existing.independent += numberValue(match[6]);
    existing.registered_voters += numberValue(match[7]);
    byCode.set(code, existing);
  }

  if (!sawStateTotals) {
    throw new Error("Could not find Oklahoma VR state totals line before parser stopped");
  }

  const rows = Array.from(byCode.values()).sort((a, b) => Number(a.county_code) - Number(b.county_code));
  validateRows(rows, options);
  return rows;
}

function validateRows(rows, options) {
  if (rows.length !== options.expectedRows) {
    throw new Error("Expected " + options.expectedRows + " Oklahoma county rows but parsed " + rows.length);
  }
  const codes = new Set(rows.map((row) => row.county_code));
  if (codes.size !== rows.length) {
    throw new Error("Parsed duplicate Oklahoma county codes");
  }
  for (let code = 1; code <= options.expectedRows; code += 1) {
    const padded = String(code).padStart(2, "0");
    if (!codes.has(padded)) {
      throw new Error("Missing Oklahoma county code " + padded);
    }
  }
  const totals = summarizeRegistration(rows);
  const expected = {
    libertarian: 23288,
    republican: 1278045,
    democrat: 659061,
    independent: 481817,
    registeredVoters: 2442211,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (totals[key] !== value) {
      throw new Error("Oklahoma VR " + key + " total mismatch: " + totals[key] + " != " + value);
    }
  }
}

function parseCsvText(text) {
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }

  if (!records.length) return [];
  const header = records.shift();
  return records
    .filter((items) => items.some((value) => value.trim()))
    .map((items) => Object.fromEntries(header.map((key, index) => [key, items[index] ?? ""])));
}

function maybeReadEacTurnout(options) {
  if (!options.eacTurnoutCsv || !fs.existsSync(options.eacTurnoutCsv)) return null;
  const rows = parseCsvText(fs.readFileSync(options.eacTurnoutCsv, "utf8"));
  return {
    localCsv: options.eacTurnoutCsv,
    rowCount: rows.length,
    ballotsCast: rows.reduce((sum, row) => sum + numberValue(row.ballots_cast), 0),
    registeredVoters: rows.reduce((sum, row) => sum + numberValue(row.registered_voters), 0),
    countyRegisteredVoters: rows.map((row) => ({
      county: okCountyName(row.jurisdiction_name),
      registeredVoters: numberValue(row.registered_voters),
    })),
    sourceAuthority: "U.S. Election Assistance Commission",
    sourceUrl: "https://www.eac.gov/research-and-data/studies-and-reports",
  };
}

function summarizeRegistration(rows) {
  return rows.reduce(
    (acc, row) => ({
      libertarian: acc.libertarian + row.libertarian,
      republican: acc.republican + row.republican,
      democrat: acc.democrat + row.democrat,
      independent: acc.independent + row.independent,
      registeredVoters: acc.registeredVoters + row.registered_voters,
    }),
    { libertarian: 0, republican: 0, democrat: 0, independent: 0, registeredVoters: 0 },
  );
}

function writeCsv(rows, options) {
  const header = [
    "state",
    "election_year",
    "source_date",
    "county_code",
    "county",
    "libertarian",
    "republican",
    "democrat",
    "independent",
    "registered_voters",
    "source_url",
    "source_pdf",
    "denominator_note",
    "warning_required",
  ];
  const normalizedRows = rows.map((row) => ({
    state: "OK",
    election_year: 2024,
    source_date: options.sourceDate,
    county_code: row.county_code,
    county: row.county,
    libertarian: row.libertarian,
    republican: row.republican,
    democrat: row.democrat,
    independent: row.independent,
    registered_voters: row.registered_voters,
    source_url: options.sourceUrl,
    source_pdf: options.pdfOut,
    denominator_note:
      "Oklahoma State Election Board Nov. 1, 2024 current registration statistics by district; county rows are aggregated from congressional-district county fragments. Denominator lead only, not ballots cast or turnout.",
    warning_required: "true",
  }));
  ensureDir(options.csvOut);
  fs.writeFileSync(
    options.csvOut,
    [header.join(","), ...normalizedRows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n") + "\n",
  );
}

function writeSummary(rows, options) {
  const registrationTotals = summarizeRegistration(rows);
  const eacFallback = maybeReadEacTurnout(options);
  const eacByCounty = new Map((eacFallback?.countyRegisteredVoters ?? []).map((row) => [row.county, row.registeredVoters]));
  const countyMismatches = eacFallback
    ? rows
        .map((row) => ({
          county: row.county,
          okVrRegisteredVoters: row.registered_voters,
          eacRegisteredVoters: eacByCounty.get(row.county) ?? null,
          delta: row.registered_voters - (eacByCounty.get(row.county) ?? 0),
        }))
        .filter((row) => row.eacRegisteredVoters === null || row.delta !== 0)
    : null;
  const summary = {
    schemaVersion: 1,
    state: "OK",
    stateName: "Oklahoma",
    electionYear: 2024,
    generatedAt: new Date().toISOString(),
    sourceStatus: "denominator_lead_collected_ballots_cast_missing",
    voterRegistrationLead: {
      sourceAuthority: "Oklahoma State Election Board",
      sourceTitle: "MESA Current Registration Statistics by District 11/1/2024",
      sourceUrl: options.sourceUrl,
      sourcePage: options.sourcePage,
      localPdf: options.pdfOut,
      localCsv: options.csvOut,
      sourceDate: options.sourceDate,
      reportingGrain: "county_aggregated_from_congressional_district_county_fragments",
      rowCount: rows.length,
      ...registrationTotals,
      parserNormalizationPath: "scripts/collect-ok-vrstats-registration.mjs",
      denominatorNote:
        "The PDF provides registered-voter denominator rows only. It does not provide ballots-cast, voter-history, or voter-participation rows.",
    },
    eacFallbackTurnout: eacFallback,
    denominatorComparison: eacFallback
      ? {
          okVrRegisteredMinusEacRegisteredVoters: registrationTotals.registeredVoters - eacFallback.registeredVoters,
          eacRegisteredVotersMinusOkVrRegistered: eacFallback.registeredVoters - registrationTotals.registeredVoters,
          countyRegisteredVoterMismatchCount: countyMismatches.length,
          countyRegisteredVoterMismatches: countyMismatches,
        }
      : null,
    replacementDecision: {
      activeTurnoutReplacement: false,
      reason:
        "The Oklahoma VR statistics PDF confirms the registered-voter denominator total used by the EAC fallback, but it has no ballots-cast or voter-history field. Keep EAC fallback turnout active until an Oklahoma-native ballots-cast or voter-participation artifact is collected and reconciled.",
      requiredNextArtifact:
        "Official Oklahoma 2024 General Election ballots-cast, voter-history, or voter-participation rows at county or precinct grain with denominator timing notes.",
    },
  };
  ensureDir(options.summaryOut);
  fs.writeFileSync(options.summaryOut, JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const buffer = await ensurePdf(options);
  const text = await extractPdfText(buffer);
  const rows = parseCongressionalDistrictRows(text, options);
  writeCsv(rows, options);
  const summary = writeSummary(rows, options);
  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        registeredVoters: summary.voterRegistrationLead.registeredVoters,
        eacRegisteredVoters: summary.eacFallbackTurnout?.registeredVoters ?? null,
        activeTurnoutReplacement: summary.replacementDecision.activeTurnoutReplacement,
      },
      null,
      2,
    ),
  );
  console.log("Wrote Oklahoma voter-registration denominator lead to " + options.csvOut);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
