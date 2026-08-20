import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const RESOURCE_KEY = "ca3ba28c-538b-4cb2-a312-ec2421293ed6";
const MODEL_ID = 594856;
const AS_OF_DATE = "2024-11-01";
const REPORT_URL = "https://datahub.sos.ri.gov/RegisteredVoter.aspx/";
const QUERY_URL = "https://wabi-us-gov-virginia-api.analysis.usgovcloudapi.net/public/reports/querydata?synchronous=true";
const RAW_PATH = "data/ri-2024-11-sos-datahub-registration-query.json";
const OUTPUT_PATH = "data/ri-2024-11-sos-datahub-registration-precinct.csv";
const SUMMARY_PATH = "data/ri-2024-11-sos-datahub-registration-reconciliation.json";

const EXPECTED = Object.freeze({ rawBytes: 813618, rawSha256: "729050b4d504b3ebb01893d2996b80453e33aadef1ef9738de2ee55a789f2cc4", rows: 3838, cityTowns: 39, active: 732308, inactive: 57201, pending: 3360, total: 792869, eacRegistered: 792075 });
const VALID_STATUSES = new Set(["Active", "Inactive", "Pending"]);

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function csvCell(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function column(source, property, name) { return { Column: { Expression: { SourceRef: { Source: source } }, Property: property }, Name: name }; }
function aggregate(source, property, name) { return { Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: source } }, Property: property } }, Function: 0 }, Name: name }; }
function inFilter(source, property, values) { return { Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: source } }, Property: property } }], Values: values.map((value) => [{ Literal: { Value: value } }]) } } }; }

const QUERY = Object.freeze({
  version: "1.0.0",
  queries: [{
    Query: { Commands: [{ SemanticQueryDataShapeCommand: {
      Query: { Version: 2, From: [{ Name: "c", Entity: "CumulativeVoterRegistrationData", Type: 0 }], Select: [
        column("c", "Precinct_District_xwalk.City", "cityTown"),
        column("c", "Precinct_District_xwalk.PRECINCT", "precinct"),
        column("c", "PARTY", "party"),
        column("c", "STATUS", "status"),
        aggregate("c", "Voter Registration ", "registeredVoters"),
      ], Where: [
        inFilter("c", "Date ", ["datetime'2024-11-01T00:00:00'"]),
        inFilter("c", "Precinct_District_xwalk.DUP_KeepRemoveDirection", ["'ignore'", "'keep'"]),
        inFilter("c", "Precinct_District_xwalk.DUP_KeepRemoveDirection.1", ["'ignore'", "'keep'"]),
      ], OrderBy: [
        { Direction: 1, Expression: { Column: { Expression: { SourceRef: { Source: "c" } }, Property: "Precinct_District_xwalk.City" } } },
        { Direction: 1, Expression: { Column: { Expression: { SourceRef: { Source: "c" } }, Property: "Precinct_District_xwalk.PRECINCT" } } },
      ] },
      Binding: { Primary: { Groupings: [{ Projections: [0, 1, 2, 3, 4] }] }, DataReduction: { DataVolume: 6, Primary: { Window: { Count: 10000 } } }, Version: 1 },
      ExecutionMetricsKind: 1,
    } }] },
    ApplicationContext: { DatasetId: "22953ce3-6fdb-46b4-a4a6-06e0cfe79c87" },
  }],
  cancelQueries: [],
  modelId: MODEL_ID,
});

function decodeValue(value, descriptor, dictionaries) {
  if (value == null || !descriptor?.DN) return value;
  return dictionaries[descriptor.DN]?.[value] ?? value;
}

function decodeRows(raw) {
  const data = raw.results?.[0]?.result?.data;
  const descriptor = data?.descriptor?.Select;
  const phase = data?.dsr?.DS?.[0]?.PH?.[0]?.DM0;
  const dictionaries = data?.dsr?.DS?.[0]?.ValueDicts ?? {};
  if (!Array.isArray(descriptor) || !Array.isArray(phase) || descriptor.length !== 5) throw new Error("Unexpected Rhode Island Power BI query response schema");
  const dictionaryByValue = new Map((phase[0]?.S ?? []).map((column) => [column.N, column.DN]));
  const previous = Array(descriptor.length).fill(null);
  return phase.map((entry) => {
    let cursor = 0;
    const reuseMask = entry.R ?? 0;
    for (let index = 0; index < descriptor.length; index += 1) {
      if ((reuseMask & (1 << index)) === 0) previous[index] = entry.C?.[cursor++];
    }
    return previous.map((value, index) => decodeValue(value, { DN: dictionaryByValue.get(descriptor[index].Value) }, dictionaries));
  });
}

async function collectRaw() {
  const response = await fetch(QUERY_URL, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", ActivityId: "3bc16e16-ae2c-4390-a2ed-dca0b3dce3dd", RequestId: "5fe9079e-0b78-45c0-98bb-dc00bd7b5c7c", "X-PowerBI-ResourceKey": RESOURCE_KEY }, body: JSON.stringify(QUERY) });
  if (!response.ok) throw new Error(`Rhode Island Data Hub query failed: ${response.status}`);
  return `${JSON.stringify(await response.json(), null, 2)}\n`;
}

const collect = process.argv.includes("--collect");
const check = process.argv.includes("--check");
if (collect && check) throw new Error("Use either --collect or --check, not both");
const rawText = collect ? await collectRaw() : await readFile(RAW_PATH, "utf8");
const rawBytes = Buffer.byteLength(rawText);
const rawHash = sha256(rawText);
if (EXPECTED.rawBytes !== null && (rawBytes !== EXPECTED.rawBytes || rawHash !== EXPECTED.rawSha256)) throw new Error("Rhode Island Data Hub raw response drifted from its pinned byte/SHA-256 identity");
if (collect) await writeFile(RAW_PATH, rawText, "utf8");

const records = decodeRows(JSON.parse(rawText)).map(([cityTown, precinct, party, status, registeredVoters]) => ({ cityTown: String(cityTown ?? "").trim(), precinct: String(precinct ?? "").trim(), party: String(party ?? "").trim(), status: String(status ?? "").trim(), registeredVoters: Number(registeredVoters) }));
if (records.some((row) => !row.cityTown || !row.precinct || !VALID_STATUSES.has(row.status) || !Number.isSafeInteger(row.registeredVoters) || row.registeredVoters < 0)) throw new Error("Rhode Island Data Hub response includes an invalid city/town, precinct, status, or registration value");
const recordIdentities = new Set(records.map((row) => [row.cityTown, row.precinct, row.party, row.status].join("\u0000")));
if (recordIdentities.size !== records.length) throw new Error("Rhode Island Data Hub response contains duplicate city/town, precinct, party, and status identities");
const totalsByStatus = Object.fromEntries(["Active", "Inactive", "Pending"].map((status) => [status, records.filter((row) => row.status === status).reduce((sum, row) => sum + row.registeredVoters, 0)]));
const total = Object.values(totalsByStatus).reduce((sum, value) => sum + value, 0);
const cityTowns = new Set(records.map((row) => row.cityTown));
if (EXPECTED.rows !== null && (records.length !== EXPECTED.rows || cityTowns.size !== EXPECTED.cityTowns || totalsByStatus.Active !== EXPECTED.active || totalsByStatus.Inactive !== EXPECTED.inactive || totalsByStatus.Pending !== EXPECTED.pending || total !== EXPECTED.total)) throw new Error("Rhode Island Data Hub derived registration totals drifted from reviewed expectations");

const headers = ["state", "as_of_date", "city_town", "precinct", "party", "status", "registered_voters", "source_id", "source_url", "source_method"];
const outputRows = records.sort((left, right) => left.cityTown.localeCompare(right.cityTown) || left.precinct.localeCompare(right.precinct) || left.status.localeCompare(right.status) || left.party.localeCompare(right.party)).map((row) => ({ state: "RI", as_of_date: AS_OF_DATE, city_town: row.cityTown, precinct: row.precinct, party: row.party, status: row.status, registered_voters: row.registeredVoters, source_id: "ri-2024-11-sos-datahub-registration", source_url: REPORT_URL, source_method: "officialPowerBiQueryData" }));
const eacRows = (await readFile("data/eac-2024-state-turnout/ri-2024-eac-turnout.csv", "utf8")).trim().split(/\r?\n/).slice(1).map((line) => { const cells = line.split(","); return { name: cells[3], registered: Number(cells[8]) }; });
if (eacRows.length !== EXPECTED.cityTowns || eacRows.some((row) => !row.name || !Number.isSafeInteger(row.registered) || row.registered < 0) || eacRows.reduce((sum, row) => sum + row.registered, 0) !== EXPECTED.eacRegistered) throw new Error("Rhode Island EAC comparison rows drifted from reviewed expectations");
const cityTotals = [...cityTowns].sort().map((cityTown) => ({ cityTown, dataHub: records.filter((row) => row.cityTown === cityTown).reduce((sum, row) => sum + row.registeredVoters, 0) }));
const canonical = (value) => value.toUpperCase().replace(/\b(CITY|TOWN)\b/g, "").replace(/[^A-Z0-9]/g, "");
const eacByCity = new Map(eacRows.map((row) => [canonical(row.name), row]));
if (eacByCity.size !== eacRows.length) throw new Error("Rhode Island EAC comparison rows contain duplicate canonical city/town identities");
const reconciliation = cityTotals.map((row) => ({ cityTown: row.cityTown, dataHubRegistered: row.dataHub, eacRegistered: eacByCity.get(canonical(row.cityTown))?.registered ?? null, delta: eacByCity.has(canonical(row.cityTown)) ? row.dataHub - eacByCity.get(canonical(row.cityTown)).registered : null }));
if (reconciliation.length !== eacRows.length || reconciliation.some((row) => row.eacRegistered === null) || new Set(reconciliation.map((row) => canonical(row.cityTown))).size !== eacByCity.size) throw new Error("Rhode Island Data Hub city/town labels did not resolve one-to-one to all EAC rows");

const csvText = `${[headers.join(","), ...outputRows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")}\n`;
const summaryText = `${JSON.stringify({ generatedBy: "scripts/normalize-ri-registration-datahub.mjs", sourceAuthority: "Rhode Island Department of State, Secretary of State Data Hub", reportUrl: REPORT_URL, queryEndpoint: QUERY_URL, resourceKey: RESOURCE_KEY, modelId: MODEL_ID, asOfDate: AS_OF_DATE, semantics: "The official report's CumulativeVoterRegistrationData rows are grouped by city/town, precinct, party, and STATUS. Report duplicate-disposition filters are reproduced exactly. This is a registration denominator lead only; it contains no compatible ballots-cast or voter-participation field and does not replace active EAC turnout.", rawArtifact: { path: RAW_PATH, bytes: rawBytes, sha256: rawHash, request: QUERY }, output: { path: OUTPUT_PATH, rows: outputRows.length, cityTowns: cityTowns.size, totalsByStatus, total }, eacComparison: { eacRows: eacRows.length, eacRegistered: EXPECTED.eacRegistered, dataHubAllStatusRegistered: total, delta: total - EXPECTED.eacRegistered, rows: reconciliation }, caveat: "2024-11-01 is the closest monthly report snapshot to the November 5, 2024 General Election. The report's default page filters to Active status, but this artifact retains Active, Inactive, and Pending separately; no status combination is represented as election turnout." }, null, 2)}\n`;
if (check) {
  const [currentCsv, currentSummary] = await Promise.all([readFile(OUTPUT_PATH, "utf8"), readFile(SUMMARY_PATH, "utf8")]);
  if (currentCsv !== csvText || currentSummary !== summaryText) throw new Error("Rhode Island Data Hub generated artifacts are stale; rerun the normalizer");
  console.log("Rhode Island Data Hub registration artifacts are current.");
} else {
  await mkdir("data", { recursive: true });
  await Promise.all([writeFile(OUTPUT_PATH, csvText, "utf8"), writeFile(SUMMARY_PATH, summaryText, "utf8")]);
  console.log(JSON.stringify({ rawBytes, rawHash, rows: outputRows.length, cityTowns: cityTowns.size, totalsByStatus, total, eacDelta: total - EXPECTED.eacRegistered }, null, 2));
}
