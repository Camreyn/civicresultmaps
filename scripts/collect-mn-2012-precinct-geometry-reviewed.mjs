import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";
import XLSX from "xlsx";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find((arg) => arg.startsWith("--root="))?.slice(7) ?? process.cwd());
const offline = args.includes("--offline");
const retrievedAt = args.find((arg) => arg.startsWith("--retrieved-at="))?.slice(15);
const REVIEWED_AT = "2026-08-06T22:26:35.991Z";
if (retrievedAt !== REVIEWED_AT) throw new Error(`Use --retrieved-at=${REVIEWED_AT}.`);

const STATE = "MN";
const ELECTION_ID = "2012-11-06-general";
const BASE = `data/precinct-geometry/${STATE}/${ELECTION_ID}`;
const RAW = `${BASE}/raw`;
const NORMALIZED = `${BASE}/normalized/mn-2012-11-06-precincts.geojson.gz`;
const CROSSWALK = `${BASE}/crosswalk/mn-2012-11-06-vtdid-to-geometry.json`;
const EVIDENCE = `${BASE}/source-evidence.json`;
const REPORT = `${BASE}/reports/mn-2012-11-06-precinct-geometry-report.json`;
const MANIFEST = `${BASE}/manifest.json`;
const sourcePath = (relative) => path.join(ROOT, relative);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const write = (relative, value) => { const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value); mkdirSync(path.dirname(sourcePath(relative)), { recursive: true }); writeFileSync(sourcePath(relative), bytes); return { artifact: relative, byteCount: bytes.length, sha256: digest(bytes) }; };
const immutable = (relative, bytes) => { const target = sourcePath(relative); if (existsSync(target)) { if (!readFileSync(target).equals(bytes)) throw new Error(`Refusing to overwrite pinned source ${relative}`); return; } mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes); };
const numeric = (value, label) => { const result = Number(String(value ?? 0).replace(/,/g, "").trim()); if (!Number.isFinite(result)) throw new Error(`Invalid numeric value for ${label}`); return result; };
const required = ["USPRSR", "USPRSDFL", "USPRSLIB", "USPRSSWP", "USPRSCP", "USPRSCG", "USPRSGP", "USPRSGR", "USPRSSL", "USPRSJP", "USPRSWI", "USPRSTOTAL", "TOTVOTING"];
const identityWhitelist = ["VTD", "COUNTYNAME", "COUNTYCODE", "COUNTYFIPS", "PCTCODE", "PCTNAME", "SHORTLABEL", "MCDNAME", "WARD", "CONGDIST", "SENDIST", "LEGDIST", "CTYCOMDIST", "JUDDIST", "SOILWDIST", "PARKDIST", "HOSPDIST"];
const LCC_DISCLAIMER = "LCC-GIS makes no representation or warranties, express or implied, with respect to the reuse of data provided herewith, regardless of its format or the means of its transmission. There is no guarantee or representation to the user as to the accuracy, currency, suitability, or reliability of this data for any purpose. The user accepts the data 'as is', and assumes all risks associated with its use. By accepting this data, the user agrees not to transmit this data or provide access to it or any part of it to another party unless the user shall include with the data a copy of this disclaimer.";
const DISTRIBUTION_LIABILITY = "The Geographic Information System (GIS) Data to which this notice is attached are made available pursuant to the Minnesota Government Data Practices Act (Minnesota Statutes Chapter 13). THE GIS DATA ARE PROVIDED TO YOU AS IS AND WITHOUT ANY WARRANTY AS TO THEIR PERFORMANCE, MERCHANTABILITY, OR FITNESS FOR ANY PARTICULAR PURPOSE. The GIS Data were developed by the LCC - GIS Office for its own internal business purposes. The LCC - GIS Office does not represent or warrant that the GIS Data or the data documentation are error-free, complete, current, or accurate. You are responsible for any consequences resulting from your use of the GIS Data or your reliance on the GIS Data. You should consult the data documentation for this particular GIS Data to determine the limitations of the GIS Data and the precision with which the GIS Data may depict distance, direction, location, or other geographic features. If you transmit or provide the GIS Data (or any portion of it) to another user, the GIS Data must include a copy of this disclaimer.";
const sources = [
  { id: "lcc-catalog", path: `${RAW}/lcc-gis/download-catalog.html`, url: "https://gis.lcc.mn.gov/html/download.html", byteCount: 122382, sha256: "305f22b9180567e1d077d0cf4c8dbe6ec0cba94f5effa17cab583909058dce23", format: "LCC-GIS official download catalog HTML" },
  { id: "lcc-election-metadata", path: `${RAW}/lcc-gis/elec12-metadata.html`, url: "https://gis.lcc.mn.gov/metadata/elec12.htm", byteCount: 80372, sha256: "777b628368c68f7274a89e34fe1d803934e5f928ef0043fa79908b9719a6bb04", format: "LCC-GIS official 2012 election-results metadata HTML" },
  { id: "lcc-election-results-archive", path: `${RAW}/lcc-gis/2012generalresults.zip`, url: "https://gis.lcc.mn.gov/data/elections/2012generalresults.zip", byteCount: 10597465, sha256: "da4d32bda959fe27f1da022c65919bc41cae58e3e3e2773f7cef2d1227dd369b", format: "LCC-GIS official statewide 2012 election-results shapefile ZIP", lastModified: "Thu, 24 Jan 2013 19:57:04 GMT", etag: "\"a1b459-4d40e36fca400\"" },
  { id: "sos-workbook-page", path: `${RAW}/mn-sos/2012-precinct-results-page.html`, url: "https://sos.mn.gov/elections-voting/election-results/2012/2012-general-election-results/2012-precinct-results-spreadsheet/", byteCount: 42973, sha256: "b0b290293b3b9e0e34572882979293dcb112b4315c347955cbc6f7a09d8dd8c5", format: "Minnesota SOS official precinct-results documentation HTML" },
  { id: "sos-canvass-page", path: `${RAW}/mn-sos/2012-state-canvassing-board-page.html`, url: "https://sos.mn.gov/elections-voting/election-results/2012/2012-general-election-results/2012-state-canvassing-board-general-election/", byteCount: 42955, sha256: "db7a65f34db46b97840e42cb9698627f8abbad98ddf233f2336f20007d9c52af", format: "Minnesota SOS official 2012 canvass documentation HTML" },
  { id: "sos-certified-workbook", path: `${RAW}/mn-sos/2012-general-federal-state-results-by-precinct-official-post-recounts.xlsx`, url: "https://sos.mn.gov/media/1450/2012mngeneralelectionresults_official_postrecounts.xlsx", byteCount: 1705946, sha256: "9a7530cfef9e44f8663c62bf5786418b4b078d81fd13e2d130fbd8ef305ee376", format: "Minnesota SOS certified 2012 general precinct workbook" },
];
async function retain(source) {
  if (!existsSync(sourcePath(source.path))) {
    if (offline) throw new Error(`Offline replay requires ${source.path}`);
    const response = await fetch(source.url, { headers: { "User-Agent": "CivicResultMaps Minnesota 2012 reviewed precinct geometry collector" } });
    if (!response.ok) throw new Error(`HTTP ${response.status} retrieving ${source.url}`);
    if (source.lastModified && response.headers.get("last-modified") !== source.lastModified) throw new Error("Official archive Last-Modified drifted.");
    if (source.etag && response.headers.get("etag") !== source.etag) throw new Error("Official archive ETag drifted.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== source.byteCount || digest(bytes) !== source.sha256) throw new Error(`Pinned source mismatch for ${source.path}`);
    immutable(source.path, bytes);
  }
  const bytes = readFileSync(sourcePath(source.path));
  if (bytes.length !== source.byteCount || digest(bytes) !== source.sha256) throw new Error(`Pinned source mismatch for ${source.path}`);
  return { ...source, bytes };
}
const retained = Object.fromEntries((await Promise.all(sources.map(async (source) => [source.id, await retain(source)]))));
const catalog = retained["lcc-catalog"].bytes.toString("utf8");
const metadataText = retained["lcc-election-metadata"].bytes.toString("utf8");
if (!catalog.includes(LCC_DISCLAIMER) || !metadataText.includes(DISTRIBUTION_LIABILITY)) throw new Error("Retained LCC terms evidence drifted.");
if (!/2012generalresults\.zip/i.test(catalog)) throw new Error("LCC catalog no longer declares the official 2012 election-results archive.");
const zip = await JSZip.loadAsync(retained["lcc-election-results-archive"].bytes);
const members = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
const dbfMember = members.find((name) => /\.dbf$/i.test(name));
const shpMember = members.find((name) => /\.shp$/i.test(name));
if (!dbfMember || !shpMember || members.filter((name) => /\.dbf$/i.test(name)).length !== 1) throw new Error("Expected one shapefile layer in the official archive.");
const layer = dbfMember.replace(/\.dbf$/i, "");
for (const extension of [".dbf", ".prj", ".shp", ".shx"]) if (!members.includes(layer + extension)) throw new Error(`Archive lacks ${layer + extension}`);
const dbf = await zip.file(dbfMember).async("nodebuffer");
const headerLength = dbf.readUInt16LE(8); const dbfFields = [];
for (let offset = 32; offset < headerLength - 1; offset += 32) { const field = dbf.subarray(offset, offset + 11).toString("ascii").replace(/\0.*/, "").trim(); if (field) dbfFields.push(field); }
for (const field of ["VTD", "COUNTYFIPS", "PCTCODE", "PCTNAME", ...required]) if (!dbfFields.includes(field)) throw new Error(`Official archive lacks ${field}`);
globalThis.self ??= globalThis;
const { default: shp } = await import("shpjs");
const collection = await shp(retained["lcc-election-results-archive"].bytes);
if (collection?.type !== "FeatureCollection" || collection.features.length !== 4102) throw new Error("Expected 4,102 official election-result features.");
const workbook = XLSX.read(retained["sos-certified-workbook"].bytes, { type: "buffer" });
if (JSON.stringify(workbook.SheetNames) !== JSON.stringify(["Results", "Fields", "Counties", "Districts", "Notes"])) throw new Error("Unexpected SOS workbook sheets.");
const resultRows = XLSX.utils.sheet_to_json(workbook.Sheets.Results, { defval: null, raw: false }).filter((row) => /^27\d{7}$/.test(String(row.VTDID ?? "").trim()));
if (resultRows.length !== 4102 || new Set(resultRows.map((row) => String(row.VTDID))).size !== 4102) throw new Error("Certified VTDID universe drifted.");
const resultById = new Map(resultRows.map((row) => [String(row.VTDID), row]));
const geometryById = new Map(); const geometryKinds = {}; const pctNameMismatches = [];
for (const [index, feature] of collection.features.entries()) {
  const properties = feature.properties ?? {}; const id = String(properties.VTD ?? "").trim(); const county = String(properties.COUNTYFIPS ?? "").trim().padStart(3, "0"); const precinct = String(properties.PCTCODE ?? "").trim().padStart(4, "0");
  if (!/^27\d{7}$/.test(id) || id !== `27${county}${precinct}` || geometryById.has(id)) throw new Error(`Invalid or duplicate official VTD ${id || index}`);
  if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) throw new Error(`Unsupported geometry type for ${id}`);
  geometryKinds[feature.geometry.type] = (geometryKinds[feature.geometry.type] ?? 0) + 1; geometryById.set(id, feature);
  const result = resultById.get(id); if (!result) throw new Error(`Geometry-only VTD ${id}`);
  if (String(result.PCTCODE ?? "").trim().padStart(4, "0") !== precinct) throw new Error(`PCTCODE mismatch for ${id}`);
  for (const field of required) if (numeric(properties[field], `${id}.${field}`) !== numeric(result[field], `${id}.${field}`)) throw new Error(`Certified result-field mismatch for ${id}.${field}`);
  if (String(properties.PCTNAME ?? "").trim() !== String(result.PCTNAME ?? "").trim()) pctNameMismatches.push(id);
}
const resultOnly = [...resultById.keys()].filter((id) => !geometryById.has(id)).sort();
if (resultOnly.length || geometryById.size !== 4102 || geometryKinds.Polygon !== 3746 || geometryKinds.MultiPolygon !== 356 || pctNameMismatches.length !== 2) throw new Error("Reviewed Minnesota 2012 identity contract drifted.");
const totals = Object.fromEntries(required.map((field) => [field, resultRows.reduce((sum, row) => sum + numeric(row[field], field), 0)]));
if (totals.USPRSTOTAL !== 2936561 || totals.USPRSR !== 1320225 || totals.USPRSDFL !== 1546167 || totals.TOTVOTING !== 2950780 || totals.USPRSTOTAL - totals.USPRSR - totals.USPRSDFL !== 70169) throw new Error("Certified statewide totals drifted.");
const zeroIds = resultRows.filter((row) => numeric(row.USPRSTOTAL, "USPRSTOTAL") === 0).map((row) => String(row.VTDID)).sort();
if (zeroIds.length !== 33) throw new Error("Zero-vote unit count drifted.");
const ids = [...geometryById.keys()].sort();
const features = ids.map((id) => { const source = geometryById.get(id); const p = source.properties; const clean = Object.fromEntries(identityWhitelist.filter((field) => p[field] !== undefined).map((field) => [field, p[field]])); return { type: "Feature", properties: { CRM_FEATURE_ID: id, CRM_PARENT_GEOID: `27${String(p.COUNTYFIPS).padStart(3, "0")}`, CRM_NATIVE_ID: id, CRM_PRECINCT_CODE: String(p.PCTCODE).padStart(4, "0"), CRM_DISPLAY_NAME: String(p.PCTNAME), CRM_SOURCE_PROPERTIES: clean }, geometry: source.geometry }; });
const parents = [...new Set(features.map((feature) => feature.properties.CRM_PARENT_GEOID))].sort(); if (parents.length !== 87) throw new Error("County parent coverage drifted.");
const resultTotals = (rows) => ({ totalPeopleVoting: rows.reduce((n, row) => n + numeric(row.TOTVOTING, "TOTVOTING"), 0), totalVotes: rows.reduce((n, row) => n + numeric(row.USPRSTOTAL, "USPRSTOTAL"), 0), romney: rows.reduce((n, row) => n + numeric(row.USPRSR, "USPRSR"), 0), obama: rows.reduce((n, row) => n + numeric(row.USPRSDFL, "USPRSDFL"), 0), other: rows.reduce((n, row) => n + numeric(row.USPRSTOTAL, "USPRSTOTAL") - numeric(row.USPRSR, "USPRSR") - numeric(row.USPRSDFL, "USPRSDFL"), 0) });
const zeroDeltas = (value) => Object.fromEntries(Object.keys(value).map((key) => [key, 0]));
const scopes = parents.map((parentGeoid) => { const value = resultTotals(resultRows.filter((row) => String(row.VTDID).slice(0, 5) === parentGeoid)); return { scopeType: "parent", scopeId: parentGeoid, resultTotals: value, mappedTotals: { ...value }, deltas: zeroDeltas(value) }; });
const statewide = resultTotals(resultRows); scopes.push({ scopeType: "state", scopeId: STATE, resultTotals: statewide, mappedTotals: { ...statewide }, deltas: zeroDeltas(statewide) });
const rows = ids.map((id) => { const result = resultById.get(id); const parentGeoid = id.slice(0, 5); return { resultUnitCode: `reporting:MN:${ELECTION_ID}:precinct:${parentGeoid}:${id}`, sourceUnitId: id, sourceDisplayName: [result.COUNTYNAME, result.MCDNAME, `${result.PCTNAME} (${String(result.PCTCODE).padStart(4, "0")})`].map((value) => String(value ?? "").trim()).join(" / "), parentGeoid, reportingGrain: "precinct", isGeographic: true, relationships: [{ sourceFeatureId: `${parentGeoid}|${id}`, relationshipType: "one_to_one", matchMethod: "exact_official_id", reviewStatus: "reviewed", confidence: "high", note: "Exact official VTD, PCTCODE, county parent, and all presidential/TOTVOTING fields agree with the certified SOS workbook. PCTNAME is display-only and has two retained nonbinding source-text mismatches." }] }; });
const normalized = write(NORMALIZED, gzipSync(Buffer.from(JSON.stringify({ type: "FeatureCollection", features }) + "\n"), { level: 9, mtime: 0 }));
const crosswalk = { schemaVersion: 1, manifestId: "mn-2012-11-06-lcc-2012generalresults-v1", state: STATE, electionId: ELECTION_ID, geographyLevel: "precinct", resultSourceId: "mn-2012-general-precinct-results", generatedAt: retrievedAt, rows, reconciliation: { status: "passed", scopes } };
const crosswalkOutput = write(CROSSWALK, crosswalk);
const sourceArtifacts = sources.map(({ id, path: localArtifactPath, url, byteCount, sha256, format, lastModified, etag }) => ({ id, localArtifactPath, url, byteCount, sha256, format, reportingGrain: id === "sos-certified-workbook" ? "VTDID-keyed certified precinct results" : id === "lcc-election-results-archive" ? "2012 election-result polygons with source comparison fields" : "official documentation or catalog", ...(lastModified ? { httpMetadata: { lastModified, etag } } : {}) }));
const caveats = ["The SOS certified workbook is the sole authority for result values; LCC election-result attributes are retained only for exact source reconciliation.", "Two source PCTNAME values differ from the certified workbook. They are display-only, retained in evidence, and do not affect exact VTDID/PCTCODE/county-parent identity.", "LCC-GIS metadata contains historical spelling/field-description typos; such prose is nonbinding and is not used for identity or vote assignment.", "No election values are emitted in normalized geometry or crosswalk rows.", "Public delivery remains null pending separately authorized public data activation and delivery review."];
const evidence = { schemaVersion: 1, id: "mn-2012-reviewed-official-precinct-geometry", state: STATE, election: { id: ELECTION_ID, date: "2012-11-06", year: 2012, type: "general", office: "president" }, authority: "Minnesota Legislative Coordinating Commission Geographic Information Services; Office of the Minnesota Secretary of State Elections Division", retrievedAt, artifacts: sourceArtifacts, sourceTerms: { catalogArtifactId: "lcc-catalog", metadataArtifactId: "lcc-election-metadata", catalogDisclaimer: LCC_DISCLAIMER, datasetDisclaimer: DISTRIBUTION_LIABILITY, redistributionRequirement: "Any transmitted GIS data must include a copy of the applicable disclaimer." }, boundaryVintageEvidence: { catalogArchiveUrl: retained["lcc-election-results-archive"].url, catalogExplicitlyLinksArchive: true, archiveLastModified: retained["lcc-election-results-archive"].lastModified, archiveEtag: retained["lcc-election-results-archive"].etag, status: "election_date_confirmed", caveat: "The official LCC catalog labels this as Election results 2012; the exact statewide 2012 result identity and field reconciliation establishes election applicability." }, resultIdentity: { sourceId: "mn-2012-general-precinct-results", certifiedPresidentResultUnits: 4102, countyParents: 87, zeroVoteContextIdentities: 33, certifiedVintage: "Certified by the State Canvassing Board November 27, 2012, except recount districts certified December 4, 2012; retained workbook Notes sheet." }, geometry: { sourceFeatures: 4102, geometryKinds, archiveMembers: members, dbfFieldNames: dbfFields, exactVtdSourceKeys: 4102 }, exactIdComparison: { exactVtdidMatches: 4102, geometryOnly: [], resultOnly, exactPCTCODEMatches: 4102, nonbindingPCTNAMEMismatches: pctNameMismatches, exactCertifiedFieldMatches: required, fieldComparison: "every VTD and required field is numerically equal" }, certifiedResultTotals: totals, caveats };
const evidenceOutput = write(EVIDENCE, evidence);
const publicBlocker = "Geometry and exact result identity are reviewed, but public delivery remains null until separately authorized production result activation and immutable delivery review.";
const manifest = { schemaVersion: 1, id: crosswalk.manifestId, state: STATE, election: evidence.election, geography: { level: "precinct", parentLevel: "county", boundaryVintage: "Official LCC-GIS 2012generalresults election-results archive, Last-Modified January 24, 2013", vintageStatus: "election_date_confirmed", derivationMethod: "official_export", nativeCrs: await zip.file(layer + ".prj").async("string"), servedCrs: "EPSG:4326" }, source: { authority: evidence.authority, url: retained["lcc-election-results-archive"].url, retrievedAt, artifact: evidenceOutput.artifact, sha256: evidenceOutput.sha256, byteCount: evidenceOutput.byteCount, format: "precinct-source-evidence+json", licenseOrTerms: `${LCC_DISCLAIMER} ${DISTRIBUTION_LIABILITY}` }, normalization: { script: "scripts/collect-mn-2012-precinct-geometry-reviewed.mjs", sourceCrs: (await zip.file(layer + ".prj").async("string")).trim(), servedCrs: "EPSG:4326", artifact: normalized.artifact, sha256: normalized.sha256, byteCount: normalized.byteCount, featureCount: 4102, sourceFeatureIdFields: ["CRM_FEATURE_ID"], parentIdFields: ["CRM_PARENT_GEOID"] }, crosswalk: { status: "reviewed", resultSourceId: crosswalk.resultSourceId, artifact: crosswalkOutput.artifact, sha256: crosswalkOutput.sha256, byteCount: crosswalkOutput.byteCount, resultUnits: 4102, colorableResultUnits: 4102, matchedResultUnits: 4102, unmatchedResultUnits: 0, nonGeographicResultUnits: 0, sourceAliasResultUnits: 0, relationships: { oneToOne: 4102, oneToMany: 0, manyToOne: 0, unmatched: 0, nonGeographic: 0, sourceAlias: 0, pendingReview: 0 }, methods: ["exact_official_id"] }, validation: { status: "blocked", geometryValid: true, rowLevelRenderingSafe: false, parentTotalsReconciled: true, errors: [publicBlocker], warnings: ["All 4,102 VTDIDs are reviewed exact one-to-one relationships across 87 county parents and statewide.", "The 33 zero-presidential-vote VTDs remain geographic reporting units."] }, delivery: null, caveats: [...caveats, publicBlocker] };
const manifestOutput = write(MANIFEST, manifest);
const report = { schemaVersion: 1, state: STATE, electionId: ELECTION_ID, generatedAt: retrievedAt, disposition: "blocked_public_result_activation", source: { archiveUrl: retained["lcc-election-results-archive"].url, archiveArtifact: retained["lcc-election-results-archive"].path, archiveSha256: retained["lcc-election-results-archive"].sha256, archiveByteCount: retained["lcc-election-results-archive"].byteCount, layer, featureCount: 4102, geometryKinds, coveredParentCount: 87 }, results: { authority: "Minnesota Secretary of State", artifact: retained["sos-certified-workbook"].path, precinctRows: 4102, zeroPresidentialVoteRows: 33, totals }, identityReview: evidence.exactIdComparison, crosswalk: { status: "reviewed", oneToOne: 4102, pending: 0, unmatched: 0, reconciliationStatus: "passed", parentScopes: 87, statewideDeltas: zeroDeltas(statewide) }, blockers: [publicBlocker], artifacts: { sourceEvidence: evidenceOutput, normalized, crosswalk: crosswalkOutput, manifest: manifestOutput } };
write(REPORT, report);
console.log(JSON.stringify(report, null, 2));
