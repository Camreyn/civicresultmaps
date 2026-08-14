import { readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";
import { reportingUnitCode } from "../../src/lib/precinct-geography.ts";

export const ALASKA_PRECINCT_ELECTIONS = Object.freeze({
  2012: Object.freeze({
    id: "2012-11-06-general",
    date: "2012-11-06",
    year: 2012,
    type: "general",
    office: "president",
  }),
  2016: Object.freeze({
    id: "2016-11-08-general",
    date: "2016-11-08",
    year: 2016,
    type: "general",
    office: "president",
  }),
  2020: Object.freeze({
    id: "2020-11-03-general",
    date: "2020-11-03",
    year: 2020,
    type: "general",
    office: "president",
  }),
  2024: Object.freeze({
    id: "2024-11-05-general",
    date: "2024-11-05",
    year: 2024,
    type: "general",
    office: "president",
  }),
});

const PARTY_NAMES = Object.freeze({
  AIP: "Alaskan Independence",
  ALI: "Alliance",
  ASP: "Aurora",
  CON: "Constitution",
  DEM: "Democratic",
  GRE: "Green",
  GRN: "Green",
  LIB: "Libertarian",
  NA: "Nonpartisan",
  NOM: "No party affiliation",
  NP: "Nonpartisan",
  REP: "Republican",
  WRI: "Write-in",
  "": "Other",
});

export function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
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
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error("Alaska CSV source contains an unterminated quoted field.");
  return rows;
}

function integer(value, context) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${context} must be an integer.`);
  }
  const result = Number(normalized);
  if (!Number.isSafeInteger(result)) throw new Error(`${context} is outside the safe integer range.`);
  return result;
}

function nonnegativeInteger(value, context) {
  const result = integer(value, context);
  if (result < 0) throw new Error(`${context} must not be negative.`);
  return result;
}

function alaskaParentId(sourceUnitId) {
  const match = String(sourceUnitId).match(/^(\d{2})-\d{3}$/);
  return match ? `HD${match[1]}` : null;
}

function administrativeParentId(name) {
  const district = String(name).match(/^District\s+(\d{1,2})\s*-/i)?.[1];
  if (district) return `HD${district.padStart(2, "0")}`;
  if (/HD99\s+Fed\s+Overseas/i.test(String(name))) return "HD99";
  return null;
}

function isGeographicName(name) {
  return /^\d{2}-\d{3}(?:\s|$)/.test(String(name).trim());
}

function sourceUnit(name) {
  const raw = String(name).replace(/\s+/g, " ").trim();
  const splitAdministrative = raw.match(
    /^District\s+(\d{1,2})\s*-\s*(Absentee|Early Voting|Question)(?:\s+District\s+\d{1,2}\s*-\s*(?:Absentee|Early Voting|Question)\s*-\s*\d+)?$/i,
  );
  const normalized = splitAdministrative
    ? `District ${Number(splitAdministrative[1])} - ${splitAdministrative[2].replace(/^./, (value) => value.toUpperCase())}`
    : raw;
  const sourceUnitId = isGeographicName(normalized)
    ? normalized.slice(0, 6)
    : normalized;
  return {
    sourceUnitId,
    sourceDisplayName: normalized,
    parentGeoid: isGeographicName(normalized)
      ? alaskaParentId(sourceUnitId)
      : administrativeParentId(normalized),
    reportingGrain: isGeographicName(normalized)
      ? "precinct"
      : "administrative_reporting_unit",
    isGeographic: isGeographicName(normalized),
  };
}

function partyName(code) {
  return PARTY_NAMES[String(code ?? "").trim().toUpperCase()]
    ?? (String(code ?? "").trim() || "Other");
}

function normalizedOffice(value) {
  const text = String(value ?? "").replaceAll('"', "").trim().toUpperCase();
  if (text === "US PRESIDENT" || text === "U.S. PRESIDENT / VICE PRESIDENT") return "president";
  if (text === "US SENATOR" || text === "U.S. SENATOR") return "senate";
  if (text === "US REPRESENTATIVE" || text === "U.S. REPRESENTATIVE") return "us_house";
  return null;
}

const ALASKA_2020_CANDIDATES = Object.freeze({
  president: Object.freeze({
    ALI: "De La Fuente, Roque / Richardson, Darcy G.",
    CON: "Blankenship, Don / Mohr, William",
    DEM: "Biden, Joseph R. Jr. / Harris, Kamala D.",
    GRN: "Ventura, Jesse / McKinney, Cynthia",
    LIB: "Jorgensen, Jo / Cohen, Jeremy",
    NOM: "Pierce, Brock / Ballard, Karla",
    REP: "Trump, Donald J. / Pence, Michael R.",
  }),
  senate: Object.freeze({
    AIP: "Howe, John Wayne",
    DEM: "Gross, Al",
    REP: "Sullivan, Dan",
  }),
});

function canonicalCandidate(year, office, choice, partyCode) {
  if (/^Write-in(?:\s+\d+)?$/i.test(choice)) {
    return { candidate: "Write-in", partyCode: "WRI" };
  }
  if (year === 2020) {
    const candidate = ALASKA_2020_CANDIDATES[office]?.[partyCode];
    if (!candidate) throw new Error(`Alaska 2020 has an unexpected ${office} candidate/party ${choice} (${partyCode}).`);
    return { candidate, partyCode };
  }
  return { candidate: choice, partyCode };
}

function resultUnitCodeFor(unit, electionId) {
  return reportingUnitCode({
    state: "AK",
    electionId,
    reportingGrain: unit.reportingGrain,
    parentGeoid: unit.parentGeoid,
    sourceUnitId: unit.sourceUnitId,
  });
}

function finalizeUnits(units, election) {
  return [...units.values()]
    .map((unit) => ({
      ...unit,
      resultUnitCode: resultUnitCodeFor(unit, election.id),
      contests: Object.fromEntries(
        [...unit.contests.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([office, contest]) => [
            office,
            {
              office,
              reportedRegistration: contest.reportedRegistration,
              reportedTurnout: contest.reportedTurnout,
              totalVotes: contest.candidates.reduce((sum, row) => sum + row.votes, 0),
              candidates: contest.candidates
                .map((row) => ({ ...row }))
                .sort((left, right) => left.candidate.localeCompare(right.candidate)),
            },
          ]),
      ),
    }))
    .sort((left, right) => (
      Number(right.isGeographic) - Number(left.isGeographic)
      || String(left.parentGeoid).localeCompare(String(right.parentGeoid))
      || left.sourceUnitId.localeCompare(right.sourceUnitId)
    ));
}

function addContestValue(units, election, input) {
  const unitIdentity = sourceUnit(input.unitName);
  let unit = units.get(unitIdentity.sourceUnitId);
  if (!unit) {
    unit = { ...unitIdentity, contests: new Map() };
    units.set(unitIdentity.sourceUnitId, unit);
  } else if (
    unit.sourceDisplayName !== unitIdentity.sourceDisplayName
    || unit.parentGeoid !== unitIdentity.parentGeoid
    || unit.isGeographic !== unitIdentity.isGeographic
  ) {
    throw new Error(`Alaska ${election.year} source unit identity drifted for ${unitIdentity.sourceUnitId}.`);
  }
  let contest = unit.contests.get(input.office);
  if (!contest) {
    contest = { reportedRegistration: null, reportedTurnout: null, candidates: [], candidateIndex: new Map() };
    unit.contests.set(input.office, contest);
  }
  if (input.kind === "registration") {
    if (contest.reportedRegistration !== null && contest.reportedRegistration !== input.value) {
      throw new Error(`Alaska ${election.year} registration changed within ${unitIdentity.sourceUnitId}.`);
    }
    contest.reportedRegistration = input.value;
    return;
  }
  if (input.kind === "turnout") {
    contest.reportedTurnout = (contest.reportedTurnout ?? 0) + input.value;
    return;
  }
  const key = `${input.candidate}|${input.partyCode}`;
  const existingIndex = contest.candidateIndex.get(key);
  if (existingIndex !== undefined) {
    contest.candidates[existingIndex].votes += input.value;
    return;
  }
  contest.candidateIndex.set(key, contest.candidates.length);
  contest.candidates.push({
    candidate: input.candidate,
    party: partyName(input.partyCode),
    partyCode: input.partyCode || "",
    votes: input.value,
  });
}

function removeInternalSets(units) {
  for (const unit of units.values()) {
    for (const contest of unit.contests.values()) delete contest.candidateIndex;
  }
}

export function parseAlaska2016ResultText(bytes) {
  const election = ALASKA_PRECINCT_ELECTIONS[2016];
  const pattern = /^"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*(-?\d+)\s*,\s*$/;
  const units = new Map();
  let parsedLines = 0;
  for (const line of Buffer.from(bytes).toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(pattern);
    if (!match) throw new Error("Alaska 2016 result export contains an unparseable row.");
    parsedLines += 1;
    const office = normalizedOffice(match[2]);
    if (!office || !["president", "senate"].includes(office) || match[5].trim() !== "Total") continue;
    const choice = match[3].trim();
    const partyCode = match[4].trim();
    const value = nonnegativeInteger(match[6], `Alaska 2016 ${choice}`);
    if (choice === "Registered Voters") {
      addContestValue(units, election, { unitName: match[1], office, kind: "registration", value });
    } else if (choice === "Times Counted") {
      addContestValue(units, election, { unitName: match[1], office, kind: "turnout", value });
    } else if ((partyCode !== "NP" || /^Write-in/i.test(choice)) && !/^Total Votes$/i.test(choice)) {
      const candidate = canonicalCandidate(2016, office, choice, partyCode);
      addContestValue(units, election, { unitName: match[1], office, kind: "candidate", ...candidate, value });
    }
  }
  removeInternalSets(units);
  const result = finalizeUnits(units, election);
  if (parsedLines !== 84641 || result.length !== 562) {
    throw new Error(`Alaska 2016 result contract changed (${parsedLines} lines, ${result.length} units).`);
  }
  return result;
}

export function parseAlaska2020ResultText(bytes) {
  const election = ALASKA_PRECINCT_ELECTIONS[2020];
  const rows = parseCsv(Buffer.from(bytes).toString("utf8"));
  const units = new Map();
  for (const [index, row] of rows.entries()) {
    if (row.length !== 9 || row[8].trim() !== "") {
      throw new Error(`Alaska 2020 row ${index + 1} must have eight values and one trailing empty field.`);
    }
    const [unitName, contestName, , , choice, partyCode, mode, rawValue] = row.map((value) => value.trim());
    const office = normalizedOffice(contestName);
    if (!office || !["president", "senate"].includes(office) || mode !== "Total") continue;
    const value = nonnegativeInteger(rawValue, `Alaska 2020 ${choice}`);
    if (choice === "Registered Voters") {
      addContestValue(units, election, { unitName, office, kind: "registration", value });
    } else if (choice === "Times Counted") {
      addContestValue(units, election, { unitName, office, kind: "turnout", value });
    } else if ((partyCode !== "NP" || /^Write-in/i.test(choice)) && !/^Total Votes$/i.test(choice)) {
      const candidate = canonicalCandidate(2020, office, choice, partyCode);
      addContestValue(units, election, { unitName, office, kind: "candidate", ...candidate, value });
    }
  }
  removeInternalSets(units);
  const result = finalizeUnits(units, election);
  if (result.length !== 562) {
    throw new Error(`Alaska 2020 result contract changed (${rows.length} rows, ${result.length} units).`);
  }
  return result;
}

function alaska2020SovcCandidateRows(pageText, officeTitle, candidateColumns) {
  const rows = [];
  const lines = pageText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const cells = rawLine.trim().split(/\s*\t+\s*/);
    const wrappedFederalOverseas = (
      /^HD99\s+Fed\s+Overseas$/i.test(cells[0])
      && /^Absentee(?:\s|$)/i.test(lines[index + 1]?.trim() ?? "")
    );
    const validLabel = (
      /^\d{2}-\d{3}\s+.+$/i.test(cells[0])
      || /^District\s+\d{1,2}\s+-\s+(?:Absentee|Early Voting|Question)$/i.test(cells[0])
      || /^HD99\s+Fed\s+Overseas\s+Absentee$/i.test(cells[0])
      || wrappedFederalOverseas
    );
    if (!validLabel) continue;
    let label = wrappedFederalOverseas
      ? "HD99 Fed Overseas Absentee"
      : cells[0].replace(/\s+/g, " ").trim();
    let numericCells = cells.slice(1);
    if (numericCells.length === 0 && (/^\d{2}-\d{3}\s/.test(label) || wrappedFederalOverseas)) {
      if (/^\d{2}-\d{3}\s/.test(label)) label = label.slice(0, 6);
      for (let lookAhead = index + 1; lookAhead <= Math.min(index + 4, lines.length - 1); lookAhead += 1) {
        const candidateCells = lines[lookAhead].trim().split(/\s*\t+\s*/);
        if (
          candidateCells.length === candidateColumns + 1
          && candidateCells.every((value) => /^[\d,]+$/.test(value))
        ) {
          numericCells = candidateCells;
          break;
        }
      }
    }
    if (!numericCells.every((value) => /^[\d,]+$/.test(value))) continue;
    const values = numericCells.map((value) => nonnegativeInteger(value, `${officeTitle} SOVC value`));
    if (values.length === candidateColumns + 1) {
      rows.push({ label, values });
    }
  }
  return rows;
}

export async function augmentAlaska2020WriteIns(units, paths) {
  if (!Array.isArray(paths) || paths.length !== 41) {
    throw new Error("Alaska 2020 write-in reconciliation requires HD1-HD40 and HD99 SOVC PDFs.");
  }
  const byId = new Map(units.map((unit) => [unit.sourceUnitId, structuredClone(unit)]));
  const seen = { president: new Set(), senate: new Set() };
  for (const sourcePath of paths) {
    const text = await pdfText(readFileSync(sourcePath));
    if (!/State of Alaska - 2020 General Election/.test(text) || !/OFFICIAL RESULTS/.test(text)) {
      throw new Error(`${sourcePath} is not an official Alaska 2020 SOVC.`);
    }
    const pages = text.split(/--\s+\d+\s+of\s+\d+\s+--/);
    for (const [office, title, candidateColumns, nextTitle] of [
      ["president", "U.S. President / Vice President", 8, "U.S. Senator"],
      ["senate", "U.S. Senator", 4, "U.S. Representative"],
    ]) {
      const firstPage = pages.findIndex((page) => page.includes(title));
      if (firstPage < 0) throw new Error(`${sourcePath} lacks ${title}.`);
      const followingPage = pages.findIndex(
        (page, index) => index > firstPage && page.includes(nextTitle),
      );
      const officePages = pages.slice(
        firstPage,
        followingPage < 0 ? pages.length : followingPage,
      );
      for (const page of officePages) {
        for (const row of alaska2020SovcCandidateRows(page, title, candidateColumns)) {
          const id = sourceUnit(row.label).sourceUnitId;
          const unit = byId.get(id);
          if (!unit) throw new Error(`Alaska 2020 SOVC unit ${id} is absent from the text export.`);
          if (seen[office].has(id)) throw new Error(`Alaska 2020 SOVC repeats ${office} unit ${id}.`);
          seen[office].add(id);
          const contest = unit.contests[office];
          if (!contest) throw new Error(`Alaska 2020 text export lacks ${office} for ${id}.`);
          const namedTotal = row.values.slice(0, candidateColumns - 1).reduce((sum, value) => sum + value, 0);
          if (namedTotal !== contest.totalVotes) {
            throw new Error(`Alaska 2020 SOVC named-candidate total disagrees for ${office} ${id}.`);
          }
          const writeInVotes = row.values[candidateColumns - 1];
          const sovcTotal = row.values[candidateColumns];
          if (namedTotal + writeInVotes !== sovcTotal) {
            throw new Error(`Alaska 2020 SOVC candidate values do not add for ${office} ${id}.`);
          }
          contest.candidates.push({
            candidate: "Write-in",
            party: "Write-in",
            partyCode: "WRI",
            votes: writeInVotes,
          });
          contest.candidates.sort((left, right) => left.candidate.localeCompare(right.candidate));
          contest.totalVotes = sovcTotal;
        }
      }
    }
  }
  for (const office of ["president", "senate"]) {
    if (seen[office].size !== 562) {
      const missing = [...byId.keys()].filter((id) => !seen[office].has(id));
      throw new Error(
        `Alaska 2020 SOVC ${office} coverage changed (${seen[office].size} units; missing ${missing.slice(0, 20).join(", ")}).`,
      );
    }
  }
  return [...byId.values()].sort((left, right) => (
    Number(right.isGeographic) - Number(left.isGeographic)
    || String(left.parentGeoid).localeCompare(String(right.parentGeoid))
    || left.sourceUnitId.localeCompare(right.sourceUnitId)
  ));
}

export function parseAlaska2024EnrCsv(bytes) {
  const election = ALASKA_PRECINCT_ELECTIONS[2024];
  const [header, ...records] = parseCsv(Buffer.from(bytes).toString("utf8"));
  const index = Object.fromEntries(header.map((name, position) => [name.trim(), position]));
  for (const required of ["Precinct_name", "Pct_Id", "Contest_title", "candidate_name", "Party_Code", "total_votes", "Reg_voters", "total_ballots"]) {
    if (!Object.hasOwn(index, required)) throw new Error(`Alaska 2024 ENR lacks ${required}.`);
  }
  const units = new Map();
  for (const [recordIndex, record] of records.entries()) {
    const value = (name) => record[index[name]] ?? "";
    const office = normalizedOffice(value("Contest_title"));
    if (!office || !["president", "us_house"].includes(office)) continue;
    const unitName = value("Precinct_name").trim();
    if (!unitName) throw new Error(`Alaska 2024 ENR row ${recordIndex + 2} lacks Precinct_name.`);
    const candidate = value("candidate_name").trim();
    if (!candidate) continue;
    addContestValue(units, election, {
      unitName,
      office,
      kind: "registration",
      value: nonnegativeInteger(value("Reg_voters"), `Alaska 2024 ${unitName} registration`),
    });
    addContestValue(units, election, {
      unitName,
      office,
      kind: "turnout",
      value: nonnegativeInteger(value("total_ballots"), `Alaska 2024 ${unitName} turnout`),
    });
    addContestValue(units, election, {
      unitName,
      office,
      kind: "candidate",
      candidate,
      partyCode: value("Party_Code").trim(),
      value: nonnegativeInteger(value("total_votes"), `Alaska 2024 ${unitName} ${candidate}`),
    });
  }
  removeInternalSets(units);
  const result = finalizeUnits(units, election);
  if (result.length !== 523) throw new Error(`Alaska 2024 ENR contract changed (${result.length} units).`);
  return result;
}

async function pdfText(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

function pageRows(pageText, officeTitle) {
  const lines = pageText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const officeIndex = lines.indexOf(officeTitle);
  if (officeIndex < 0) return [];
  const firstRegistration = lines.indexOf("Reg. Voters");
  if (firstRegistration < 0 || firstRegistration >= officeIndex) {
    throw new Error(`Alaska 2012 ${officeTitle} page lacks its unit labels.`);
  }
  const pageHeaderEnd = lines.findIndex((line, index) => index > 0 && (/^Jurisdiction Wide$/i.test(line) || /^\d{2}-\d{3}\s/.test(line) || /^District\s+\d+\s*-/.test(line)));
  if (pageHeaderEnd < 0) throw new Error(`Alaska 2012 ${officeTitle} page lacks a first reporting unit.`);
  const labels = lines.slice(pageHeaderEnd, firstRegistration).filter((line) => (
    /^\d{2}-\d{3}\s/.test(line)
    || /^District\s+\d+\s*-\s*(?:Absentee|Question|Early Voting)$/i.test(line)
  ));
  const numericLines = lines.slice(officeIndex + 1).filter((line) => /^\d[\d\s.,%-]*$/.test(line));
  if (numericLines.length < labels.length) {
    throw new Error(`Alaska 2012 ${officeTitle} page has fewer numeric rows than unit labels.`);
  }
  return labels.map((label, index) => ({ label, values: numericLines[index].split(/\s+/) }));
}

export async function parseAlaska2012SovcPdfs(paths) {
  const election = ALASKA_PRECINCT_ELECTIONS[2012];
  if (!Array.isArray(paths) || paths.length !== 40) throw new Error("Alaska 2012 requires all 40 official district SOVC PDFs.");
  const units = new Map();
  const presidentCandidates = [
    ["Johnson/Gray", "LIB"],
    ["Obama/Biden", "DEM"],
    ["Romney/Ryan", "REP"],
    ["Stein/Honkala", "GRE"],
    ["Write-In Votes", "WRI"],
  ];
  const houseCandidates = [
    ["Cissna, Sharon M.", "DEM"],
    ["Gianoutsos, Ted", "NA"],
    ["McDermott, Jim C.", "LIB"],
    ["Young, Don", "REP"],
    ["Write-In Votes", "WRI"],
  ];
  for (const [districtIndex, sourcePath] of paths.entries()) {
    const text = await pdfText(readFileSync(sourcePath));
    if (!/State of Alaska - 2012 General Election/.test(text) || !/Official Results/.test(text)) {
      throw new Error(`Alaska 2012 HD${districtIndex + 1} is not the official general-election SOVC.`);
    }
    const pages = text.split(/--\s+\d+\s+of\s+\d+\s+--/);
    for (const page of pages) {
      for (const row of pageRows(page, "US PRESIDENT")) {
        const values = row.values;
        if (values.length !== 10) throw new Error(`Alaska 2012 President row shape changed for ${row.label}.`);
        const unitName = row.label;
        addContestValue(units, election, { unitName, office: "president", kind: "registration", value: nonnegativeInteger(values[0], `${unitName} registration`) });
        addContestValue(units, election, { unitName, office: "president", kind: "turnout", value: nonnegativeInteger(values[1], `${unitName} turnout`) });
        for (const [[candidate, partyCode], value] of presidentCandidates.map((candidate, index) => [candidate, values[index + 5]])) {
          addContestValue(units, election, { unitName, office: "president", kind: "candidate", candidate, partyCode, value: nonnegativeInteger(value, `${unitName} ${candidate}`) });
        }
        const candidateTotal = values.slice(5).reduce((sum, value) => sum + nonnegativeInteger(value, `${unitName} President value`), 0);
        if (candidateTotal !== nonnegativeInteger(values[4], `${unitName} President total`)) throw new Error(`Alaska 2012 President row does not add for ${unitName}.`);
      }
      for (const row of pageRows(page, "US REPRESENTATIVE")) {
        const values = row.values;
        if (values.length < 7) throw new Error(`Alaska 2012 U.S. House row shape changed for ${row.label}.`);
        const unitName = row.label;
        addContestValue(units, election, { unitName, office: "us_house", kind: "registration", value: nonnegativeInteger(values[0], `${unitName} registration`) });
        for (const [[candidate, partyCode], value] of houseCandidates.map((candidate, index) => [candidate, values[index + 2]])) {
          addContestValue(units, election, { unitName, office: "us_house", kind: "candidate", candidate, partyCode, value: nonnegativeInteger(value, `${unitName} ${candidate}`) });
        }
        const total = nonnegativeInteger(values[1], `${unitName} U.S. House total`);
        const candidateTotal = values.slice(2, 7).reduce((sum, value) => sum + nonnegativeInteger(value, `${unitName} U.S. House value`), 0);
        if (candidateTotal !== total) throw new Error(`Alaska 2012 U.S. House row does not add for ${unitName}.`);
      }
    }
  }
  removeInternalSets(units);
  const result = finalizeUnits(units, election);
  if (result.length !== 558) throw new Error(`Alaska 2012 SOVC contract changed (${result.length} units).`);
  return result;
}

export function summarizeAlaskaResultUnits(units) {
  const summary = {
    resultUnits: units.length,
    geographicResultUnits: units.filter((unit) => unit.isGeographic).length,
    nonGeographicResultUnits: units.filter((unit) => !unit.isGeographic).length,
    contestTotals: {},
  };
  for (const unit of units) {
    for (const [office, contest] of Object.entries(unit.contests)) {
      const current = summary.contestTotals[office] ?? { totalVotes: 0, candidateTotals: {} };
      current.totalVotes += contest.totalVotes;
      for (const candidate of contest.candidates) {
        current.candidateTotals[candidate.candidate] = (current.candidateTotals[candidate.candidate] ?? 0) + candidate.votes;
      }
      summary.contestTotals[office] = current;
    }
  }
  return summary;
}
