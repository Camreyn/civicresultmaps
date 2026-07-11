import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type CanonicalJurisdiction = {
  jurisdictionTag: string;
  state: string;
  level: string;
  geoid: string;
  fips: string;
  displayName: string;
  aliases: string[];
  geometryKey: string;
  source: string;
  caveat: string;
};

export type JurisdictionTagResolution = {
  jurisdictionTag: string | null;
  reason: "matched" | "ambiguous" | "non_geographic" | "missing" | "registry_missing";
  candidates: CanonicalJurisdiction[];
};

type Registry = {
  jurisdictions: CanonicalJurisdiction[];
};

let cachedRegistry: Registry | null = null;
let cachedAliasIndex: Map<string, CanonicalJurisdiction[]> | null = null;

export function normalizeJurisdictionAlias(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/\bgd[.]?\b/gi, "grand")
    .replace(/&/g, " and ")
    .replace(/\bsaint\b/gi, "st")
    .replace(/\bst[.]\b/gi, "st")
    .replace(/\bste[.]\b/gi, "ste")
    .replace(/\bcounty\b/gi, "")
    .replace(/\bcity\b/gi, "")
    .replace(/\bparish\b/gi, "")
    .replace(/\bborough\b/gi, "")
    .replace(/\bcensus\s+area\b/gi, "")
    .replace(/\bmunicipality\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

function registryPath() {
  return path.join(process.cwd(), "data", "canonical-jurisdictions.json");
}

export function getCanonicalJurisdictionRegistry() {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const file = registryPath();
  if (!existsSync(file)) {
    cachedRegistry = { jurisdictions: [] };
    return cachedRegistry;
  }

  cachedRegistry = JSON.parse(readFileSync(file, "utf8")) as Registry;
  return cachedRegistry;
}

function aliasKeysFor(row: CanonicalJurisdiction) {
  return [
    row.displayName,
    row.geoid,
    row.fips,
    row.jurisdictionTag,
    ...(row.geoid.length === 5 ? [row.geoid.slice(2)] : []),
    ...row.aliases,
  ]
    .map(normalizeJurisdictionAlias)
    .filter(Boolean);
}

function aliasIndex() {
  if (cachedAliasIndex) {
    return cachedAliasIndex;
  }

  cachedAliasIndex = new Map<string, CanonicalJurisdiction[]>();
  for (const row of getCanonicalJurisdictionRegistry().jurisdictions) {
    for (const alias of aliasKeysFor(row)) {
      const key = `${row.state}:${alias}`;
      cachedAliasIndex.set(key, [...(cachedAliasIndex.get(key) ?? []), row]);
    }
  }

  return cachedAliasIndex;
}

function hasCityMarker(name: string, code: string) {
  return /\bcity\b/i.test(name) || /[-_]city(?:$|[-_])/i.test(code);
}

function hasCountyMarker(name: string, code: string) {
  return /\bcounty\b/i.test(name) || /[-_]county(?:$|[-_])/i.test(code);
}

function disambiguateAdministrativeKind(rows: CanonicalJurisdiction[], name: string, code: string, level: string) {
  const wantsCity = hasCityMarker(name, code);
  const normalizedLevel = level.toLowerCase().replaceAll("_", " ");
  const wantsCounty = hasCountyMarker(name, code) || (
    !wantsCity && /county|parish|borough|census area|planning region/.test(normalizedLevel)
  );
  if (!wantsCity && !wantsCounty) {
    return rows;
  }

  const filtered = rows.filter((row) => {
    if (wantsCity) {
      return /\bcity$/i.test(row.displayName) || row.level === "county_equivalent";
    }
    if (wantsCounty) {
      return /\bcounty$/i.test(row.displayName) || row.level === "county";
    }
    return true;
  });

  return filtered.length ? filtered : rows;
}
function isNonGeographicName(value: string) {
  return /^(statewide|statewide total|total|uocava|state uocava|federal only|federal precincts?|overseas|write[- ]?in|scattered)$/i.test(
    value.trim(),
  );
}

export function resolveJurisdictionTag(input: {
  state: string;
  jurisdictionName?: string | null;
  jurisdictionCode?: string | null;
  level?: string | null;
}): JurisdictionTagResolution {
  const state = input.state.toUpperCase();
  const name = String(input.jurisdictionName || "").trim();
  const code = String(input.jurisdictionCode || "").trim();

  if (!getCanonicalJurisdictionRegistry().jurisdictions.length) {
    return { jurisdictionTag: null, reason: "registry_missing", candidates: [] };
  }

  if (!name && !code) {
    return { jurisdictionTag: null, reason: "missing", candidates: [] };
  }

  if (
    (name && isNonGeographicName(name))
    || (state === "ME" && code.toUpperCase() === "ME-STATE-UOCAVA")
    || (state === "RI" && code.toUpperCase() === "RI-FEDERAL-PRECINCTS")
  ) {
    return { jurisdictionTag: null, reason: "non_geographic", candidates: [] };
  }

  const explicitParentCounty =
    name.match(/,\s*([^,]+?\s+County)\b/i)?.[1]
    ?? name.match(/^(.+?\s+County)\s+outside\b/i)?.[1]
    ?? "";
  const candidateKeys = [
    name,
    name.split("/")[0] ?? "",
    explicitParentCounty,
    code.replace(new RegExp(`^${state}[-_]`, "i"), ""),
    code.replace(new RegExp(`^${state}`, "i"), ""),
  ]
    .map(normalizeJurisdictionAlias)
    .filter(Boolean);

  const candidates = new Map<string, CanonicalJurisdiction>();
  const index = aliasIndex();
  for (const key of candidateKeys) {
    for (const row of index.get(`${state}:${key}`) ?? []) {
      candidates.set(row.jurisdictionTag, row);
    }
  }

  const rows = disambiguateAdministrativeKind(Array.from(candidates.values()), name, code, String(input.level || ""));
  if (rows.length === 1) {
    return { jurisdictionTag: rows[0].jurisdictionTag, reason: "matched", candidates: rows };
  }

  return {
    jurisdictionTag: null,
    reason: rows.length > 1 ? "ambiguous" : "missing",
    candidates: rows,
  };
}

export function jurisdictionTagForRow(input: {
  state: string;
  jurisdictionName?: string | null;
  jurisdictionCode?: string | null;
  level?: string | null;
}) {
  return resolveJurisdictionTag(input).jurisdictionTag;
}

