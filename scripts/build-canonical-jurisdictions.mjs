import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const outPath = path.join(dataDir, "canonical-jurisdictions.json");
const stateFipsByPostal = {
  AL: "01",
  AK: "02",
  AZ: "04",
  AR: "05",
  CA: "06",
  CO: "08",
  CT: "09",
  DC: "11",
  DE: "10",
  FL: "12",
  GA: "13",
  HI: "15",
  ID: "16",
  IL: "17",
  IN: "18",
  IA: "19",
  KS: "20",
  KY: "21",
  LA: "22",
  ME: "23",
  MD: "24",
  MA: "25",
  MI: "26",
  MN: "27",
  MS: "28",
  MO: "29",
  MT: "30",
  NE: "31",
  NV: "32",
  NH: "33",
  NJ: "34",
  NM: "35",
  NY: "36",
  NC: "37",
  ND: "38",
  OH: "39",
  OK: "40",
  OR: "41",
  PA: "42",
  RI: "44",
  SC: "45",
  SD: "46",
  TN: "47",
  TX: "48",
  UT: "49",
  VT: "50",
  VA: "51",
  WA: "53",
  WV: "54",
  WI: "55",
  WY: "56",
};


function normalizeAlias(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\bsaint\b/gi, "st")
    .replace(/\bst[.]\b/gi, "st")
    .replace(/\bste[.]\b/gi, "ste")
    .replace(/\bcounty\b/gi, "")
    .replace(/\bcity\s+and\s+borough\b/gi, "")
    .replace(/\bcity\b/gi, "")
    .replace(/\bparish\b/gi, "")
    .replace(/\bborough\b/gi, "")
    .replace(/\bmunicipality\b/gi, "")
    .replace(/\bcensus\s+area\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

function aliasVariants(name, basename) {
  const variants = new Set([name, basename]);
  variants.add(String(name || "").replace(/\s+County$/i, ""));
  variants.add(String(name || "").replace(/\s+Parish$/i, ""));
  variants.add(String(name || "").replace(/\s+city$/i, ""));
  variants.add(String(name || "").replace(/\s+Municipality$/i, ""));
  variants.add(String(basename || "").replace(/^St[.]\s+/i, "Saint "));
  variants.add(String(name || "").replace(/^St[.]\s+/i, "Saint "));

  if (/^Jefferson Davis/i.test(name) || /^Jefferson Davis/i.test(basename)) {
    variants.add("Jeff Davis");
    variants.add("Jeff Davis County");
  }

  if (/^La\s*Salle/i.test(name) || /^La\s*Salle/i.test(basename)) {
    variants.add("La Salle");
    variants.add("La Salle County");
    variants.add("Lasalle");
    variants.add("Lasalle County");
    variants.add("LaSalle");
    variants.add("LaSalle County");
  }
  if (/^DuPage/i.test(name) || /^DuPage/i.test(basename)) {
    variants.add("Du Page");
    variants.add("Du Page County");
  }

  if (/^De Witt/i.test(name) || /^De Witt/i.test(basename)) {
    variants.add("DeWitt");
    variants.add("DeWITT");
    variants.add("DeWitt County");
    variants.add("DeWITT County");
  }

  if (/^Jo Daviess/i.test(name) || /^Jo Daviess/i.test(basename)) {
    variants.add("JoDaviess");
    variants.add("JoDAVIESS");
    variants.add("JoDaviess County");
    variants.add("JoDAVIESS County");
  }

  if (/^DeKalb/i.test(name) || /^DeKalb/i.test(basename)) {
    variants.add("De Kalb");
    variants.add("De Kalb County");
  }

  if (/^Le Flore/i.test(name) || /^Le Flore/i.test(basename)) {
    variants.add("Leflore");
    variants.add("Leflore County");
    variants.add("LeFlore");
    variants.add("LeFlore County");
  }
  return Array.from(variants)
    .map((alias) => String(alias || "").trim())
    .filter(Boolean);
}

function levelForFeature(properties) {
  const name = String(properties.NAME || "");
  if (String(properties.STATE || "") === "11" && /^District of Columbia$/i.test(name)) {
    return "county_equivalent";
  }
  if (/\bcity$/i.test(name)) {
    return "county_equivalent";
  }
  if (/\bparish$/i.test(name)) {
    return "county_equivalent";
  }
  if (/\bborough$|\bcensus area$|\bmunicipality$/i.test(name)) {
    return "county_equivalent";
  }
  return "county";
}

const files = readdirSync(dataDir)
  .filter((file) => /^[a-z]{2}-counties\.geojson$/i.test(file))
  .sort();

const rows = [];

for (const file of files) {
  const state = file.slice(0, 2).toUpperCase();
  const geojson = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"));
  for (const feature of geojson.features ?? []) {
    const properties = feature.properties ?? {};
    const countyFips = String(properties.COUNTY || properties.county_fips55_code || "").padStart(3, "0");
    const geoid = String(
      properties.GEOID || (stateFipsByPostal[state] && countyFips ? `${stateFipsByPostal[state]}${countyFips}` : ""),
    ).trim();
    const displayName = String(properties.NAME || properties.county_name || properties.BASENAME || "").trim();
    const fullDisplayName = /\b(county|parish|city|borough|census area|municipality)$/i.test(displayName)
      || /^District of Columbia$/i.test(displayName)
      ? displayName
      : `${displayName} County`;
    const basename = String(properties.BASENAME || properties.county_name || fullDisplayName).trim();
    if (!geoid || !fullDisplayName) {
      continue;
    }

    const aliases = aliasVariants(fullDisplayName, basename);
    if (geoid === "11001") {
      aliases.push("Washington", "Washington, DC", "Washington, D.C.");
    }

    rows.push({
      jurisdictionTag: `county:${geoid}`,
      state,
      level: levelForFeature(properties),
      geoid,
      fips: geoid,
      displayName: fullDisplayName,
      aliases: Array.from(new Set(aliases)),
      geometryKey: normalizeAlias(fullDisplayName),
      source: file,
      caveat: "",
    });
  }
}
const output = {
  generatedAt: new Date().toISOString(),
  source: "Generated from committed data/*-counties.geojson files.",
  tagContract: "county:<GEOID> for Census county/county-equivalent rows.",
  jurisdictions: rows.sort((left, right) => left.state.localeCompare(right.state) || left.displayName.localeCompare(right.displayName)),
};

writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${rows.length} canonical jurisdictions to ${path.relative(process.cwd(), outPath)}`);
