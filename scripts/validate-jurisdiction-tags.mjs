import { getCanonicalJurisdictionRegistry, normalizeJurisdictionAlias } from "../src/lib/jurisdiction-tags.ts";

const EXPECTED_COUNTY_EQUIVALENTS = 3144;
const EXPECTED_STATE_JURISDICTIONS = 51;
const registry = getCanonicalJurisdictionRegistry();
const errors = [];
const warnings = [];
const tags = new Set();
const fipsCodes = new Set();
const states = new Set();
const aliases = new Map();

for (const row of registry.jurisdictions) {
  if (!row.jurisdictionTag || !row.state || !row.displayName || !row.geoid || !row.fips) {
    errors.push({ type: "missing_required_field", row });
    continue;
  }
  if (tags.has(row.jurisdictionTag)) errors.push({ type: "duplicate_tag", tag: row.jurisdictionTag });
  tags.add(row.jurisdictionTag);
  states.add(row.state);

  if (!/^county:\d{5}$/.test(row.jurisdictionTag)) {
    errors.push({ type: "invalid_county_tag", tag: row.jurisdictionTag });
  }
  if (!/^\d{5}$/.test(row.fips) || row.geoid !== row.fips
    || row.jurisdictionTag !== `county:${row.fips}`) {
    errors.push({
      type: "fips_geoid_tag_mismatch",
      tag: row.jurisdictionTag,
      fips: row.fips,
      geoid: row.geoid,
    });
  }
  if (fipsCodes.has(row.fips)) errors.push({ type: "duplicate_fips", fips: row.fips });
  fipsCodes.add(row.fips);

  for (const alias of [row.displayName, row.geoid, row.fips, ...(row.aliases ?? [])]) {
    const key = `${row.state}:${normalizeJurisdictionAlias(alias)}`;
    if (!key.endsWith(":")) aliases.set(key, [...(aliases.get(key) ?? []), row.jurisdictionTag]);
  }
}

if (registry.jurisdictions.length !== EXPECTED_COUNTY_EQUIVALENTS) {
  errors.push({
    type: "unexpected_registry_count",
    actual: registry.jurisdictions.length,
    expected: EXPECTED_COUNTY_EQUIVALENTS,
  });
}
if (states.size !== EXPECTED_STATE_JURISDICTIONS) {
  errors.push({ type: "unexpected_state_count", actual: states.size, expected: EXPECTED_STATE_JURISDICTIONS });
}

for (const [key, values] of aliases) {
  const unique = Array.from(new Set(values));
  if (unique.length > 1) warnings.push({ type: "ambiguous_alias", key, tags: unique });
}

const summary = {
  jurisdictions: registry.jurisdictions.length,
  uniqueTags: tags.size,
  uniqueFips: fipsCodes.size,
  stateJurisdictions: states.size,
  ambiguousAliases: warnings.length,
  errors: errors.length,
  sampleWarnings: warnings.slice(0, 20),
  sampleErrors: errors.slice(0, 20),
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
