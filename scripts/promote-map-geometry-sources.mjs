import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import coverage from "../src/lib/map-geometry-coverage.json" with { type: "json" };
import { requireState } from "./state-metadata.mjs";
import { bumpPublicDataRevision } from "./public-data-revision.mjs";

const year = 2024;
const dataDir = path.join(process.cwd(), "data");
const dryRun = process.argv.includes("--dry-run");

const minnesotaCountyBoundary = {
  authority: "Minnesota Geospatial Information Office",
  parser: "mnGeoCountyGeojson",
  sourceTitle: "MnGeo county boundary feature service",
  sourceUrl: "https://feat.gisdata.mn.gov/arcgis/rest/services/MnGeo/mn_counties/FeatureServer/0",
};

const alaskaHouseDistricts = {
  layerUrl: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/2/query",
  outFields: "GEOID,STATE,SLDL,NAME,BASENAME",
};

function geometryFileName(state) {
  return state === "AK" ? "ak-house-districts.geojson" : `${state.toLowerCase()}-counties.geojson`;
}

function censusTigerwebQueryUrl(stateCode, fips) {
  const params = new URLSearchParams({
    where: `STATE='${fips}'`,
    outFields: stateCode === "AK" ? alaskaHouseDistricts.outFields : "GEOID,STATE,COUNTY,NAME,BASENAME",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  if (stateCode === "AK") {
    return `${alaskaHouseDistricts.layerUrl}?${params}`;
  }

  return `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?${params}`;
}

async function featureCount(fileName) {
  const parsed = JSON.parse(await readFile(path.join(dataDir, fileName), "utf8"));
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features) || parsed.features.length === 0) {
    throw new Error(`${fileName} is not a non-empty GeoJSON FeatureCollection.`);
  }

  return parsed.features.length;
}

async function localGeometryExists(fileName) {
  try {
    await access(path.join(dataDir, fileName));
    return true;
  } catch {
    return false;
  }
}

function sourceRecordForState(stateCode, count) {
  const state = requireState(stateCode);
  const fileName = geometryFileName(stateCode);
  const source =
    stateCode === "MN"
      ? minnesotaCountyBoundary
      : {
          authority: "U.S. Census Bureau TIGERweb",
          parser: "censusTigerwebGeojson",
          sourceTitle:
            stateCode === "AK"
              ? "U.S. Census TIGERweb state legislative district boundary GeoJSON"
              : "U.S. Census TIGERweb county boundary GeoJSON",
          sourceUrl: censusTigerwebQueryUrl(stateCode, state.fips),
        };
  const level = stateCode === "AK" ? "state_house_district" : "county";

  return {
    authority: source.authority,
    category: stateCode === "AK" ? "State legislative district boundary map geometry" : "County boundary map geometry",
    confidence:
      "Loaded repository GeoJSON FeatureCollection used by result map joins; validated by scripts/validate-map-geometry-coverage.mjs.",
    electionYear: year,
    localArtifact: `data/${fileName}`,
    metadata: {
      featureCount: count,
      geometryLevel: level,
      promotedBy: "scripts/promote-map-geometry-sources.mjs",
    },
    parser: source.parser,
    slug: `${stateCode.toLowerCase()}-${year}-map-geometry`,
    sourceUrl: source.sourceUrl,
    state: stateCode,
    timestampBasis: "Source service query URL plus local GeoJSON artifact tracked in the repository.",
    title: `${state.name} ${stateCode === "AK" ? "state house district" : "county"} boundary GeoJSON`,
  };
}

async function statesWithMissingGeometrySources(sql) {
  return sql`
    with source_counts as (
      select
        state_code,
        count(*) filter (
          where status = 'loaded'
            and (
              lower(coalesce(local_artifact, '')) like '%.geojson'
              or lower(coalesce(parser, '')) like '%geojson%'
              or (
                lower(category) like '%boundar%'
                and lower(category) like '%count%'
              )
            )
        ) as map_geometry_source_count
      from source_documents
      where election_year = ${year}
      group by state_code
    )
    select
      states.code,
      states.name
    from states
    left join capability_flags
      on states.code = capability_flags.state_code
      and capability_flags.election_year = ${year}
    left join source_counts on states.code = source_counts.state_code
    where coalesce(capability_flags.map, false) = true
      and coalesce(source_counts.map_geometry_source_count, 0) = 0
    order by states.code
  `;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required.");
  }

  const sql = neon(databaseUrl);
  const coverageStates = new Set(coverage.baseResultGeometryStates.map((state) => state.toUpperCase()));
  const missing = await statesWithMissingGeometrySources(sql);
  const skipped = [];
  const records = [];

  for (const row of missing) {
    const state = String(row.code).toUpperCase();
    const fileName = geometryFileName(state);

    if (!coverageStates.has(state)) {
      skipped.push({ state, reason: "state is not listed in map-geometry-coverage.json" });
      continue;
    }

    if (!(await localGeometryExists(fileName))) {
      skipped.push({ state, reason: `${fileName} is missing from data/` });
      continue;
    }

    records.push(sourceRecordForState(state, await featureCount(fileName)));
  }

  if (!dryRun) {
    for (const source of records) {
      await sql`
        insert into source_documents (
          slug,
          state_code,
          election_year,
          category,
          title,
          source_url,
          authority,
          local_artifact,
          parser,
          timestamp_basis,
          confidence,
          status,
          metadata
        )
        values (
          ${source.slug},
          ${source.state},
          ${source.electionYear},
          ${source.category},
          ${source.title},
          ${source.sourceUrl},
          ${source.authority},
          ${source.localArtifact},
          ${source.parser},
          ${source.timestampBasis},
          ${source.confidence},
          'loaded',
          ${source.metadata}
        )
        on conflict (slug) do update set
          state_code = excluded.state_code,
          election_year = excluded.election_year,
          category = excluded.category,
          title = excluded.title,
          source_url = excluded.source_url,
          authority = excluded.authority,
          local_artifact = excluded.local_artifact,
          parser = excluded.parser,
          timestamp_basis = excluded.timestamp_basis,
          confidence = excluded.confidence,
          status = excluded.status,
          metadata = excluded.metadata
      `;
    }
  }

  if (!dryRun && records.length > 0) {
    await bumpPublicDataRevision(sql, `map-geometry-promotion:${records.map((record) => record.state).join(",")}`);
  }
  const remaining = dryRun ? missing : await statesWithMissingGeometrySources(sql);

  console.log(
    JSON.stringify(
      {
        dryRun,
        missingBefore: missing.map((row) => row.code),
        promoted: records.map((source) => ({
          state: source.state,
          slug: source.slug,
          localArtifact: source.localArtifact,
          featureCount: source.metadata.featureCount,
        })),
        skipped,
        missingAfter: remaining.map((row) => row.code),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
