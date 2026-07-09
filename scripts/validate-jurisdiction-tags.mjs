import { getCanonicalJurisdictionRegistry, normalizeJurisdictionAlias } from "../src/lib/jurisdiction-tags.ts";

const registry = getCanonicalJurisdictionRegistry();
const errors = [];
const warnings = [];
const tags = new Set();
const aliases = new Map();

for (const row of registry.jurisdictions) {
  if (!row.jurisdictionTag || !row.state || !row.displayName) {
    errors.push({ type: "missing_required_field", row });
    continue;
  }
  if (tags.has(row.jurisdictionTag)) {
    errors.push({ type: "duplicate_tag", tag: row.jurisdictionTag });
  }
  tags.add(row.jurisdictionTag);

  for (const alias of [row.displayName, row.geoid, row.fips, ...(row.aliases ?? [])]) {
    const key = `${row.state}:${normalizeJurisdictionAlias(alias)}`;
    if (!key.endsWith(":")) {
      aliases.set(key, [...(aliases.get(key) ?? []), row.jurisdictionTag]);
    }
  }
}

for (const [key, values] of aliases) {
  const unique = Array.from(new Set(values));
  if (unique.length > 1) {
    warnings.push({ type: "ambiguous_alias", key, tags: unique });
  }
}

const summary = {
  jurisdictions: registry.jurisdictions.length,
  uniqueTags: tags.size,
  ambiguousAliases: warnings.length,
  errors: errors.length,
  sampleWarnings: warnings.slice(0, 20),
  sampleErrors: errors.slice(0, 20),
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) {
  process.exitCode = 1;
}
