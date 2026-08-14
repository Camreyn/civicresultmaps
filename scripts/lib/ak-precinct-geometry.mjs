import JSZip from "jszip";
import { parseDbf, parseShp } from "shpjs";

const YEAR_CONTRACTS = Object.freeze({
  2012: Object.freeze({
    sourceFeatureCount: 439,
    normalizedFeatureCount: 438,
    authority: "Alaska Division of Elections 2012 amended-proclamation precinct plan, retained through a commit-pinned public mirror",
    method: "reviewed_2012_amended_proclamation_precinct_id",
  }),
  2016: Object.freeze({
    sourceFeatureCount: 441,
    normalizedFeatureCount: 441,
    authority: "Alaska Division of Elections 2013 proclaimed precinct plan",
    method: "exact_official_precinct_id",
  }),
  2020: Object.freeze({
    sourceFeatureCount: 441,
    normalizedFeatureCount: 441,
    authority: "Alaska Division of Elections 2013 proclaimed precinct plan",
    method: "exact_official_precinct_id",
  }),
  2024: Object.freeze({
    sourceFeatureCount: 402,
    normalizedFeatureCount: 402,
    authority: "Alaska Division of Elections 2023 final proclamation precinct plan, approved and adopted April 2024",
    method: "exact_official_precinct_id",
  }),
});

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shapefileMember(files, extension) {
  const matches = files.filter(
    (file) => !file.dir && file.name.toLowerCase().endsWith(extension),
  );
  if (matches.length !== 1) {
    throw new Error(`Alaska shapefile ZIP must contain exactly one ${extension} member (found ${matches.length}).`);
  }
  return matches[0];
}

export async function parseAlaskaShapefileZip(bytes) {
  const archive = await JSZip.loadAsync(bytes);
  const files = Object.values(archive.files);
  const dbf = shapefileMember(files, ".dbf");
  const shp = shapefileMember(files, ".shp");
  const prj = shapefileMember(files, ".prj");
  const [records, geometries, sourceCrs] = await Promise.all([
    dbf.async("arraybuffer").then((value) => parseDbf(value)),
    Promise.all([shp.async("arraybuffer"), prj.async("string")])
      .then(([shpBytes, projection]) => parseShp(shpBytes, projection)),
    prj.async("string"),
  ]);
  if (!Array.isArray(records) || !Array.isArray(geometries) || records.length !== geometries.length) {
    throw new Error("Alaska shapefile DBF and geometry record counts disagree.");
  }
  return {
    sourceCrs: sourceCrs.trim(),
    features: records.map((properties, index) => ({
      type: "Feature",
      properties,
      geometry: geometries[index],
    })),
  };
}

function polygonRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates;
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.flat();
  throw new Error(`Alaska precinct geometry must be Polygon or MultiPolygon, not ${geometry?.type}.`);
}

function pointKey(point) {
  if (!Array.isArray(point) || point.length < 2) throw new Error("Alaska geometry contains an invalid coordinate.");
  return `${Number(point[0]).toFixed(6)},${Number(point[1]).toFixed(6)}`;
}

function topologyEdgeSignature(geometry) {
  const edges = [];
  for (const ring of polygonRings(geometry)) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const left = pointKey(ring[index]);
      const right = pointKey(ring[index + 1]);
      edges.push(left < right ? `${left}|${right}` : `${right}|${left}`);
    }
  }
  return edges.sort().join("\n");
}

function alaskaParentId(sourceUnitId) {
  const district = String(sourceUnitId).match(/^(\d{2})-\d{3}$/)?.[1];
  if (!district) throw new Error(`Alaska geographic unit ${sourceUnitId} lacks a House District precinct ID.`);
  return `HD${district}`;
}

function sourceIdForFeature(year, feature) {
  if (year === 2024) return text(feature?.properties?.Precinct_N).slice(0, 6);
  return text(feature?.properties?.DISTRICT);
}

function sourceNameForFeature(year, feature) {
  if (year === 2024) return text(feature?.properties?.Precinct_N);
  return text(feature?.properties?.NAME);
}

function assertUniqueIds(ids, context) {
  const seen = new Set();
  for (const id of ids) {
    if (!id) throw new Error(`${context} contains a blank precinct ID.`);
    if (seen.has(id)) throw new Error(`${context} repeats precinct ID ${id}.`);
    seen.add(id);
  }
}

function exactSetDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function assertExactResultSet(year, featureIds, resultUnits) {
  const resultIds = new Set(
    resultUnits.filter((unit) => unit.isGeographic).map((unit) => unit.sourceUnitId),
  );
  const normalizedIds = new Set(featureIds);
  const geometryOnly = exactSetDifference(normalizedIds, resultIds);
  const resultOnly = exactSetDifference(resultIds, normalizedIds);
  if (geometryOnly.length || resultOnly.length) {
    throw new Error(
      `Alaska ${year} geometry/result IDs disagree (geometry-only: ${geometryOnly.slice(0, 20).join(", ") || "none"}; result-only: ${resultOnly.slice(0, 20).join(", ") || "none"}).`,
    );
  }
}

function normalizeFeature(year, sourceFeature, resultUnit, originalSourceId, contract) {
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: resultUnit.sourceUnitId,
      CRM_PARENT_GEOID: resultUnit.parentGeoid,
      SOURCE_NAME: resultUnit.sourceDisplayName,
      SOURCE_PRECINCT_ID: resultUnit.sourceUnitId,
      SOURCE_ORIGINAL_PRECINCT_ID: originalSourceId,
      SOURCE_GEOMETRY_AUTHORITY: contract.authority,
      SOURCE_GEOMETRY_METHOD: contract.method,
    },
    geometry: sourceFeature.geometry,
  };
}

function assert2012LakeIliamnaCorrection(sourceFeature, official2013) {
  const original = sourceFeature.properties ?? {};
  if (
    text(original.DISTRICT) !== "36-616"
    || Number(original.AREA) !== 341.814423
    || Number(original.POPULATION) !== 299
  ) {
    throw new Error("Alaska 2012 Lake Iliamna source correction preimage changed.");
  }
  const confirmation = official2013.features.filter(
    (feature) => text(feature?.properties?.DISTRICT) === "37-726",
  );
  if (confirmation.length !== 1) {
    throw new Error(`Alaska official 2013 plan matched ${confirmation.length} Lake Iliamna confirmation features.`);
  }
  const confirmed = confirmation[0];
  if (
    text(confirmed?.properties?.NAME).toUpperCase() !== "37-726 LAKE ILIAMNA NO. 1"
    || Number(confirmed?.properties?.AREA) !== Number(original.AREA)
    || Number(confirmed?.properties?.POPULATION) !== Number(original.POPULATION)
    || topologyEdgeSignature(confirmed.geometry) !== topologyEdgeSignature(sourceFeature.geometry)
  ) {
    throw new Error("Alaska 2012 Lake Iliamna correction is not confirmed by the official 2013 plan geometry.");
  }
  return {
    originalSourceId: "36-616",
    correctedSourceId: "36-040",
    official2012Name: "Lake Iliamna No.1",
    confirmationSourceId: "37-726",
    confirmationSourceName: text(confirmed.properties.NAME),
    confirmationMethod: "identical_area_population_and_topology_in_official_2013_plan",
  };
}

export async function buildAlaskaPrecinctGeometry(year, resultUnits, geometryZipBytes, options = {}) {
  const contract = YEAR_CONTRACTS[year];
  if (!contract) throw new Error(`Unsupported Alaska precinct geometry year: ${year}`);
  if (!Array.isArray(resultUnits) || resultUnits.length === 0) {
    throw new Error(`Alaska ${year} precinct geometry requires normalized result units.`);
  }
  const source = await parseAlaskaShapefileZip(geometryZipBytes);
  if (source.features.length !== contract.sourceFeatureCount) {
    throw new Error(`Alaska ${year} source feature count changed (${source.features.length}).`);
  }
  let correction = null;
  let excludedSourceFeatures = [];
  let contexts;
  if (year === 2012) {
    if (!options.official2013ZipBytes) {
      throw new Error("Alaska 2012 normalization requires the official 2013 plan for the Lake Iliamna correction check.");
    }
    const official2013 = await parseAlaskaShapefileZip(options.official2013ZipBytes);
    const blank = source.features.filter((feature) => !text(feature?.properties?.DISTRICT));
    if (
      blank.length !== 1
      || Number(blank[0]?.properties?.POPULATION) !== 0
      || text(blank[0]?.properties?.NAME) !== ""
    ) {
      throw new Error(`Alaska 2012 expected one blank zero-population source artifact, found ${blank.length}.`);
    }
    excludedSourceFeatures = [{
      sourceRecordId: Number(blank[0].properties.ID),
      reason: "blank_zero_population_non_precinct_source_artifact",
    }];
    contexts = source.features
      .filter((feature) => text(feature?.properties?.DISTRICT))
      .map((feature) => {
        const originalSourceId = text(feature.properties.DISTRICT);
        if (originalSourceId !== "36-616") return { feature, originalSourceId, sourceUnitId: originalSourceId };
        correction = assert2012LakeIliamnaCorrection(feature, official2013);
        return { feature, originalSourceId, sourceUnitId: correction.correctedSourceId };
      });
  } else {
    contexts = source.features.map((feature) => {
      const sourceUnitId = sourceIdForFeature(year, feature);
      return { feature, originalSourceId: sourceUnitId, sourceUnitId };
    });
  }
  assertUniqueIds(contexts.map((context) => context.sourceUnitId), `Alaska ${year} normalized geometry`);
  assertExactResultSet(year, contexts.map((context) => context.sourceUnitId), resultUnits);
  const results = new Map(
    resultUnits.filter((unit) => unit.isGeographic).map((unit) => [unit.sourceUnitId, unit]),
  );
  const features = contexts
    .map((context) => {
      const resultUnit = results.get(context.sourceUnitId);
      if (!resultUnit) throw new Error(`Alaska ${year} lacks a result unit for ${context.sourceUnitId}.`);
      if (resultUnit.parentGeoid !== alaskaParentId(resultUnit.sourceUnitId)) {
        throw new Error(`Alaska ${year} ${resultUnit.sourceUnitId} has an invalid House District parent.`);
      }
      const sourceName = sourceNameForFeature(year, context.feature);
      if (year !== 2012 && sourceName && !sourceName.startsWith(context.sourceUnitId)) {
        throw new Error(`Alaska ${year} source name does not begin with ${context.sourceUnitId}.`);
      }
      return normalizeFeature(year, context.feature, resultUnit, context.originalSourceId, contract);
    })
    .sort((left, right) => (
      left.properties.CRM_PARENT_GEOID.localeCompare(right.properties.CRM_PARENT_GEOID)
      || left.properties.CRM_FEATURE_ID.localeCompare(right.properties.CRM_FEATURE_ID)
    ));
  if (features.length !== contract.normalizedFeatureCount) {
    throw new Error(`Alaska ${year} normalized feature count changed (${features.length}).`);
  }
  const crosswalkRows = resultUnits
    .map((unit) => ({
      resultUnitCode: unit.resultUnitCode,
      sourceUnitId: unit.sourceUnitId,
      sourceDisplayName: unit.sourceDisplayName,
      parentGeoid: unit.parentGeoid,
      reportingGrain: unit.reportingGrain,
      isGeographic: unit.isGeographic,
      relationships: unit.isGeographic
        ? [{
          sourceFeatureId: `${unit.parentGeoid}|${unit.sourceUnitId}`,
          relationshipType: "one_to_one",
          matchMethod: year === 2012 && unit.sourceUnitId === "36-040"
            ? "official_crosswalk"
            : "exact_official_id",
          reviewStatus: "reviewed",
          confidence: "high",
          note: year === 2012 && unit.sourceUnitId === "36-040"
            ? "The retained 2012 DBF mislabeled Lake Iliamna No. 1 as 36-616; the official 2012 result/media ID is 36-040 and the identical polygon is named Lake Iliamna No. 1 in the official 2013 plan."
            : "The official result precinct ID exactly matches the election-specific source polygon ID.",
        }]
        : [{
          sourceFeatureId: null,
          relationshipType: "non_geographic",
          matchMethod: "official_crosswalk",
          reviewStatus: "reviewed",
          confidence: "high",
          note: "The Alaska Division of Elections reports this absentee, early-voting, questioned-ballot, or federal-overseas bucket separately. It has no precinct polygon and is retained only for result reconciliation.",
        }],
      exclusionReason: unit.isGeographic
        ? null
        : "non_geographic_election_administration_bucket",
    }))
    .sort((left, right) => left.resultUnitCode.localeCompare(right.resultUnitCode));
  return {
    featureCollection: { type: "FeatureCollection", features },
    crosswalkRows,
    sourceCrs: source.sourceCrs,
    sourceFeatureCount: source.features.length,
    normalizedFeatureCount: features.length,
    excludedSourceFeatures,
    correction,
  };
}
