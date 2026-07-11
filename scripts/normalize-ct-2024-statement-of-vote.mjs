import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCE_URL =
  "https://portal.ct.gov/-/media/sots/electionservices/statementofvote_pdfs/2024_statement_of_vote.pdf?hash=27BE5012F5EF0B6BBF37B2A9242B54A2&rev=21871844f0be463886b823b12e6a442e";
const PDF_RELATIVE = "data/ct-2024-statement-of-vote.pdf";
const EMS_DIRECTORY = "data/ct-2024-ems-election-91-version-80741";
const CROSSWALK_RELATIVE = "data/ct-current-planning-region-crosswalk.csv";
const CSV_RELATIVE = "data/ct-2024-statement-of-vote-president-town.csv";
const SUMMARY_RELATIVE = "data/ct-2024-statement-of-vote-president-reconciliation.json";
const SOURCE_ID = "ct-2024-statement-of-vote-president-town";

const EXPECTED_PDF = {
  bytes: 3139465,
  pages: 170,
  sha256: "1043dc18895adcff95e227e136eb19ef1c65f2a452a4dc97105fb4738cf3751c",
};

const TICKETS = [
  { key: "harris_and_walz", label: "Harris and Walz", candidateId: "35838", expected: 992197 },
  { key: "trump_and_vance", label: "Trump and Vance", candidateId: "35839", expected: 737024 },
  { key: "stein_and_ware", label: "Stein and Ware", candidateId: "35853", expected: 14286 },
  { key: "oliver_and_ter_maat", label: "Oliver and ter Maat", candidateId: "35848", expected: 6731 },
  {
    key: "kennedy_jr_and_shanahan",
    label: "Kennedy, Jr. and Shanahan",
    candidateId: "35858",
    expected: 8452,
  },
  { key: "ayyadurai_and_ellis", label: "Ayyadurai and Ellis", candidateId: "36135", expected: 21 },
  { key: "de_la_cruz_and_garcia", label: "De la Cruz and Garcia", candidateId: "36136", expected: 267 },
  { key: "fox_and_mcvay", label: "Fox and McVay", candidateId: "36137", expected: 4 },
  { key: "mcneil_and_mcneil", label: "McNeil and McNeil", candidateId: "36138", expected: 0 },
  { key: "potus_and_kennedy", label: "Potus and Kennedy", candidateId: "36139", expected: 2 },
  { key: "sonski_and_onak", label: "Sonski and Onak", candidateId: "36140", expected: 162 },
  { key: "west_and_abdullah", label: "West and Abdullah", candidateId: "36141", expected: 129 },
];

const GROUPS = [
  {
    pages: [11, 12, 13, 14, 15, 16, 17, 18],
    pageField: "ballot_page",
    ticketKeys: [
      "harris_and_walz",
      "trump_and_vance",
      "stein_and_ware",
      "oliver_and_ter_maat",
      "kennedy_jr_and_shanahan",
    ],
  },
  {
    pages: [19, 20, 21, 22, 23, 24, 25, 26],
    pageField: "write_in_page_1",
    ticketKeys: [
      "ayyadurai_and_ellis",
      "de_la_cruz_and_garcia",
      "fox_and_mcvay",
      "mcneil_and_mcneil",
      "potus_and_kennedy",
    ],
  },
  {
    pages: [27, 28, 29, 30, 31, 32, 33, 34],
    pageField: "write_in_page_2",
    ticketKeys: ["sonski_and_onak", "west_and_abdullah"],
  },
];

const ticketByKey = new Map(TICKETS.map((ticket) => [ticket.key, ticket]));
const ticketKeys = TICKETS.map((ticket) => ticket.key);
const otherTicketKeys = ticketKeys.filter(
  (key) => key !== "harris_and_walz" && key !== "trump_and_vance",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function integer(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(text)) {
    throw new Error(`${label} is not a non-negative integer: ${JSON.stringify(value)}`);
  }
  return Number.parseInt(text.replaceAll(",", ""), 10);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(header, records) {
  const rows = [header, ...records.map((record) => header.map((field) => record[field] ?? ""))];
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvRecords(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header?.length) throw new Error("CSV has no header");
  return rows.map((row, rowIndex) => {
    if (row.length !== header.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${row.length} cells; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((field, index) => [field, row[index]]));
  });
}

function contestCandidateTotal(rows, candidateId) {
  return rows.reduce(
    (sum, candidateRow) =>
      sum + integer(candidateRow?.[candidateId]?.V ?? "0", `EMS candidate ${candidateId} vote`),
    0,
  );
}

function totalsForRows(rows, keys = ticketKeys) {
  return Object.fromEntries(
    keys.map((key) => [key, rows.reduce((sum, row) => sum + Number(row[key]), 0)]),
  );
}

function assertObjectEqual(label, actual, expected) {
  const mismatches = Object.entries(expected).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length) {
    throw new Error(`${label} mismatch: ${JSON.stringify({ expected, actual })}`);
  }
}

const pdfPath = path.join(repoRoot, PDF_RELATIVE);
const pdfBytes = await readFile(pdfPath);
const actualPdf = { bytes: pdfBytes.length, sha256: sha256(pdfBytes) };
assertObjectEqual("Connecticut 2024 Statement of Vote PDF", actualPdf, {
  bytes: EXPECTED_PDF.bytes,
  sha256: EXPECTED_PDF.sha256,
});

const [lookupText, townVotesText, stateVotesText, crosswalkText] = await Promise.all([
  readFile(path.join(repoRoot, EMS_DIRECTORY, "Lookupdata.json"), "utf8"),
  readFile(path.join(repoRoot, EMS_DIRECTORY, "townVotes_Electiondata.json"), "utf8"),
  readFile(path.join(repoRoot, EMS_DIRECTORY, "stateVotes_Electiondata.json"), "utf8"),
  readFile(path.join(repoRoot, CROSSWALK_RELATIVE), "utf8"),
]);
const lookup = JSON.parse(lookupText);
const townVotes = JSON.parse(townVotesText);
const stateVotes = JSON.parse(stateVotesText);

const towns = Object.entries(lookup.townIds ?? {})
  .sort(([left], [right]) => Number(left) - Number(right))
  .map(([townId, townName]) => ({ townId, townName: String(townName).trim() }));
if (towns.length !== 169 || new Set(towns.map((town) => town.townName)).size !== 169) {
  throw new Error(`Expected 169 unique Connecticut EMS towns, got ${towns.length}`);
}
const townByName = new Map(towns.map((town) => [town.townName, town]));

const crosswalkRows = csvRecords(crosswalkText);
const crosswalkByTownId = new Map();
for (const [index, row] of crosswalkRows.entries()) {
  const townId = String(row.ems_town_id ?? "").trim();
  if (!townId || crosswalkByTownId.has(townId)) {
    throw new Error(`Crosswalk row ${index + 2} has a missing or duplicate EMS town ID`);
  }
  if (
    row.jurisdiction_tag !== `county:${row.planning_region_geoid}` ||
    !/^09(?:110|120|130|140|150|160|170|180|190)$/.test(row.planning_region_geoid)
  ) {
    throw new Error(`Crosswalk row ${index + 2} has invalid planning-region metadata`);
  }
  crosswalkByTownId.set(townId, row);
}
if (crosswalkByTownId.size !== 169) {
  throw new Error(`Expected 169 Connecticut crosswalk rows, got ${crosswalkByTownId.size}`);
}
for (const town of towns) {
  const crosswalk = crosswalkByTownId.get(town.townId);
  if (!crosswalk || crosswalk.ems_town_name !== town.townName) {
    throw new Error(`EMS/crosswalk town mismatch for ${town.townId} ${town.townName}`);
  }
}

for (const ticket of TICKETS) {
  const actualName = String(lookup.candidateIds?.[ticket.candidateId]?.NM ?? "").trim();
  if (actualName !== ticket.label) {
    throw new Error(
      `EMS candidate ${ticket.candidateId} mismatch: expected ${ticket.label}, got ${actualName}`,
    );
  }
}

const selectedPages = GROUPS.flatMap((group) => group.pages);
const parser = new PDFParse({ data: pdfBytes });
let textResult;
try {
  textResult = await parser.getText({ partial: selectedPages });
} finally {
  await parser.destroy();
}
if (textResult.total !== EXPECTED_PDF.pages) {
  throw new Error(`Expected ${EXPECTED_PDF.pages} PDF pages, got ${textResult.total}`);
}
const pageByNumber = new Map(textResult.pages.map((page) => [page.num, page]));

const extractedByTownId = new Map(
  towns.map((town) => {
    const crosswalk = crosswalkByTownId.get(town.townId);
    return [
      town.townId,
      {
        town_id: town.townId,
        town_name: town.townName,
        planning_region_geoid: crosswalk.planning_region_geoid,
        planning_region_name: crosswalk.planning_region_name,
        jurisdiction_tag: crosswalk.jurisdiction_tag,
      },
    ];
  }),
);

const reportedTotals = {};
for (const group of GROUPS) {
  const labels = group.ticketKeys.map((key) => ticketByKey.get(key).label);
  const groupRows = [];
  for (const pageNumber of group.pages) {
    const page = pageByNumber.get(pageNumber);
    if (!page) throw new Error(`PDF extraction omitted required page ${pageNumber}`);
    if (!page.text.includes(labels.join(" \t"))) {
      throw new Error(`PDF page ${pageNumber} does not contain expected ticket header`);
    }
    let pageTownRows = 0;
    for (const rawLine of page.text.split(/\r?\n/)) {
      const cells = rawLine.split(/\s*\t\s*/).map((value) => value.trim());
      if (cells[0] === "Total") {
        if (pageNumber !== group.pages.at(-1) || cells.length !== labels.length + 1) {
          throw new Error(`Unexpected Total row on PDF page ${pageNumber}: ${rawLine}`);
        }
        for (const [index, key] of group.ticketKeys.entries()) {
          reportedTotals[key] = integer(cells[index + 1], `PDF page ${pageNumber} ${key} total`);
        }
        continue;
      }
      const town = townByName.get(cells[0]);
      if (!town) continue;
      if (cells.length !== labels.length + 1) {
        throw new Error(`Malformed town row on PDF page ${pageNumber}: ${rawLine}`);
      }
      const values = {};
      for (const [index, key] of group.ticketKeys.entries()) {
        values[key] = integer(cells[index + 1], `PDF page ${pageNumber} ${town.townName} ${key}`);
      }
      groupRows.push(town.townName);
      pageTownRows += 1;
      Object.assign(extractedByTownId.get(town.townId), values, { [group.pageField]: pageNumber });
    }
    if (!pageTownRows) throw new Error(`PDF page ${pageNumber} contained no recognized town rows`);
  }
  const expectedTownOrder = towns
    .map((town) => town.townName)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  if (JSON.stringify(groupRows) !== JSON.stringify(expectedTownOrder)) {
    throw new Error(`PDF pages ${group.pages[0]}-${group.pages.at(-1)} do not contain all towns in EMS order`);
  }
}

const expectedTicketTotals = Object.fromEntries(TICKETS.map((ticket) => [ticket.key, ticket.expected]));
assertObjectEqual("SOV printed ticket totals", reportedTotals, expectedTicketTotals);

const outputRows = towns.map((town) => {
  const row = extractedByTownId.get(town.townId);
  for (const field of [...ticketKeys, "ballot_page", "write_in_page_1", "write_in_page_2"]) {
    if (!Number.isInteger(row[field]) || row[field] < 0) {
      throw new Error(`Extracted SOV row ${town.townName} is missing ${field}`);
    }
  }
  row.other_votes = otherTicketKeys.reduce((sum, key) => sum + row[key], 0);
  row.total_votes = row.harris_and_walz + row.trump_and_vance + row.other_votes;
  row.source_id = SOURCE_ID;
  row.source_url = SOURCE_URL;
  return row;
});
const extractedTotals = totalsForRows(outputRows);
assertObjectEqual("SOV extracted ticket totals", extractedTotals, expectedTicketTotals);
const sovBucketTotals = {
  harris: extractedTotals.harris_and_walz,
  trump: extractedTotals.trump_and_vance,
  other: otherTicketKeys.reduce((sum, key) => sum + extractedTotals[key], 0),
};
sovBucketTotals.total = sovBucketTotals.harris + sovBucketTotals.trump + sovBucketTotals.other;
assertObjectEqual("SOV extracted bucket totals", sovBucketTotals, {
  harris: 992197,
  trump: 737024,
  other: 30054,
  total: 1759275,
});

const emsByTownId = new Map();
for (const town of towns) {
  const contestRows = townVotes?.[town.townId]?.["16518"];
  if (!Array.isArray(contestRows) || contestRows.length !== TICKETS.length) {
    throw new Error(`EMS town ${town.townName} does not have exactly ${TICKETS.length} President rows`);
  }
  emsByTownId.set(
    town.townId,
    Object.fromEntries(
      TICKETS.map((ticket) => [
        ticket.key,
        contestCandidateTotal(contestRows, ticket.candidateId),
      ]),
    ),
  );
}
const emsRows = towns.map((town) => emsByTownId.get(town.townId));
const emsTotals = totalsForRows(emsRows);
const emsStateRows = stateVotes?.["16518"];
const emsStateTotals = Object.fromEntries(
  TICKETS.map((ticket) => [ticket.key, contestCandidateTotal(emsStateRows, ticket.candidateId)]),
);
assertObjectEqual("EMS town/state ticket reconciliation", emsTotals, emsStateTotals);

const ticketReconciliation = TICKETS.map((ticket) => ({
  candidateId: ticket.candidateId,
  ticket: ticket.label,
  outputColumn: ticket.key,
  sovVotes: extractedTotals[ticket.key],
  emsVotes: emsTotals[ticket.key],
  difference: extractedTotals[ticket.key] - emsTotals[ticket.key],
}));

const changedTownRows = [];
for (const row of outputRows) {
  const ems = emsByTownId.get(row.town_id);
  const difference = Object.fromEntries(ticketKeys.map((key) => [key, row[key] - ems[key]]));
  const changedTickets = ticketKeys.filter((key) => difference[key] !== 0);
  if (!changedTickets.length) continue;
  changedTownRows.push({
    townId: Number(row.town_id),
    townName: row.town_name,
    planningRegionGeoid: row.planning_region_geoid,
    jurisdictionTag: row.jurisdiction_tag,
    changedTickets,
    sovVotes: Object.fromEntries(changedTickets.map((key) => [key, row[key]])),
    emsVotes: Object.fromEntries(changedTickets.map((key) => [key, ems[key]])),
    difference: Object.fromEntries(changedTickets.map((key) => [key, difference[key]])),
  });
}

const planningRegions = new Map();
for (const row of outputRows) {
  const region = planningRegions.get(row.planning_region_geoid) ?? {
    geoid: row.planning_region_geoid,
    jurisdictionTag: row.jurisdiction_tag,
    name: row.planning_region_name,
    towns: 0,
    sov: { harris: 0, trump: 0, other: 0, total: 0 },
    ems: { harris: 0, trump: 0, other: 0, total: 0 },
  };
  const ems = emsByTownId.get(row.town_id);
  const emsOther = otherTicketKeys.reduce((sum, key) => sum + ems[key], 0);
  region.towns += 1;
  region.sov.harris += row.harris_and_walz;
  region.sov.trump += row.trump_and_vance;
  region.sov.other += row.other_votes;
  region.sov.total += row.total_votes;
  region.ems.harris += ems.harris_and_walz;
  region.ems.trump += ems.trump_and_vance;
  region.ems.other += emsOther;
  region.ems.total += ems.harris_and_walz + ems.trump_and_vance + emsOther;
  planningRegions.set(row.planning_region_geoid, region);
}
if (planningRegions.size !== 9) {
  throw new Error(`Expected 9 current planning regions, got ${planningRegions.size}`);
}
const planningRegionReconciliation = [...planningRegions.values()]
  .sort((left, right) => left.geoid.localeCompare(right.geoid))
  .map((region) => ({
    ...region,
    difference: Object.fromEntries(
      ["harris", "trump", "other", "total"].map((key) => [key, region.sov[key] - region.ems[key]]),
    ),
  }));

const csvHeader = [
  "town_id",
  "town_name",
  "planning_region_geoid",
  "planning_region_name",
  "jurisdiction_tag",
  ...ticketKeys,
  "other_votes",
  "total_votes",
  "ballot_page",
  "write_in_page_1",
  "write_in_page_2",
  "source_id",
  "source_url",
];
const csvText = writeCsv(csvHeader, outputRows);
const differenceTotals = Object.fromEntries(
  ticketKeys.map((key) => [key, extractedTotals[key] - emsTotals[key]]),
);
const summary = {
  state: "CT",
  electionYear: 2024,
  contest: "President",
  sourceAuthority: "Connecticut Secretary of the State",
  sourceUrl: SOURCE_URL,
  reportingGrain: "town source aggregated to current Census planning-region county-equivalents",
  parserOrNormalizationPath: "scripts/normalize-ct-2024-statement-of-vote.mjs",
  localArtifacts: {
    statementOfVotePdf: PDF_RELATIVE,
    emsComparisonPackage: EMS_DIRECTORY,
    planningRegionCrosswalk: CROSSWALK_RELATIVE,
    normalizedTownCsv: CSV_RELATIVE,
    reconciliationSummary: SUMMARY_RELATIVE,
  },
  sourceFiles: {
    statementOfVotePdf: {
      bytes: pdfBytes.length,
      pages: textResult.total,
      sha256: actualPdf.sha256,
      extractedPresidentPages: selectedPages,
    },
    emsLookupSha256: sha256(Buffer.from(lookupText)),
    emsTownVotesSha256: sha256(Buffer.from(townVotesText)),
    emsStateVotesSha256: sha256(Buffer.from(stateVotesText)),
    planningRegionCrosswalkSha256: sha256(Buffer.from(crosswalkText)),
    normalizedTownCsvSha256: sha256(Buffer.from(csvText)),
  },
  expected: {
    townRows: 169,
    ticketRowsPerTown: 12,
    planningRegionRows: 9,
    totals: sovBucketTotals,
  },
  ticketReconciliation,
  statewideReconciliation: {
    sov: sovBucketTotals,
    ems: {
      harris: emsTotals.harris_and_walz,
      trump: emsTotals.trump_and_vance,
      other: otherTicketKeys.reduce((sum, key) => sum + emsTotals[key], 0),
      total: Object.values(emsTotals).reduce((sum, votes) => sum + votes, 0),
    },
    difference: {
      harris: sovBucketTotals.harris - emsTotals.harris_and_walz,
      trump: sovBucketTotals.trump - emsTotals.trump_and_vance,
      other:
        sovBucketTotals.other - otherTicketKeys.reduce((sum, key) => sum + emsTotals[key], 0),
      total: sovBucketTotals.total - Object.values(emsTotals).reduce((sum, votes) => sum + votes, 0),
    },
    ticketDifference: differenceTotals,
  },
  townReconciliation: {
    comparedTownRows: 169,
    unchangedTownRows: 169 - changedTownRows.length,
    changedTownRows: changedTownRows.length,
    differences: changedTownRows,
  },
  planningRegionReconciliation,
  promotionSafety: {
    resultRowsReady: true,
    rationale:
      "Use the normalized 169-town certified Statement of Vote President rows for the nine current planning-region result aggregates; retain EMS version 80741 only for U.S. Senate comparison and turnout fields.",
    exactTownCoverage: true,
    exactTicketCoverage: true,
    exactPrintedTotalReconciliation: true,
    exactPlanningRegionCrosswalk: true,
    remainingResultBlockers: [],
  },
  caveats: [
    "The certified Statement of Vote contains 265 more presidential votes than EMS version 80741: 144 Harris, 106 Trump, and 15 across other tickets/write-ins. The normalized SOV rows supersede EMS President values for active 2024 result and review calculations.",
    "U.S. Senate comparison and EV/VV turnout fields remain sourced from EMS version 80741. Turnout semantics remain warning-required and are not certified by this presidential reconciliation.",
    "The nine result rows are current Census planning-region county-equivalent aggregates of 169 official town rows. Planning regions are comparison geography, not Connecticut election reporting units.",
  ],
};

await Promise.all([
  writeFile(path.join(repoRoot, CSV_RELATIVE), csvText, "utf8"),
  writeFile(path.join(repoRoot, SUMMARY_RELATIVE), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
]);

console.log(`Wrote ${CSV_RELATIVE}: ${outputRows.length} town rows`);
console.log(`Wrote ${SUMMARY_RELATIVE}: SOV ${sovBucketTotals.total}, EMS ${summary.statewideReconciliation.ems.total}`);
