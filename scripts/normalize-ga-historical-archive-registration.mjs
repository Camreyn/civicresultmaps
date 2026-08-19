import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

const archives = [
  { year: 2012, path: "data/ga-official-historical-archives/ga-2012-general-election.zip", url: "https://sos.ga.gov/sites/default/files/2026-04/november_6_2012_-_general_election.zip", bytes: 6222683, sha256: "bfdace1714247ec71d11557085a5558034b30b284d3942b8c7ee40c89783fa5a", dem: /OBAMA/i, rep: /ROMNEY/i },
  { year: 2016, path: "data/ga-official-historical-archives/ga-2016-general-election.zip", url: "https://sos.ga.gov/sites/default/files/2026-04/november_8_2016_-_general_election.zip", bytes: 7136382, sha256: "dc71926f86ea614c51295cc64ad16f514cc352103b037b3b94229f7a24a5843f", dem: /CLINTON/i, rep: /TRUMP/i },
  { year: 2020, path: "data/ga-official-historical-archives/ga-2020-general-election.zip", url: "https://sos.ga.gov/sites/default/files/2026-04/november_3_2020_-_general_election.zip", bytes: 8924732, sha256: "ab4b87d8d565612e13a8333255c31bf90f177a5fa23c98c680a20576acf06f47", dem: /BIDEN/i, rep: /TRUMP/i },
];

function csvRows(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function number(value) { const parsed = Number(String(value).replace(/,/g, "")); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid integer ${value}`); return parsed; }
function countyFromMember(name) { const file = name.split("/").at(-1).replace(/-summary\.zip$/i, ""); return `${file.split("_").slice(0, -2).join("_").replaceAll("_", " ")} County`; }

const baseline = new Map();
for (const row of csvRows(await readFile("data/ga-historical-presidential-baseline.csv", "utf8")).slice(1)) {
  baseline.set(`${row[1]}|${row[2]}`, { dem: number(row[9]), rep: number(row[10]), other: number(row[11]), total: number(row[12]) });
}

const leads = []; const review = [];
for (const archiveSpec of archives) {
  const bytes = await readFile(archiveSpec.path);
  if (bytes.length !== archiveSpec.bytes || createHash("sha256").update(bytes).digest("hex") !== archiveSpec.sha256) throw new Error(`pinned source drift: ${archiveSpec.path}`);
  const outer = await JSZip.loadAsync(bytes);
  const members = Object.values(outer.files).filter((file) => !file.dir && /\/summary\/.*-summary\.zip$/i.test(file.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (members.length !== 159) throw new Error(`${archiveSpec.year} expected 159 county summary archives, got ${members.length}`);
  const totals = { ballotsCast: 0, dem: 0, other: 0, registeredVoters: 0, rep: 0, total: 0 };
  for (const member of members) {
    const inner = await JSZip.loadAsync(await member.async("nodebuffer"));
    const csv = inner.file("summary.csv"); if (!csv) throw new Error(`${member.name} missing summary.csv`);
    const [header, ...rows] = csvRows(await csv.async("string"));
    const index = Object.fromEntries(header.map((name, position) => [name.toLowerCase(), position]));
    for (const name of ["contest name", "choice name", "total votes", "registered voters", "ballots cast"]) if (index[name] === undefined) throw new Error(`${member.name} missing ${name}`);
    const president = rows.filter((row) => /^President of the United States(?:\/|$)/i.test(row[index["contest name"]]));
    if (!president.length) throw new Error(`${member.name} has no President rows`);
    const county = countyFromMember(member.name); const expected = baseline.get(`${archiveSpec.year}|${county}`);
    if (!expected) throw new Error(`${member.name} has no JSON baseline county ${county}`);
    const registration = new Set(president.map((row) => number(row[index["registered voters"]])));
    const ballots = new Set(president.map((row) => number(row[index["ballots cast"]])));
    if (registration.size !== 1 || ballots.size !== 1) throw new Error(`${member.name} has inconsistent President registration/ballots fields`);
    const actual = { dem: 0, rep: 0, other: 0, total: 0 };
    for (const row of president) { const votes = number(row[index["total votes"]]); const choice = row[index["choice name"]]; actual[archiveSpec.dem.test(choice) ? "dem" : archiveSpec.rep.test(choice) ? "rep" : "other"] += votes; actual.total += votes; }
    for (const key of Object.keys(actual)) if (actual[key] !== expected[key]) throw new Error(`${archiveSpec.year} ${county} ${key} mismatch: archive ${actual[key]}, JSON ${expected[key]}`);
    const registeredVoters = [...registration][0], ballotsCast = [...ballots][0];
    leads.push({ year: archiveSpec.year, county, registeredVoters, ballotsCast, presidentVotes: actual.total, sourceUrl: archiveSpec.url, sourceMember: member.name });
    totals.registeredVoters += registeredVoters; totals.ballotsCast += ballotsCast; totals.dem += actual.dem; totals.rep += actual.rep; totals.other += actual.other; totals.total += actual.total;
  }
  review.push({ year: archiveSpec.year, sourceUrl: archiveSpec.url, localFile: archiveSpec.path, bytes: archiveSpec.bytes, sha256: archiveSpec.sha256, countySummaryArchives: members.length, schema: ["contest name", "choice name", "total votes", "registered voters", "ballots cast"], totals, caveat: "County summary fields are repeated for each contest candidate. Ballots cast is election-level county context but the archive does not prove statewide denominator timing or reconcile it to active EAC turnout; retain as a lead only." });
}
const leadHeaders = ["state", "election_year", "county", "registered_voters", "ballots_cast", "president_votes", "source_url", "source_member"];
const quote = (value) => /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : value;
const leadValue = (row, key) => ({
  state: "GA",
  election_year: row.year,
  county: row.county,
  registered_voters: row.registeredVoters,
  ballots_cast: row.ballotsCast,
  president_votes: row.presidentVotes,
  source_url: row.sourceUrl,
  source_member: row.sourceMember,
}[key]);
await writeFile("data/ga-historical-registration-turnout-leads.csv", `${[leadHeaders.join(","), ...leads.map((row) => leadHeaders.map((key) => quote(leadValue(row, key))).join(","))].join("\n")}\n`);
await writeFile("data/ga-historical-archive-source-review.json", `${JSON.stringify({ generatedBy: "scripts/normalize-ga-historical-archive-registration.mjs", sourceAuthority: "Georgia Secretary of State", rows: leads.length, archives: review, turnoutCaveat: "These historical county registration and ballots-cast fields are not activated as turnout because the archive alone does not establish compatibility with EAC reporting definitions or registration timing." }, null, 2)}\n`);
console.log(JSON.stringify({ rows: leads.length, archives: review.map(({ year, totals }) => ({ year, totals })) }, null, 2));
