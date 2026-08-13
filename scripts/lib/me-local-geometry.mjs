import polygonClipping from "polygon-clipping";
import {
  MAINE_COUNTIES,
  normalizeMaineLabel,
} from "./me-local-reporting-units.mjs";

const FIPS_BY_COUNTY = new Map(
  Object.values(MAINE_COUNTIES).map((county) => [
    normalizeMaineLabel(county.name),
    county.fips,
  ]),
);

const VEST_FIELDS = Object.freeze({
  2016: { name: "NAME", county: "COUNTYFP" },
  2020: { name: "NAME20", county: "COUNTY20" },
});

const VEST_LOCAL_ALIASES = new Map([
  ["2016|019|penobscot nation voting district", "penobscot indian island"],
  ["2016|029|cathance twp", "east central washington"],
  ["2016|029|grand lake stream plt", "grand lake stream greenlaw chopping"],
  ["2016|029|pleasant point voting district", "passamaquoddy pleasant point"],
]);

function geometryPolygons(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Maine source geometry must be Polygon or MultiPolygon, not ${geometry?.type}`);
}

export function unionMaineGeometries(geometries) {
  const polygons = geometries.flatMap(geometryPolygons);
  if (polygons.length === 0) {
    throw new Error("Maine reporting unit requires at least one source polygon");
  }
  const coordinates = polygons.length === 1
    ? [polygons[0]]
    : polygonClipping.union(...polygons);
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error("Maine reporting-unit polygon union returned no geometry");
  }
  return coordinates.length === 1
    ? { type: "Polygon", coordinates: coordinates[0] }
    : { type: "MultiPolygon", coordinates };
}

function componentKey(feature, index) {
  const properties = feature?.properties ?? {};
  return String(
    properties.CRM_SOURCE_COMPONENT_ID
      ?? properties.GEOID
      ?? properties.GEOCODE
      ?? properties.CODE
      ?? properties.NAME20
      ?? properties.NAME
      ?? properties.Precinct
      ?? `feature-${index + 1}`,
  ).trim();
}

function normalizedFeature(unit, components, options = {}) {
  if (!components.length) {
    throw new Error(`Maine ${unit.year} ${unit.countyFips} ${unit.label} has no geometry components`);
  }
  const componentIds = components.map(({ feature, index }) => componentKey(feature, index));
  return {
    type: "Feature",
    properties: {
      CRM_FEATURE_ID: unit.id,
      CRM_PARENT_GEOID: `23${unit.countyFips}`,
      SOURCE_NAME: unit.label,
      SOURCE_COMPONENT_COUNT: components.length,
      SOURCE_COMPONENT_IDS: componentIds.join("|"),
      SOURCE_GEOMETRY_AUTHORITY: options.authority ?? "",
      SOURCE_GEOMETRY_METHOD: options.method ?? "",
    },
    geometry: unionMaineGeometries(components.map(({ feature }) => feature.geometry)),
  };
}

function ensureComponentAssignment(assigned, components, resultUnitId) {
  for (const { index } of components) {
    const previous = assigned.get(index);
    if (previous && previous !== resultUnitId) {
      throw new Error(`Maine source component ${index} is assigned to both ${previous} and ${resultUnitId}`);
    }
    assigned.set(index, resultUnitId);
  }
}

function groupingPrefix(target) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped}(?: ward | precinct | district | [0-9]+(?:[-/][0-9]+)?$)`,
  );
}

function fipsForVestFeature(feature, year) {
  const countyName = feature?.properties?.[VEST_FIELDS[year].county];
  const fips = FIPS_BY_COUNTY.get(normalizeMaineLabel(countyName));
  if (!fips) {
    throw new Error(`Maine VEST ${year} feature has unknown county ${JSON.stringify(countyName)}`);
  }
  return fips;
}

export function buildMaineVestLocalGeometry(year, units, source, sourceToVestNames) {
  if (!VEST_FIELDS[year]) throw new Error(`Unsupported Maine VEST year: ${year}`);
  const nameField = VEST_FIELDS[year].name;
  const contexts = source.features.map((feature, index) => ({
    feature,
    index,
    fips: fipsForVestFeature(feature, year),
    normalizedName: normalizeMaineLabel(feature?.properties?.[nameField]),
  }));
  const aliases = new Map(
    Object.entries(sourceToVestNames).map(([sourceKey, vestKey]) => [
      sourceKey.slice(0, 3) + "|" + normalizeMaineLabel(sourceKey.slice(3)),
      normalizeMaineLabel(vestKey.slice(3)),
    ]),
  );
  const assigned = new Map();
  const methods = {};
  const features = units.map((unit) => {
    const target = VEST_LOCAL_ALIASES.get(
      `${year}|${unit.countyFips}|${normalizeMaineLabel(unit.label)}`,
    ) ?? aliases.get(`${unit.countyFips}|${normalizeMaineLabel(unit.label)}`)
      ?? normalizeMaineLabel(unit.label);
    let components = contexts.filter(
      (context) => context.fips === unit.countyFips && context.normalizedName === target,
    );
    let method = "vest_reviewed_name_crosswalk";
    if (components.length === 0) {
      const prefix = groupingPrefix(target);
      components = contexts.filter(
        (context) => context.fips === unit.countyFips && prefix.test(context.normalizedName),
      );
      method = "vest_reviewed_component_dissolve";
    }
    if (components.length === 0) {
      components = contexts.filter(
        (context) => context.fips === unit.countyFips
          && context.normalizedName.startsWith(target + " "),
      );
      method = "vest_reviewed_component_dissolve";
    }
    if (components.length === 0) {
      throw new Error(`Maine VEST ${year} has no feature for ${unit.countyFips} ${unit.label} (${target})`);
    }
    ensureComponentAssignment(assigned, components, unit.id);
    methods[method] = (methods[method] ?? 0) + 1;
    return normalizedFeature(unit, components, {
      authority: "Voting and Election Science Team geometry reconstructed from Census, Maine GeoLibrary, and municipal boundary sources",
      method,
    });
  });
  return {
    features,
    assignedSourceFeatures: assigned.size,
    unassignedSourceFeatures: contexts.length - assigned.size,
    methods,
  };
}

export const MAINE_2012_AGGREGATION_GROUPS = Object.freeze({
  BLAINE: ["E TWP"],
  BRIDGEWATER: ["TD R2 WELS"],
  "EAGLE LAKE": ["T15 R6 WELS", "WINTERVILLE PLT"],
  "FORT KENT": ["FORT KENT TWPS"],
  "MORO PLT": ["MORO PLT TWPS"],
  "VAN BUREN": ["VAN BUREN TWPS"],
  EUSTIS: ["EUSTIS FRA TWPS"],
  RANGELEY: ["RANGELEY OXF TWPS", "RANGELEY PLT"],
  WELD: ["WELD TWPS"],
  WILTON: ["WILTON TWPS"],
  AURORA: ["AURORA TWPS"],
  FRANKLIN: ["FRANKLIN TWPS"],
  "GREAT POND": ["GREAT POND TWPS"],
  ANDOVER: ["ANDOVER TWPS"],
  WOODSTOCK: ["MILTON TWP"],
  "EAST MILLINOCKET": ["EAST MILLINOCKET ARO TWPS", "EAST MILLINOCKET PEN TWPS"],
  MEDWAY: ["MATTAWAMKEAG", "MATTAWAMKEAG TWPS", "MEDWAY ARO TWPS", "MEDWAY PEN TWPS"],
  MILLINOCKET: ["MILLINOCKET PEN TWPS", "MILLINOCKET PIS TWPS"],
  "OLD TOWN": ["ALTON", "ARGYLE TWP", "EDINBURG", "PENOB NAT VOTING DIS"],
  BEDDINGTON: ["BEDDINGTON TWPS"],
  CHERRYFIELD: ["T10 SD"],
  COOPER: ["COOPER TWP"],
  WESLEY: ["WESLEY TWPS"],
});

const MAINE_2012_EXPLICIT_ALIASES = Object.freeze({
  "003|bancroft": "Bancroft Twp",
  "003|cary plt": "Cary Twp",
  "003|oxbow plt": "Oxbow North Twp",
  "003|t12 r13": "T9 R8 WELS",
  "003|t15 r9 twp": "T15 R9 WELS",
  "009|fletchers landing twp t8 sd": "Fletchers Landing Twp",
  "009|t3 nd": "T3 ND BPP",
  "015|monhegan plt": "Monhegan Island Plt",
  "019|prentiss twp": "Prentiss Twp T7 R3 NBPP",
  "021|atkinson": "Atkinson Twp",
  "025|rockwood twp": "Rockwood Strip T2 R1 NBKP",
  "029|indian twp": "Indian Twp Res",
  "029|pleasant pt voting dis": "Pleasant Point",
});

export const MAINE_2012_UNMAPPED_ZERO_OR_LOW_VOTE_ROWS = Object.freeze([
  "009|t7 sd",
  "021|beaver cove twp",
  "021|greenville pis twp",
  "025|highland som twp",
  "025|spring lake",
]);

export function buildMaine2012LocalGeometry(units, source) {
  const contexts = source.features.map((feature, index) => ({
    feature,
    index,
    fips: String(feature?.properties?.COUNTYFP ?? "").padStart(3, "0"),
    normalizedName: normalizeMaineLabel(feature?.properties?.Precinct),
  }));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const consumedUnits = new Set();
  const assigned = new Map();
  const unitsForGeometry = [];

  for (const [baseLabel, additionalLabels] of Object.entries(MAINE_2012_AGGREGATION_GROUPS)) {
    const base = units.find((unit) => unit.label === baseLabel);
    if (!base) throw new Error(`Maine 2012 aggregation base is missing: ${baseLabel}`);
    const members = [base, ...additionalLabels.map((label) => {
      const member = units.find(
        (unit) => unit.countyFips === base.countyFips && unit.label === label,
      );
      if (!member) throw new Error(`Maine 2012 aggregation member is missing: ${baseLabel} <- ${label}`);
      return member;
    })];
    for (const member of members) consumedUnits.add(member.id);
    unitsForGeometry.push({
      ...base,
      id: `me-2012-${base.countyFips}-${normalizeMaineLabel(baseLabel).replaceAll(" ", "-")}-aggregate`,
      label: members.map((member) => member.label).join(" / "),
      memberUnitIds: members.map((member) => member.id),
      demVotes: members.reduce((sum, member) => sum + member.demVotes, 0),
      repVotes: members.reduce((sum, member) => sum + member.repVotes, 0),
      otherVotes: members.reduce((sum, member) => sum + member.otherVotes, 0),
      totalVotes: members.reduce((sum, member) => sum + member.totalVotes, 0),
      ballotsCast: members.reduce((sum, member) => sum + member.ballotsCast, 0),
      preferredGeometryName: baseLabel,
      aggregationReason: "The retained MGGG election reconstruction has one reviewed boundary for these separately published Maine SOS local rows",
    });
  }

  for (const unit of units) {
    if (!consumedUnits.has(unit.id)) {
      unitsForGeometry.push({ ...unit, memberUnitIds: [unit.id] });
    }
  }

  const unmappedKeys = new Set(MAINE_2012_UNMAPPED_ZERO_OR_LOW_VOTE_ROWS);
  const mappedUnits = [];
  const excludedUnits = [];
  for (const unit of unitsForGeometry) {
    const unitKey = `${unit.countyFips}|${normalizeMaineLabel(unit.label)}`;
    if (unmappedKeys.has(unitKey)) {
      excludedUnits.push({
        ...unit,
        exclusionReason: "no uniquely attributable 2012 election geometry in the retained source",
      });
      continue;
    }
    const explicitName = unit.preferredGeometryName
      ?? MAINE_2012_EXPLICIT_ALIASES[unitKey]
      ?? unit.label;
    let components = contexts.filter(
      (context) => context.fips === unit.countyFips
        && context.normalizedName === normalizeMaineLabel(explicitName),
    );
    const method = unit.memberUnitIds.length > 1
      ? "mggg_reviewed_aggregate_identity"
      : "mggg_reviewed_name_identity";
    if (components.length !== 1) {
      throw new Error(
        `Maine 2012 ${unit.countyFips} ${unit.label} matched ${components.length} geometry components`,
      );
    }
    ensureComponentAssignment(assigned, components, unit.id);
    mappedUnits.push({
      unit,
      feature: normalizedFeature(unit, components, {
        authority: "Maine GeoLibrary-derived geometry retained and processed by MGGG",
        method,
      }),
      method,
    });
  }

  const memberIds = new Set(
    mappedUnits.flatMap(({ unit }) => unit.memberUnitIds),
  );
  for (const excluded of excludedUnits) {
    for (const memberId of excluded.memberUnitIds) memberIds.add(memberId);
  }
  for (const unit of units) {
    if (!memberIds.has(unit.id) || !byId.has(unit.id)) {
      throw new Error(`Maine 2012 result-unit accounting lost ${unit.id}`);
    }
  }
  return {
    mappedUnits,
    excludedUnits,
    assignedSourceFeatures: assigned.size,
    unassignedSourceFeatures: contexts.length - assigned.size,
  };
}

function groupedUnit(base, members, featureId, label) {
  return {
    ...base,
    id: featureId,
    label,
    memberUnitIds: members.map((member) => member.id),
    demVotes: members.reduce((sum, member) => sum + member.demVotes, 0),
    repVotes: members.reduce((sum, member) => sum + member.repVotes, 0),
    otherVotes: members.reduce((sum, member) => sum + member.otherVotes, 0),
    totalVotes: members.reduce((sum, member) => sum + member.totalVotes, 0),
    ballotsCast: members.reduce((sum, member) => sum + member.ballotsCast, 0),
  };
}

function planarRingArea(ring) {
  return Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

function planarGeometryArea(geometry) {
  return geometryPolygons(geometry).reduce((total, polygon) => (
    total + planarRingArea(polygon[0])
      - polygon.slice(1).reduce((holes, ring) => holes + planarRingArea(ring), 0)
  ), 0);
}

function geometryBounds(geometry) {
  const points = geometryPolygons(geometry).flat(2);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function compareBracketedBoundary(historical, current) {
  const historicalArea = planarGeometryArea(historical);
  const currentArea = planarGeometryArea(current);
  const historicalBounds = geometryBounds(historical);
  const currentBounds = geometryBounds(current);
  const relativeAreaDelta = Math.abs(currentArea - historicalArea) / historicalArea;
  const maximumBoundsDeltaDegrees = Math.max(
    ...historicalBounds.map((value, index) => Math.abs(value - currentBounds[index])),
  );
  if (relativeAreaDelta > 0.00001 || maximumBoundsDeltaDegrees > 0.00002) {
    throw new Error("Maine GeoLibrary T22 MD boundary changed between retained historical and current sources");
  }
  return {
    historicalAreaDegreesSquared: historicalArea,
    currentAreaDegreesSquared: currentArea,
    relativeAreaDelta,
    maximumBoundsDeltaDegrees,
    disposition: "reviewed_unchanged_temporal_bracket",
  };
}

export function assertMaine2024OfficialBoundaryFeatures(source) {
  const features = Array.isArray(source?.features) ? source.features : [];
  const invalid = features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => feature?.properties?.official_boundary !== true);
  if (features.length === 0 || invalid.length) {
    throw new Error(
      `Maine 2024 NYT source must contain only official_boundary=true features; `
      + `${invalid.length} of ${features.length} failed`,
    );
  }
}

export function buildMaine2024LocalGeometry(
  units,
  nytSource,
  geolibraryGapSource,
  historicalGeolibrarySource,
) {
  assertMaine2024OfficialBoundaryFeatures(nytSource);
  const directBySignature = new Map();
  for (const [index, feature] of nytSource.features.entries()) {
    const properties = feature.properties;
    const key = [
      String(properties.GEOID).slice(2, 5),
      Number(properties.votes_dem),
      Number(properties.votes_rep),
      Number(properties.votes_total),
    ].join("|");
    const values = directBySignature.get(key) ?? [];
    values.push({ feature, index });
    directBySignature.set(key, values);
  }
  const assigned = new Map();
  const consumed = new Set();
  const mappedUnits = [];
  for (const unit of units) {
    const key = [unit.countyFips, unit.demVotes, unit.repVotes, unit.totalVotes].join("|");
    const components = directBySignature.get(key) ?? [];
    if (components.length !== 1) continue;
    ensureComponentAssignment(assigned, components, unit.id);
    consumed.add(unit.id);
    mappedUnits.push({
      unit: { ...unit, memberUnitIds: [unit.id] },
      feature: normalizedFeature(unit, components, {
        authority: "New York Times township geometry marked official_boundary and derived from official Maine boundaries",
        method: "nyt_official_boundary_exact_official_vote_signature",
      }),
      method: "nyt_official_boundary_exact_official_vote_signature",
    });
  }

  const unusedNyt = nytSource.features
    .map((feature, index) => ({ feature, index }))
    .filter(({ index }) => !assigned.has(index));
  const remaining = units.filter((unit) => !consumed.has(unit.id));
  const groups = new Map([
    ["2300300000", ["Cross Lake Twp", "E Twp", "Oxbow North Twp", "T11 R4 WELS Twp"]],
    ["2300303070", ["Bridgewater", "TD R2 WELS Twp"]],
    ["2300303170", ["Eagle Lake/T15 R6 WELS Twp", "T15 R6 WELS Twp"]],
    ["2300303430", ["Moro Plantation", "T7 R5 WELS Twp"]],
    ["2300303580", ["Benedicta Twp/Silver Ridge Twp", "Sherman"]],
    ["2300505170", ["Portland"]],
    ["2300909330", ["T3 ND Twp", "Tremont"]],
    ["2301900000", ["Argyle Twp", "Kingman Twp", "Mattamiscontis Twp", "Prentiss Twp"]],
    ["2301919570", ["Herseytown Twp", "Stacyville"]],
    ["2302525150", ["Highland Plantation", "Lexington Twp"]],
    ["2302525320", ["Moxie Gore Twp", "The Forks Plantation"]],
    ["2302929060", ["Beddington"]],
    ["2302900000", ["Cathance Twp", "Centerville Twp"]],
    ["2302929170", ["Danforth/Brookton Twp", "Day Block Twp"]],
    ["2302929220", ["Grand Lake Stream Plantation", "Greenlaw Chopping Twp"]],
    ["2302929832", ["Indian Township", "Sakom Twp"]],
  ]);
  for (const [geoid, labels] of groups) {
    const component = unusedNyt.find(({ feature }) => feature.properties.GEOID === geoid);
    if (!component) throw new Error(`Maine 2024 is missing NYT official-boundary feature ${geoid}`);
    const members = labels.map((label) => {
      const member = remaining.find(
        (unit) => unit.countyFips === geoid.slice(2, 5) && unit.label === label,
      );
      if (!member) throw new Error(`Maine 2024 aggregation ${geoid} is missing ${label}`);
      return member;
    });
    const unit = groupedUnit(
      members[0],
      members,
      `me-2024-${geoid.slice(2, 5)}-${geoid.slice(5)}-aggregate`,
      members.map((member) => member.label).join(" / "),
    );
    ensureComponentAssignment(assigned, [component], unit.id);
    for (const member of members) consumed.add(member.id);
    mappedUnits.push({
      unit,
      feature: normalizedFeature(unit, [component], {
        authority: "New York Times township geometry marked official_boundary and derived from official Maine boundaries",
        method: "nyt_official_boundary_reviewed_aggregate",
      }),
      method: "nyt_official_boundary_reviewed_aggregate",
    });
  }

  const gapUnit = units.find(
    (unit) => unit.countyFips === "009" && unit.label === "T22 MD Twp",
  );
  if (!gapUnit || consumed.has(gapUnit.id)) {
    throw new Error("Maine 2024 T22 MD gap unit is missing or already consumed");
  }
  const gapComponents = geolibraryGapSource.features.map((feature, index) => ({ feature, index }));
  if (gapComponents.length === 0) throw new Error("Maine GeoLibrary T22 MD gap source is empty");
  const historicalGap = historicalGeolibrarySource.features.filter(
    (feature) => normalizeMaineLabel(feature?.properties?.TOWN) === "t22 md bpp",
  );
  if (historicalGap.length !== 1) {
    throw new Error(`Maine historical GeoLibrary source matched ${historicalGap.length} T22 MD features`);
  }
  const gapBoundaryComparison = compareBracketedBoundary(
    historicalGap[0].geometry,
    gapComponents[0].feature.geometry,
  );
  mappedUnits.push({
    unit: { ...gapUnit, memberUnitIds: [gapUnit.id] },
    feature: normalizedFeature(gapUnit, gapComponents, {
      authority: "Maine GeoLibrary Town and Township Boundary Polygons, unchanged across retained 2015 and current snapshots",
      method: "maine_geolibrary_reviewed_temporal_bracket_gap_fill",
    }),
    method: "maine_geolibrary_reviewed_temporal_bracket_gap_fill",
  });
  consumed.add(gapUnit.id);

  const unresolved = units.filter((unit) => !consumed.has(unit.id));
  if (unresolved.length) {
    throw new Error(`Maine 2024 left result units unresolved: ${unresolved.map((unit) => unit.label).join(", ")}`);
  }
  return {
    mappedUnits,
    assignedNytFeatures: assigned.size,
    unassignedNytFeatures: nytSource.features.length - assigned.size,
    gapSourceFeatures: gapComponents.length,
    gapBoundaryComparison,
  };
}
