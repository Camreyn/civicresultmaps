import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export const MONROE_CANVASS_BOOK_URL = "https://www.monroecounty.gov/files/boe/Election%20Results/Election%20Canvass%20Books/2024%20Cavnass%20Book.pdf";
export const MONROE_CERTIFICATION_URL = "https://www.monroecounty.gov/files/boe/Election%20Results/Election%20Certifications/2024%20General%20Certification%202024-11-26.pdf";
export const MONROE_TURNOUT_URL = "https://www.monroecounty.gov/files/boe/Election%20Results/Voter%20Turnout%20Reports/2024%20General%20Voter%20Turnout%20v2.pdf";

const TOWN_HEADINGS = new Set([
  "Brighton",
  "Chili",
  "Clarkson",
  "East Rochester",
  "Gates",
  "Greece",
  "Hamlin",
  "Henrietta",
  "Irondequoit",
  "Mendon",
  "Ogden",
  "Parma",
  "Penfield",
  "Perinton",
  "Pittsford",
  "Riga",
  "Rush",
  "Sweden",
  "Webster",
  "Wheatland",
]);

const CANVASS_PAGE_COUNT = 356;

function intValue(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numbersFromLine(line) {
  return [...String(line ?? "").matchAll(/\d[\d,]*/g)].map((match) => intValue(match[0]));
}

function sumRows(rows, keys) {
  return Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)]));
}

function pageText(text, pageNumber) {
  const pages = text.split(new RegExp(`\\n-- (\\d+) of ${CANVASS_PAGE_COUNT} --\\n`));
  const index = pages.indexOf(String(pageNumber));
  return index >= 0 ? pages[index + 1] : "";
}

function isHeading(line) {
  return /^Leg\. Dist\. \d+$/i.test(line) || TOWN_HEADINGS.has(line);
}

function shouldSkipLine(line) {
  return /^(PRESIDENT|UNITED STATES|DETAIL|TOTAL|VOTES|LEGISLATIVE|DISTRICT|OR TOWN|KAMALA|DONALD|KIRSTEN|MICHAEL|DIANE|SARE|AND|VOID|BLANK|CON|WOR|SCATTER|LAR|JD|VANCE|TIM|WALZ|HARRIS|TRUMP|SAPRAICONE|GILLIBRAND|\d{3})$/i.test(line);
}

async function pdfText(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function parsePresidentRows(text) {
  const rows = [];
  let currentHeading = "";
  for (let page = 125; page <= 143; page += 1) {
    for (const rawLine of pageText(text, page).split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (isHeading(line)) {
        currentHeading = line;
        continue;
      }
      if (!currentHeading || shouldSkipLine(line) || /[A-Za-z]/.test(line)) continue;
      const nums = numbersFromLine(line);
      if (nums.length !== 8) continue;
      const [scatter, blankVoid, total, electionDistrict, dem, rep, con, wor] = nums;
      if (dem + rep + con + wor + scatter + blankVoid !== total) {
        throw new Error(`Monroe President detail row does not sum on page ${page}: ${line}`);
      }
      rows.push({
        local_unit: `${currentHeading} ED ${electionDistrict}`,
        pres_harris: dem + wor,
        pres_trump: rep + con,
        pres_other: scatter + blankVoid,
        pres_total: total,
      });
    }
  }
  return rows;
}

function parseSenateRows(text) {
  const rows = [];
  let currentHeading = "";
  for (let page = 145; page <= 164; page += 1) {
    for (const rawLine of pageText(text, page).split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (isHeading(line)) {
        currentHeading = line;
        continue;
      }
      if (!currentHeading || shouldSkipLine(line) || /[A-Za-z]/.test(line)) continue;
      const nums = numbersFromLine(line);
      if (nums.length !== 9) continue;
      const [dem, wor, lar, rep, con, blankVoid, total, scatter, electionDistrict] = nums;
      if (dem + rep + con + wor + lar + blankVoid + scatter !== total) {
        throw new Error(`Monroe Senate detail row does not sum on page ${page}: ${line}`);
      }
      rows.push({
        local_unit: `${currentHeading} ED ${electionDistrict}`,
        comparison_dem: dem + wor,
        comparison_rep: rep + con,
        comparison_other: lar,
        senate_total_including_blank_void_scatter: total,
      });
    }
  }
  return rows;
}

function parseCertificationTotals(text) {
  const presidentText = text.slice(text.indexOf("of President and Vice President"), text.indexOf("-- 1 of 16 --"));
  const senateText = text.slice(text.indexOf("of United States Senator"), text.indexOf("of State Supreme Court Justice"));
  const presidentTotal = intValue(presidentText.match(/Total ([\d,]+)/)?.[1]);
  const senateTotal = intValue(senateText.match(/Total ([\d,]+)/)?.[1]);
  const presidentHarris = intValue(presidentText.match(/([\d,]+)\s+Democratic received\s+Kamala D Harris/)?.[1]) + intValue(presidentText.match(/([\d,]+)\s+Working Families received\s+Kamala D Harris/)?.[1]);
  const presidentTrump = intValue(presidentText.match(/([\d,]+)\s+Republican received\s+Donald J Trump/)?.[1]) + intValue(presidentText.match(/([\d,]+)\s+Conservative received\s+Donald J Trump/)?.[1]);
  const senateDem = intValue(senateText.match(/Kirsten E Gillibrand ([\d,]+)\s+Democratic received/)?.[1]) + intValue(senateText.match(/Kirsten E Gillibrand ([\d,]+)\s+Working Families received/)?.[1]);
  const senateRep = intValue(senateText.match(/Michael D Sapraicone ([\d,]+)\s+Republican received/)?.[1]) + intValue(senateText.match(/Michael D Sapraicone ([\d,]+)\s+Conservative received/)?.[1]);
  const senateOther = intValue(senateText.match(/Diane Sare ([\d,]+)\s+Larouche received/)?.[1]);
  return {
    president: {
      harris: presidentHarris,
      trump: presidentTrump,
      other: presidentTotal - presidentHarris - presidentTrump,
      total: presidentTotal,
    },
    senate: {
      dem: senateDem,
      rep: senateRep,
      other: senateOther,
      totalIncludingBlankVoidScattering: senateTotal,
    },
  };
}

function parseCsvTotals(repoRoot) {
  const readCounty = (fileName) => fs.readFileSync(path.join(repoRoot, "data", fileName), "utf8").trim().split(/\r?\n/).slice(1).map((line) => line.split(",")).find((row) => row[2] === "Monroe County");
  const president = readCounty("ny-2024-general-president.csv");
  const senate = readCounty("ny-2024-general-senate.csv");
  if (!president || !senate) throw new Error("Missing active Monroe county rows in NY certified CSV artifacts.");
  return {
    president: {
      harris: intValue(president[4]),
      trump: intValue(president[3]),
      other: intValue(president[5]),
      total: intValue(president[3]) + intValue(president[4]) + intValue(president[5]),
    },
    senate: {
      dem: intValue(senate[4]),
      rep: intValue(senate[3]),
      other: intValue(senate[5]),
    },
  };
}

function parseTurnoutLead(text) {
  const match = [...String(text ?? "").matchAll(/([\d,]+)\s+([\d,]+)\s+73\.4%/g)]
    .map((candidate) => ({
      totalVoters: intValue(candidate[1]),
      registeredVoters: intValue(candidate[2]),
    }))
    .find((candidate) => candidate.totalVoters > 300000 && candidate.registeredVoters > 400000);
  if (!match) return null;
  return {
    totalVoters: match.totalVoters,
    registeredVoters: match.registeredVoters,
    turnoutPct: 73.4,
    caveat: "Countywide GRAND Total parsed from the Monroe turnout v2 PDF; gender and legislative-district turnout subtotals are retained in the artifact but not normalized into active NY turnout rows.",
  };
}

export async function parseMonroeOfficialDetail({ repoRoot }) {
  const canvassText = await pdfText(path.join(repoRoot, "data", "ny-2024-monroe-canvass-book.pdf"));
  const certificationText = await pdfText(path.join(repoRoot, "data", "ny-2024-monroe-general-certification.pdf"));
  const turnoutPath = path.join(repoRoot, "data", "ny-2024-monroe-general-voter-turnout-v2.pdf");
  const turnoutText = fs.existsSync(turnoutPath) ? await pdfText(turnoutPath) : "";
  const presidentRows = parsePresidentRows(canvassText);
  const senateRows = parseSenateRows(canvassText);
  const senateByUnit = new Map(senateRows.map((row) => [row.local_unit, row]));
  const missingSenateRows = presidentRows.filter((row) => !senateByUnit.has(row.local_unit));
  const extraSenateRows = senateRows.filter((row) => !presidentRows.some((president) => president.local_unit === row.local_unit));
  if (missingSenateRows.length || extraSenateRows.length) {
    throw new Error(`Monroe President/Senate detail row key mismatch: missing=${missingSenateRows.length}, extra=${extraSenateRows.length}`);
  }
  const rows = presidentRows.map((president) => {
    const senate = senateByUnit.get(president.local_unit);
    return {
      county: "Monroe County",
      ...president,
      comparison_dem: senate.comparison_dem,
      comparison_rep: senate.comparison_rep,
      comparison_other: senate.comparison_other,
    };
  }).filter((row) => row.pres_total > 0);
  const detailTotals = {
    president: sumRows(rows, ["pres_harris", "pres_trump", "pres_other", "pres_total"]),
    senate: sumRows(rows, ["comparison_dem", "comparison_rep", "comparison_other"]),
  };
  const certificationTotals = parseCertificationTotals(certificationText);
  const activeCountyTotals = parseCsvTotals(repoRoot);
  const turnoutLead = turnoutText ? parseTurnoutLead(turnoutText) : null;
  const assertions = [
    ["President Harris detail vs certification", detailTotals.president.pres_harris, certificationTotals.president.harris],
    ["President Trump detail vs certification", detailTotals.president.pres_trump, certificationTotals.president.trump],
    ["President other detail vs certification", detailTotals.president.pres_other, certificationTotals.president.other],
    ["President total detail vs certification", detailTotals.president.pres_total, certificationTotals.president.total],
    ["Senate Democratic detail vs certification", detailTotals.senate.comparison_dem, certificationTotals.senate.dem],
    ["Senate Republican detail vs certification", detailTotals.senate.comparison_rep, certificationTotals.senate.rep],
    ["Senate other detail vs certification", detailTotals.senate.comparison_other, certificationTotals.senate.other],
    ["President Harris detail vs active CSV", detailTotals.president.pres_harris, activeCountyTotals.president.harris],
    ["President Trump detail vs active CSV", detailTotals.president.pres_trump, activeCountyTotals.president.trump],
    ["President other detail vs active CSV", detailTotals.president.pres_other, activeCountyTotals.president.other],
    ["Senate Democratic detail vs active CSV", detailTotals.senate.comparison_dem, activeCountyTotals.senate.dem],
    ["Senate Republican detail vs active CSV", detailTotals.senate.comparison_rep, activeCountyTotals.senate.rep],
    ["Senate other detail vs active CSV", detailTotals.senate.comparison_other, activeCountyTotals.senate.other],
  ];
  const failures = assertions.filter(([, actual, expected]) => actual !== expected);
  if (failures.length) {
    throw new Error(`Monroe official detail reconciliation failed: ${failures.map(([label, actual, expected]) => `${label} actual=${actual} expected=${expected}`).join("; ")}`);
  }
  return {
    rows,
    summary: {
      state: "NY",
      county: "Monroe County",
      electionYear: 2024,
      checkedAt: "2026-07-04",
      sourceAuthority: "Monroe County Board of Elections",
      sourceUrls: {
        canvassBook: MONROE_CANVASS_BOOK_URL,
        certification: MONROE_CERTIFICATION_URL,
        turnoutLead: MONROE_TURNOUT_URL,
      },
      localArtifacts: {
        canvassBook: "data/ny-2024-monroe-canvass-book.pdf",
        certification: "data/ny-2024-monroe-general-certification.pdf",
        turnoutLead: fs.existsSync(turnoutPath) ? "data/ny-2024-monroe-general-voter-turnout-v2.pdf" : null,
      },
      reportingGrain: "legislative_district_or_town_by_election_district_detail",
      parserOrNormalizationPath: "scripts/ny-monroe-official-detail.mjs; scripts/reconcile-ny-monroe-sources.mjs; scripts/normalize-ny-local-review.mjs",
      rowCount: rows.length,
      detailTotals,
      certificationTotals,
      activeCountyTotals,
      turnoutLead,
      caveats: [
        "Rows are official Monroe County local detail rows and reconcile to the November 26, 2024 certification and active NYSBOE county CSV totals.",
        "President local pres_other follows the active NY county residual convention and includes scatter plus blank/void residual votes.",
        "U.S. Senate comparison_other is Diane Sare/Larouche candidate votes only, matching the active county comparison CSV convention.",
        "The Monroe turnout v2 PDF is retained as a county-specific state-native lead only; active NY turnout remains EAC fallback until a statewide New York turnout or voter-history package is collected and reconciled.",
      ],
      confidence: "official_detail_reconciled_loaded",
    },
  };
}

export async function writeMonroeReconciliationSummary({ repoRoot, outPath }) {
  const { summary } = await parseMonroeOfficialDetail({ repoRoot });
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
