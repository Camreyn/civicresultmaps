import polygonClipping from "polygon-clipping";

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeWisconsinLabel(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\bST[.]?(?=\s|$)/g, "SAINT")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalWisconsinWardId(value) {
  const normalized = clean(value)
    .toUpperCase()
    .replace(/^WD\s*/, "")
    .replace(/(\d+)\s+([A-Z])$/, "$1$2");
  const match = normalized.match(/^0*(\d+)([A-Z]?)$/);
  if (!match) throw new Error(`Unparseable Wisconsin ward id ${JSON.stringify(value)}`);
  return `${Number(match[1])}${match[2]}`;
}

function wardSort(left, right) {
  const a = left.match(/^(\d+)([A-Z]?)$/);
  const b = right.match(/^(\d+)([A-Z]?)$/);
  return Number(a[1]) - Number(b[1]) || a[2].localeCompare(b[2]);
}

function uniqueWardSet(values) {
  return [...new Set(values)].sort(wardSort);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueAlternatives(alternatives) {
  const output = [];
  for (const alternative of alternatives) {
    const normalized = uniqueWardSet(alternative);
    if (!output.some((prior) => sameSet(prior, normalized))) output.push(normalized);
  }
  return output;
}

function tokenAlternatives(token) {
  const value = clean(token).replace(/\s*-\s*/g, "-");
  if (!value) return [[]];
  if (/^\d+[A-Z]?$/i.test(value)) return [[canonicalWisconsinWardId(value)]];
  const pieces = value.split("-");
  if (pieces.length > 2 && pieces.every((piece) => /^\d+[A-Z]?$/i.test(piece))) {
    // Wisconsin workbooks use chains such as 5-6-9-12 as an explicit ward list.
    return [uniqueWardSet(pieces.map(canonicalWisconsinWardId))];
  }
  const range = value.match(/^(\d+)([A-Z]?)-(\d+)([A-Z]?)$/i);
  if (!range) throw new Error(`Unparseable Wisconsin ward token ${JSON.stringify(token)}`);
  const start = Number(range[1]);
  const end = Number(range[3]);
  const startSuffix = range[2].toUpperCase();
  const endSuffix = range[4].toUpperCase();
  const direct = [`${start}${startSuffix}`, `${end}${endSuffix}`];
  const alternatives = [direct];
  // A descending pair such as "8-7" is a two-ward list in WEC workbooks,
  // never an inclusive range. Preserve both identities and stop here.
  if (start > end) return uniqueAlternatives(alternatives);
  if (!startSuffix && !endSuffix) {
    alternatives.push(Array.from({ length: end - start + 1 }, (_, index) => String(start + index)));
  } else if (startSuffix && startSuffix === endSuffix) {
    alternatives.push(Array.from({ length: end - start + 1 }, (_, index) => `${start + index}${startSuffix}`));
  } else if (start === end && startSuffix && endSuffix) {
    const first = startSuffix.charCodeAt(0);
    const last = endSuffix.charCodeAt(0);
    if (first > last) throw new Error(`Descending Wisconsin ward suffix token ${JSON.stringify(token)}`);
    alternatives.push(Array.from({ length: last - first + 1 }, (_, index) => `${start}${String.fromCharCode(first + index)}`));
  } else if (!startSuffix && endSuffix) {
    if (end > start) {
      alternatives.push([
        ...Array.from({ length: end - start }, (_, index) => String(start + index)),
        `${end}${endSuffix}`,
      ]);
    }
    alternatives.push([
      ...Array.from({ length: end - start + 1 }, (_, index) => String(start + index)),
      `${end}${endSuffix}`,
    ]);
  }
  return uniqueAlternatives(alternatives);
}

export function wisconsinWardExpressionAlternatives(expression) {
  let normalized = clean(expression)
    .toUpperCase()
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\bCOMBINED\b/g, "")
    .replace(/\bFIREHOUSE\b|\bTOWN HALL\b/g, "")
    .replace(/^[-\s]+/, "")
    .replace(/\bWD\s*/g, "")
    .replace(/^I$/, "1")
    .replace(/[+&]/g, ",")
    .replace(/\bAND\b/g, ",")
    .replace(/[.]/g, ",")
    .replace(/(\d+)\s+([A-Z])\b/g, "$1$2")
    .trim();
  if (/^\d+(?:\s+\d+)+$/.test(normalized)) normalized = normalized.replace(/\s+/g, ",");
  const tokens = normalized.split(",").map(clean).filter(Boolean);
  if (tokens.length === 0) return [];
  let combined = [[]];
  for (const token of tokens) {
    const next = [];
    for (const prefix of combined) {
      for (const suffix of tokenAlternatives(token)) {
        const candidate = [...prefix, ...suffix];
        if (new Set(candidate).size === candidate.length) next.push(candidate);
      }
    }
    combined = next;
  }
  const output = uniqueAlternatives(combined);
  if (output.length === 0) {
    throw new Error(`Wisconsin ward expression has no non-overlapping interpretation: ${JSON.stringify(expression)}`);
  }
  return output;
}

export function parseWisconsinReportingUnitLabel(label) {
  const value = clean(label);
  const match = value.match(/^(TOWN|VILLAGE|CITY) OF (.+?)\s+WARDS?(?:\s*[,;:]?\s*(.*))?$/i);
  if (!match) throw new Error(`Unparseable Wisconsin reporting-unit label ${JSON.stringify(label)}`);
  const expression = clean(match[3]);
  return {
    municipalityType: match[1].toUpperCase(),
    ctv: { TOWN: "T", VILLAGE: "V", CITY: "C" }[match[1].toUpperCase()],
    municipalityName: clean(match[2]),
    wardExpression: expression || null,
    alternatives: expression ? wisconsinWardExpressionAlternatives(expression) : [],
  };
}

function sourceField(feature, field) {
  const properties = feature?.properties ?? feature?.attributes ?? {};
  return typeof field === "function" ? field(properties, feature) : properties[field];
}

function municipalityKey(county, ctv, municipality) {
  return `${normalizeWisconsinLabel(county)}|${clean(ctv).toUpperCase()}|${normalizeWisconsinLabel(municipality)}`;
}

export function wisconsinResultRowKey(countyName, reportingUnitLabel) {
  return `${normalizeWisconsinLabel(countyName)}|${normalizeWisconsinLabel(reportingUnitLabel)}`;
}

function candidateKey(candidate) {
  return candidate.join("|");
}

function exactCover(rows, wardIds, requireAllSourceFeatures) {
  const available = new Set(wardIds);
  const prepared = rows.map((row, index) => {
    const candidates = (row.parsed.alternatives.length > 0
      ? row.parsed.alternatives
      : rows.length === 1 ? [wardIds] : [])
      .map(uniqueWardSet)
      .filter((candidate) => candidate.length > 0 && candidate.every((ward) => available.has(ward)));
    return { index, row, candidates: uniqueAlternatives(candidates).sort((left, right) => right.length - left.length) };
  });
  if (requireAllSourceFeatures && prepared.some((entry) => entry.candidates.length === 0)) return [];
  const matchable = prepared.filter((entry) => entry.candidates.length > 0);
  matchable.sort((left, right) => left.candidates.length - right.candidates.length || left.index - right.index);
  const solutions = [];
  let bestAssignedCount = -1;
  const chosen = new Map();
  const used = new Set();
  function visit(position) {
    if (requireAllSourceFeatures && solutions.length > 1) return;
    if (!requireAllSourceFeatures && solutions.length > 1) {
      const remainingUpperBound = matchable.slice(position).reduce(
        (sum, entry) => sum + Math.max(0, ...entry.candidates.map((candidate) => candidate.length)),
        used.size,
      );
      if (remainingUpperBound <= bestAssignedCount) return;
    }
    if (position === matchable.length) {
      if (requireAllSourceFeatures && used.size !== available.size) return;
      if (!requireAllSourceFeatures && used.size < bestAssignedCount) return;
      const solution = rows.map((_, index) => chosen.get(index) ?? null);
      if (!requireAllSourceFeatures && used.size > bestAssignedCount) {
        solutions.length = 0;
        bestAssignedCount = used.size;
      }
      if (solutions.length < 2) solutions.push(solution);
      return;
    }
    const entry = matchable[position];
    for (const candidate of entry.candidates) {
      if (candidate.some((ward) => used.has(ward))) continue;
      for (const ward of candidate) used.add(ward);
      chosen.set(entry.index, candidate);
      visit(position + 1);
      chosen.delete(entry.index);
      for (const ward of candidate) used.delete(ward);
    }
  }
  visit(0);
  return solutions;
}

export function resolveWisconsinWardRelationships(options) {
  const {
    resultRows,
    sourceFeatures,
    fields,
    aliases = {},
    resultWardOverrides = {},
    sourceWardOverrides = {},
    requireComplete = true,
    requireAllSourceFeatures = true,
  } = options;
  if (!Array.isArray(resultRows) || !Array.isArray(sourceFeatures)) {
    throw new Error("Wisconsin relationship resolver requires resultRows and sourceFeatures arrays");
  }
  const aliasMap = new Map(Object.entries(aliases).map(([from, to]) => {
    const target = clean(to);
    const typed = target.match(/^([CTV])\s*[|:]\s*(.+)$/i);
    return [normalizeWisconsinLabel(from), {
      ctv: typed ? typed[1].toUpperCase() : null,
      municipalityName: normalizeWisconsinLabel(typed ? typed[2] : target),
    }];
  }));
  const reviewedResultOverrides = new Map(Object.entries(resultWardOverrides).map(([key, value]) => {
    if (!Array.isArray(value?.wardIds) || value.wardIds.length === 0 || !clean(value.note)) {
      throw new Error(`Wisconsin reviewed result override ${key} requires wardIds and a note`);
    }
    return [normalizeWisconsinLabel(key), {
      wardIds: uniqueWardSet(value.wardIds.map(canonicalWisconsinWardId)),
      note: clean(value.note),
    }];
  }));
  const reviewedSourceOverrides = new Map(Object.entries(sourceWardOverrides).map(([featureId, wardId]) => [
    clean(featureId),
    canonicalWisconsinWardId(wardId),
  ]));
  const sourceGroups = new Map();
  const sourceContexts = sourceFeatures.map((feature, index) => {
    const countyName = clean(sourceField(feature, fields.countyName));
    const countyFips = clean(sourceField(feature, fields.countyFips));
    const ctv = clean(sourceField(feature, fields.ctv)).toUpperCase();
    const municipalityName = clean(sourceField(feature, fields.municipalityName));
    const featureId = clean(sourceField(feature, fields.featureId)) || `feature-${index + 1}`;
    const wardId = reviewedSourceOverrides.get(featureId)
      ?? canonicalWisconsinWardId(sourceField(feature, fields.wardId));
    if (!countyName || !/^55\d{3}$/.test(countyFips) || !/^[CTV]$/.test(ctv) || !municipalityName || !featureId) {
      throw new Error(`Wisconsin source feature ${index} lacks an exact county/municipality/ward identity`);
    }
    const context = { feature, index, countyName, countyFips, ctv, municipalityName, wardId, featureId };
    const key = municipalityKey(countyName, ctv, municipalityName);
    const group = sourceGroups.get(key) ?? [];
    group.push(context);
    sourceGroups.set(key, group);
    return context;
  });
  const resultGroups = new Map();
  const parsedRows = resultRows.map((row, index) => {
    const parsed = parseWisconsinReportingUnitLabel(row.reportingUnitLabel);
    const explicitMunicipality = clean(row.municipalityName);
    if (explicitMunicipality && normalizeWisconsinLabel(explicitMunicipality.replace(/^(TOWN|VILLAGE|CITY) OF\s+/i, "")) !== normalizeWisconsinLabel(parsed.municipalityName)) {
      throw new Error(`Wisconsin result row ${index} municipality and reporting-unit labels disagree`);
    }
    const countyName = clean(row.countyName);
    const aliasKey = `${countyName}|${parsed.ctv}|${parsed.municipalityName}`;
    const alias = aliasMap.get(normalizeWisconsinLabel(aliasKey));
    const targetCtv = alias?.ctv ?? parsed.ctv;
    const targetName = alias?.municipalityName ?? normalizeWisconsinLabel(parsed.municipalityName);
    const key = `${normalizeWisconsinLabel(countyName)}|${targetCtv}|${targetName}`;
    const override = reviewedResultOverrides.get(normalizeWisconsinLabel(wisconsinResultRowKey(countyName, row.reportingUnitLabel))) ?? null;
    const context = { ...row, index, parsed: override ? { ...parsed, alternatives: [override.wardIds] } : parsed, municipalityKey: key, override };
    const group = resultGroups.get(key) ?? [];
    group.push(context);
    resultGroups.set(key, group);
    return context;
  });
  const resolved = [];
  const missingSourceGroups = [];
  const noExactCover = [];
  const ambiguousGroups = [];
  const partialGroups = [];
  const assignedFeatures = new Map();
  for (const [key, rows] of resultGroups) {
    const sources = sourceGroups.get(key);
    if (!sources) {
      missingSourceGroups.push({ key, resultRows: rows.map((row) => row.reportingUnitLabel) });
      continue;
    }
    const byWard = new Map();
    for (const source of sources) {
      const group = byWard.get(source.wardId) ?? [];
      group.push(source);
      byWard.set(source.wardId, group);
    }
    const wardIds = [...byWard.keys()].sort(wardSort);
    const solutions = exactCover(rows, wardIds, requireAllSourceFeatures);
    if (solutions.length === 0) {
      noExactCover.push({
        key,
        sourceWardIds: wardIds,
        resultRows: rows.map((row) => ({ label: row.reportingUnitLabel, alternatives: row.parsed.alternatives })),
      });
      continue;
    }
    if (solutions.length > 1) {
      ambiguousGroups.push({ key, sourceWardIds: wardIds, resultRows: rows.map((row) => row.reportingUnitLabel) });
      continue;
    }
    const unresolvedInGroup = rows.filter((_, index) => solutions[0][index] == null);
    if (unresolvedInGroup.length > 0) {
      partialGroups.push({
        key,
        sourceWardIds: wardIds,
        unresolvedResultRows: unresolvedInGroup.map((row) => row.reportingUnitLabel),
      });
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const wardIdsForRow = solutions[0][index];
      if (wardIdsForRow == null) continue;
      const components = wardIdsForRow.flatMap((wardId) => byWard.get(wardId));
      for (const component of components) {
        const previous = assignedFeatures.get(component.index);
        if (previous != null) throw new Error(`Wisconsin source feature ${component.index} assigned to result rows ${previous} and ${row.index}`);
        assignedFeatures.set(component.index, row.index);
      }
      resolved.push({
        row,
        wardIds: wardIdsForRow,
        components,
        method: row.override ? "reviewed_explicit_ward_override" : "reviewed_exact_municipality_ward_partition",
        reviewNote: row.override?.note ?? null,
      });
    }
  }
  const unassignedSourceFeatures = sourceContexts.filter((context) => !assignedFeatures.has(context.index));
  const resultRowsResolved = new Set(resolved.map((relationship) => relationship.row.index));
  const unresolvedResultRows = parsedRows.filter((row) => !resultRowsResolved.has(row.index));
  const summary = {
    resultRows: resultRows.length,
    sourceFeatures: sourceFeatures.length,
    resultMunicipalities: resultGroups.size,
    sourceMunicipalities: sourceGroups.size,
    resolvedResultRows: resolved.length,
    unresolvedResultRows: unresolvedResultRows.length,
    assignedSourceFeatures: assignedFeatures.size,
    unassignedSourceFeatures: unassignedSourceFeatures.length,
    missingSourceGroups: missingSourceGroups.length,
    noExactCoverGroups: noExactCover.length,
    ambiguousGroups: ambiguousGroups.length,
    partialGroups: partialGroups.length,
  };
  if (requireComplete && (summary.unresolvedResultRows || (requireAllSourceFeatures && summary.unassignedSourceFeatures) || summary.missingSourceGroups || summary.noExactCoverGroups || summary.ambiguousGroups)) {
    throw new Error(`Wisconsin exact ward partition is incomplete: ${JSON.stringify({ summary, missingSourceGroups: missingSourceGroups.slice(0, 10), noExactCover: noExactCover.slice(0, 10), ambiguousGroups: ambiguousGroups.slice(0, 10), partialGroups: partialGroups.slice(0, 10), unassignedSourceFeatures: unassignedSourceFeatures.slice(0, 10).map((context) => ({ countyName: context.countyName, ctv: context.ctv, municipalityName: context.municipalityName, wardId: context.wardId, featureId: context.featureId })) })}`);
  }
  return {
    resolved,
    summary,
    diagnostics: { missingSourceGroups, noExactCover, ambiguousGroups, partialGroups, unresolvedResultRows, unassignedSourceFeatures },
  };
}

function geometryPolygons(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Wisconsin ward component must be Polygon or MultiPolygon, not ${geometry?.type}`);
}

export function unionWisconsinWardGeometries(geometries) {
  const polygons = geometries.flatMap(geometryPolygons);
  if (polygons.length === 0) throw new Error("Wisconsin reporting unit requires at least one polygon component");
  const coordinates = polygons.length === 1 ? [polygons[0]] : polygonClipping.union(...polygons);
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error("Wisconsin polygon union returned no geometry");
  return coordinates.length === 1
    ? { type: "Polygon", coordinates: coordinates[0] }
    : { type: "MultiPolygon", coordinates };
}

export function wisconsinWardAlternativeKey(alternative) {
  return candidateKey(uniqueWardSet(alternative));
}
