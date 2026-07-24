import { readFile, writeFile } from "node:fs/promises";
import { resolveJurisdictionTag } from "../src/lib/jurisdiction-tags.ts";

const registryPath = "data/admin-source-packages.json";
const matcherPath = "data/equipment-usage-matchers.json";
const catalogPath = "data/equipment-catalog.json";
const outputPath = "data/equipment-usage-index.json";

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows.filter((candidate) => candidate.some((value) => value.trim()));
  return values.map((valuesRow) => Object.fromEntries(headers.map((header, index) => [header, valuesRow[index] ?? ""])));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function systemNameTokens(value) {
  return String(value ?? "")
    .split(/\s+\+\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function mapReference(row, resolution) {
  const state = String(row.state ?? "").toUpperCase();
  const base = `/?state=${encodeURIComponent(state)}&year=${encodeURIComponent(row.electionYear || "2024")}&tab=map&mode=equipment`;
  if (resolution.jurisdictionTag?.startsWith("county:")) {
    const fips = resolution.jurisdictionTag.slice("county:".length);
    return {
      scope: "jurisdiction",
      href: `${base}&fips=${encodeURIComponent(fips)}`,
      label: "Open this jurisdiction on the equipment map",
      caveat: null,
    };
  }

  if (state) {
    return {
      scope: "state",
      href: base,
      label: "Open the state equipment map",
      caveat: `This ${row.level || "reported"} row could not be pinned to current county geometry (${resolution.reason.replaceAll("_", " ")}); the link opens the state view instead.`,
    };
  }

  return {
    scope: "unavailable",
    href: null,
    label: null,
    caveat: "The source row does not contain enough geographic information for a map link.",
  };
}

function evidenceFor(row, matcher) {
  const tokens = new Set(systemNameTokens(row.systemName).map(normalize));
  const deviceFamily = matcher.deviceFamilySystemNames.find((name) => tokens.has(normalize(name)));
  if (deviceFamily) {
    return { kind: "device_family", reason: `The normalized source row explicitly names ${deviceFamily}.` };
  }

  if (matcher.manufacturerAliases.some((alias) => normalize(alias) === normalize(row.vendor))) {
    return {
      kind: "manufacturer_context",
      reason: `The normalized source row names ${row.vendor}; it does not identify this dossier's exact model or configuration.`,
    };
  }

  return null;
}

function recordSort(a, b) {
  return a.state.localeCompare(b.state)
    || a.jurisdictionName.localeCompare(b.jurisdictionName)
    || a.id.localeCompare(b.id);
}

function buildSummary(records, matcher) {
  const selected = records.flatMap((record) => record.matches
    .filter((match) => match.slug === matcher.slug)
    .map((match) => ({ match, record })));
  const count = (kind) => selected.filter(({ match }) => match.evidenceKind === kind).length;
  const states = (kind) => new Set(selected
    .filter(({ match }) => !kind || match.evidenceKind === kind)
    .map(({ record }) => record.state)).size;

  return {
    slug: matcher.slug,
    totalRecords: selected.length,
    totalStates: states(),
    deviceFamilyRecords: count("device_family"),
    deviceFamilyStates: states("device_family"),
    manufacturerContextRecords: count("manufacturer_context"),
    manufacturerContextStates: states("manufacturer_context"),
    jurisdictionMapLinks: selected.filter(({ record }) => record.map.scope === "jurisdiction").length,
    stateMapLinks: selected.filter(({ record }) => record.map.scope === "state").length,
    unavailableMapLinks: selected.filter(({ record }) => record.map.scope === "unavailable").length,
  };
}

async function buildIndex() {
  const [registry, matchers, catalog] = await Promise.all([
    readFile(registryPath, "utf8").then(JSON.parse),
    readFile(matcherPath, "utf8").then(JSON.parse),
    readFile(catalogPath, "utf8").then(JSON.parse),
  ]);
  const catalogSlugs = new Set(catalog.systems.map((system) => system.slug));
  const matcherSlugs = new Set(matchers.systems.map((matcher) => matcher.slug));

  for (const matcher of matchers.systems) {
    if (!catalogSlugs.has(matcher.slug)) throw new Error(`Equipment usage matcher references unknown dossier ${matcher.slug}.`);
  }
  for (const slug of catalogSlugs) {
    if (!matcherSlugs.has(slug)) throw new Error(`Equipment dossier ${slug} has no explicit usage matcher.`);
  }

  const sources = [];
  const records = [];
  let normalizedRowCount = 0;
  let loadedPackageCount = 0;
  let missingPackageCount = 0;

  for (const entry of registry.stateYearStatuses) {
    const equipment = entry.equipment;
    if (equipment?.status !== "loaded" || !equipment.normalizedArtifact) {
      missingPackageCount += 1;
      continue;
    }

    loadedPackageCount += 1;
    const sourceId = String(equipment.sourceDocumentId);
    sources.push({
      id: sourceId,
      state: entry.state,
      electionYear: entry.electionYear,
      authority: matchers.sourcePolicy.authority,
      sourceUrl: equipment.sourceUrl,
      apiUrl: equipment.apiUrl ?? null,
      localArtifact: equipment.normalizedArtifact,
      reportingLevel: equipment.reportingLevel,
      caveat: equipment.caveat,
    });

    const rows = parseCsv(await readFile(equipment.normalizedArtifact, "utf8"));
    normalizedRowCount += rows.length;
    for (const [rowIndex, row] of rows.entries()) {
      const resolution = resolveJurisdictionTag({
        state: row.state,
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        level: row.level,
      });
      const map = mapReference(row, resolution);

      const matches = matchers.systems.flatMap((matcher) => {
        const evidence = evidenceFor(row, matcher);
        return evidence ? [{ slug: matcher.slug, evidenceKind: evidence.kind, matchReason: evidence.reason }] : [];
      });
      if (!matches.length) continue;

      records.push({
        id: `${sourceId}:${rowIndex + 1}`,
        matches,
        state: row.state,
        electionYear: Number(row.electionYear),
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        jurisdictionLevel: row.level,
        jurisdictionTag: resolution.jurisdictionTag,
        vendor: row.vendor,
        systemName: row.systemName.replace(/\s+\+\s*$/, "").trim(),
        equipmentType: row.equipmentType,
        sourceId,
        map,
      });
    }
  }

  records.sort(recordSort);
  sources.sort((a, b) => a.state.localeCompare(b.state) || a.id.localeCompare(b.id));
  const summaries = matchers.systems.map((matcher) => buildSummary(records, matcher));
  const dossierMatchCount = records.reduce((total, record) => total + record.matches.length, 0);

  return {
    schemaVersion: matchers.schemaVersion,
    generatedOn: matchers.reviewedOn,
    description: matchers.description,
    sourcePolicy: matchers.sourcePolicy,
    coverage: {
      registryStateOrDistrictCount: registry.stateYearStatuses.length,
      loadedPackageCount,
      missingPackageCount,
      normalizedRowCount,
      indexedObservationCount: records.length,
      indexedRecordCount: dossierMatchCount,
      dossierCount: matchers.systems.length,
    },
    summaries,
    sources,
    records,
  };
}

const output = `${JSON.stringify(await buildIndex(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  const normalizedCurrent = current.replace(/\r\n?/g, "\n");
  if (normalizedCurrent !== output) throw new Error(`${outputPath} is stale. Run npm run equipment:usage:build.`);
  console.log(`${outputPath} is current.`);
} else {
  await writeFile(outputPath, output);
  const index = JSON.parse(output);
  console.log(`Wrote ${index.coverage.indexedRecordCount} sourced usage records across ${index.coverage.dossierCount} dossiers to ${outputPath}.`);
}
