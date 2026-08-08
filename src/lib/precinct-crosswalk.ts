import {
  reportingUnitCode,
  type PrecinctGeometryManifest,
} from "./precinct-geography.ts";

export type CrosswalkRelationshipType =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "unmatched"
  | "non_geographic"
  | "source_alias";

export type PrecinctCrosswalkRelationship = {
  sourceFeatureId: string | null;
  relationshipType: CrosswalkRelationshipType;
  matchMethod:
    | "exact_official_id"
    | "official_crosswalk"
    | "reviewed_name"
    | "normalized_name_candidate"
    | "source_ordinal_candidate"
    | "spatial_review"
    | "digitized";
  reviewStatus: "pending" | "reviewed" | "rejected";
  confidence: "high" | "medium" | "low";
  note: string;
};

export type PrecinctCrosswalkRow = {
  resultUnitCode: string;
  sourceUnitId: string;
  sourceDisplayName: string;
  parentGeoid: string | null;
  reportingGrain: string;
  isGeographic: boolean;
  relationships: PrecinctCrosswalkRelationship[];
  aliasOfResultUnitCode?: string | null;
};

export type PrecinctCrosswalkReconciliationScope = {
  scopeType: "state" | "parent";
  scopeId: string;
  resultTotals: Record<string, number>;
  mappedTotals: Record<string, number>;
  deltas: Record<string, number>;
};

export type PrecinctCrosswalkDocument = {
  schemaVersion: 1;
  manifestId: string;
  state: string;
  electionId: string;
  geographyLevel: string;
  resultSourceId: string;
  generatedAt: string;
  rows: PrecinctCrosswalkRow[];
  reconciliation: {
    status: "passed" | "failed" | "not_run";
    scopes: PrecinctCrosswalkReconciliationScope[];
  };
};

export type PrecinctCrosswalkSummary = {
  resultUnits: number;
  colorableResultUnits: number;
  matchedResultUnits: number;
  unmatchedResultUnits: number;
  nonGeographicResultUnits: number;
  sourceAliasResultUnits: number;
  relationships: {
    oneToOne: number;
    oneToMany: number;
    manyToOne: number;
    unmatched: number;
    nonGeographic: number;
    sourceAlias: number;
    pendingReview: number;
  };
};

export type PrecinctCrosswalkInspection = {
  errors: string[];
  summary: PrecinctCrosswalkSummary;
};

const relationshipTypes = new Set([
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "unmatched",
  "non_geographic",
  "source_alias",
]);
const matchMethods = new Set([
  "exact_official_id",
  "official_crosswalk",
  "reviewed_name",
  "normalized_name_candidate",
  "source_ordinal_candidate",
  "spatial_review",
  "digitized",
]);
const reviewStatuses = new Set(["pending", "reviewed", "rejected"]);
const confidenceValues = new Set(["high", "medium", "low"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptySummary(): PrecinctCrosswalkSummary {
  return {
    resultUnits: 0,
    colorableResultUnits: 0,
    matchedResultUnits: 0,
    unmatchedResultUnits: 0,
    nonGeographicResultUnits: 0,
    sourceAliasResultUnits: 0,
    relationships: {
      oneToOne: 0,
      oneToMany: 0,
      manyToOne: 0,
      unmatched: 0,
      nonGeographic: 0,
      sourceAlias: 0,
      pendingReview: 0,
    },
  };
}

function exactObjectNumberKeys(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, number> {
  if (!isRecord(value)) {
    errors.push(path + " must be an object of finite numbers");
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, numberValue] of Object.entries(value)) {
    if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
      errors.push(path + "." + key + " must be a finite number");
    } else {
      result[key] = numberValue;
    }
  }
  if (Object.keys(result).length === 0) {
    errors.push(path + " must contain at least one total field");
  }
  return result;
}

function inspectReconciliation(
  value: unknown,
  requirePassed: boolean,
  errors: string[],
) {
  if (!isRecord(value)) {
    errors.push("crosswalk.reconciliation must be an object");
    return;
  }
  const status = String(value.status ?? "");
  if (!["passed", "failed", "not_run"].includes(status)) {
    errors.push("crosswalk.reconciliation.status is invalid");
  }
  if (!Array.isArray(value.scopes)) {
    errors.push("crosswalk.reconciliation.scopes must be an array");
    return;
  }
  if (requirePassed && value.scopes.length === 0) {
    errors.push("reviewed crosswalk reconciliation must contain scopes");
  }

  let nonzeroDelta = false;
  for (const [index, scopeValue] of value.scopes.entries()) {
    const path = "crosswalk.reconciliation.scopes[" + index + "]";
    if (!isRecord(scopeValue)) {
      errors.push(path + " must be an object");
      continue;
    }
    const scopeType = String(scopeValue.scopeType ?? "");
    if (!["state", "parent"].includes(scopeType)) {
      errors.push(path + ".scopeType is invalid");
    }
    if (!String(scopeValue.scopeId ?? "").trim()) {
      errors.push(path + ".scopeId is required");
    }
    const resultTotals = exactObjectNumberKeys(
      scopeValue.resultTotals,
      path + ".resultTotals",
      errors,
    );
    const mappedTotals = exactObjectNumberKeys(
      scopeValue.mappedTotals,
      path + ".mappedTotals",
      errors,
    );
    const deltas = exactObjectNumberKeys(
      scopeValue.deltas,
      path + ".deltas",
      errors,
    );
    const keys = new Set([
      ...Object.keys(resultTotals),
      ...Object.keys(mappedTotals),
      ...Object.keys(deltas),
    ]);
    for (const key of keys) {
      if (
        !(key in resultTotals)
        || !(key in mappedTotals)
        || !(key in deltas)
      ) {
        errors.push(path + " totals must use identical field keys");
        continue;
      }
      const expectedDelta = mappedTotals[key] - resultTotals[key];
      if (deltas[key] !== expectedDelta) {
        errors.push(path + ".deltas." + key + " does not equal mapped minus result");
      }
      if (deltas[key] !== 0) {
        nonzeroDelta = true;
      }
    }
  }

  if (status === "passed" && nonzeroDelta) {
    errors.push("passed reconciliation cannot contain nonzero deltas");
  }
  if (requirePassed && status !== "passed") {
    errors.push("reviewed crosswalk reconciliation must pass");
  }
}

function compareSummary(
  summary: PrecinctCrosswalkSummary,
  manifest: PrecinctGeometryManifest,
  errors: string[],
) {
  const expected = manifest.crosswalk;
  for (const key of [
    "resultUnits",
    "colorableResultUnits",
    "matchedResultUnits",
    "unmatchedResultUnits",
    "nonGeographicResultUnits",
    "sourceAliasResultUnits",
  ] as const) {
    if (summary[key] !== expected[key]) {
      errors.push(
        "crosswalk summary "
        + key
        + " "
        + summary[key]
        + " does not match manifest "
        + expected[key],
      );
    }
  }
  for (const key of [
    "oneToOne",
    "oneToMany",
    "manyToOne",
    "unmatched",
    "nonGeographic",
    "sourceAlias",
    "pendingReview",
  ] as const) {
    if (summary.relationships[key] !== expected.relationships[key]) {
      errors.push(
        "crosswalk relationship "
        + key
        + " "
        + summary.relationships[key]
        + " does not match manifest "
        + expected.relationships[key],
      );
    }
  }
}

export function inspectPrecinctCrosswalk(
  value: unknown,
  manifest: PrecinctGeometryManifest,
  knownFeatureIds?: ReadonlySet<string>,
  knownFeatureParents?: ReadonlyMap<string, string>,
): PrecinctCrosswalkInspection {
  const errors: string[] = [];
  const summary = emptySummary();
  if (!isRecord(value)) {
    return {
      errors: ["crosswalk must be an object"],
      summary,
    };
  }
  if (value.schemaVersion !== 1) {
    errors.push("crosswalk.schemaVersion must equal 1");
  }
  if (value.manifestId !== manifest.id) {
    errors.push("crosswalk.manifestId does not match the geometry manifest");
  }
  if (value.state !== manifest.state) {
    errors.push("crosswalk.state does not match the geometry manifest");
  }
  if (value.electionId !== manifest.election.id) {
    errors.push("crosswalk.electionId does not match the geometry manifest");
  }
  if (value.geographyLevel !== manifest.geography.level) {
    errors.push("crosswalk.geographyLevel does not match the geometry manifest");
  }
  if (value.resultSourceId !== manifest.crosswalk.resultSourceId) {
    errors.push("crosswalk.resultSourceId does not match the geometry manifest");
  }
  if (Number.isNaN(Date.parse(String(value.generatedAt ?? "")))) {
    errors.push("crosswalk.generatedAt must be an ISO timestamp");
  }
  if (!Array.isArray(value.rows)) {
    errors.push("crosswalk.rows must be an array");
    return { errors, summary };
  }

  const resultCodes = new Set<string>();
  const resultUnitMetadata = new Map<
    string,
    { parentGeoid: string | null; isGeographic: boolean }
  >();
  const aliases: Array<{ path: string; resultUnitCode: string; aliasOfResultUnitCode: string; parentGeoid: string | null }> = [];
  const featureUses = new Map<
    string,
    Array<{ resultUnitCode: string; relationshipType: string }>
  >();

  for (const [index, rowValue] of value.rows.entries()) {
    const path = "crosswalk.rows[" + index + "]";
    if (!isRecord(rowValue)) {
      errors.push(path + " must be an object");
      continue;
    }
    const resultUnitCode = String(rowValue.resultUnitCode ?? "").trim();
    const sourceUnitId = String(rowValue.sourceUnitId ?? "").trim();
    const sourceDisplayName = String(rowValue.sourceDisplayName ?? "").trim();
    const parentGeoid = String(rowValue.parentGeoid ?? "").trim() || null;
    const reportingGrain = String(rowValue.reportingGrain ?? "").trim().toLowerCase();
    const isGeographic = rowValue.isGeographic;
    const aliasOfResultUnitCode =
      String(rowValue.aliasOfResultUnitCode ?? "").trim()
      || null;

    if (!sourceUnitId) {
      errors.push(path + ".sourceUnitId is required");
    }
    if (!sourceDisplayName) {
      errors.push(path + ".sourceDisplayName is required");
    }
    if (!reportingGrain) {
      errors.push(path + ".reportingGrain is required");
    }
    if (typeof isGeographic !== "boolean") {
      errors.push(path + ".isGeographic must be a boolean");
    }
    if (isGeographic === true && !parentGeoid) {
      errors.push(path + ".parentGeoid is required for a geographic result unit");
    }
    try {
      const expectedCode = reportingUnitCode({
        state: manifest.state,
        electionId: manifest.election.id,
        reportingGrain,
        parentGeoid,
        sourceUnitId,
      });
      if (resultUnitCode !== expectedCode) {
        errors.push(path + ".resultUnitCode is not the canonical reporting-unit code");
      }
    } catch (error) {
      errors.push(path + ": " + (error as Error).message);
    }
    if (resultCodes.has(resultUnitCode)) {
      errors.push(path + " duplicates resultUnitCode " + resultUnitCode);
    }
    resultCodes.add(resultUnitCode);
    resultUnitMetadata.set(resultUnitCode, { parentGeoid, isGeographic: isGeographic === true });

    summary.resultUnits += 1;

    if (!Array.isArray(rowValue.relationships) || rowValue.relationships.length === 0) {
      errors.push(path + ".relationships must not be empty");
      continue;
    }

    const relationships: Array<Record<string, unknown>> = [];
    for (const [relationshipIndex, relationshipValue] of rowValue.relationships.entries()) {
      const relationshipPath =
        path + ".relationships[" + relationshipIndex + "]";
      if (!isRecord(relationshipValue)) {
        errors.push(relationshipPath + " must be an object");
        continue;
      }
      const relationshipType = String(
        relationshipValue.relationshipType ?? "",
      );
      const matchMethod = String(relationshipValue.matchMethod ?? "");
      const reviewStatus = String(relationshipValue.reviewStatus ?? "");
      const confidence = String(relationshipValue.confidence ?? "");
      const sourceFeatureId =
        relationshipValue.sourceFeatureId === null
          ? null
          : String(relationshipValue.sourceFeatureId ?? "").trim();

      if (!relationshipTypes.has(relationshipType)) {
        errors.push(relationshipPath + ".relationshipType is invalid");
      }
      if (!matchMethods.has(matchMethod)) {
        errors.push(relationshipPath + ".matchMethod is invalid");
      }
      if (!reviewStatuses.has(reviewStatus)) {
        errors.push(relationshipPath + ".reviewStatus is invalid");
      }
      if (!confidenceValues.has(confidence)) {
        errors.push(relationshipPath + ".confidence is invalid");
      }
      if (typeof relationshipValue.note !== "string") {
        errors.push(relationshipPath + ".note must be a string");
      }
      if (
        ["unmatched", "non_geographic", "source_alias"].includes(relationshipType)
        && sourceFeatureId !== null
      ) {
        errors.push(relationshipPath + " must not reference a geometry feature");
      }
      if (
        ["one_to_one", "one_to_many", "many_to_one"].includes(relationshipType)
        && !sourceFeatureId
      ) {
        errors.push(relationshipPath + " must reference a geometry feature");
      }
      if (
        sourceFeatureId
        && knownFeatureIds
        && !knownFeatureIds.has(sourceFeatureId)
      ) {
        errors.push(relationshipPath + " references an unknown geometry feature");
      }
      if (
        sourceFeatureId
        && knownFeatureParents?.has(sourceFeatureId)
        && knownFeatureParents.get(sourceFeatureId) !== parentGeoid
      ) {
        errors.push(
          relationshipPath
          + " references geometry from a different parent",
        );
      }
      if (sourceFeatureId) {
        const uses = featureUses.get(sourceFeatureId) ?? [];
        uses.push({ resultUnitCode, relationshipType });
        featureUses.set(sourceFeatureId, uses);
      }
      relationships.push({
        relationshipType,
        reviewStatus,
        sourceFeatureId,
      });
    }

    const rowTypes = new Set(
      relationships.map((relationship) => String(relationship.relationshipType)),
    );
    if (rowTypes.size !== 1) {
      errors.push(path + " cannot mix relationship types");
      continue;
    }
    const relationshipType = String(relationships[0]?.relationshipType ?? "");
    if (isGeographic === true) {
      summary.colorableResultUnits += 1;
    } else if (relationshipType === "source_alias") {
      summary.sourceAliasResultUnits += 1;
    } else if (isGeographic === false) {
      summary.nonGeographicResultUnits += 1;
    }
    if (relationshipType === "source_alias") {
      if (!aliasOfResultUnitCode) {
        errors.push(path + ".aliasOfResultUnitCode is required for a source alias");
      } else {
        aliases.push({
          path,
          resultUnitCode,
          aliasOfResultUnitCode,
          parentGeoid,
        });
      }
    } else if (aliasOfResultUnitCode) {
      errors.push(
        path
        + ".aliasOfResultUnitCode is only valid for a source_alias relationship",
      );
    }

    const hasPending = relationships.some(
      (relationship) => relationship.reviewStatus !== "reviewed",
    );
    if (hasPending) {
      summary.relationships.pendingReview += 1;
    } else if (relationshipType === "one_to_one") {
      summary.relationships.oneToOne += 1;
    } else if (relationshipType === "one_to_many") {
      summary.relationships.oneToMany += 1;
    } else if (relationshipType === "many_to_one") {
      summary.relationships.manyToOne += 1;
    } else if (relationshipType === "unmatched") {
      summary.relationships.unmatched += 1;
    } else if (relationshipType === "non_geographic") {
      summary.relationships.nonGeographic += 1;
    } else if (relationshipType === "source_alias") {
      summary.relationships.sourceAlias += 1;
    }

    if (
      isGeographic === false
      && !["non_geographic", "source_alias"].includes(relationshipType)
    ) {
      errors.push(
        path
        + " non-geographic unit must use non_geographic or source_alias relationship",
      );
    }
    if (
      isGeographic === true
      && ["non_geographic", "source_alias"].includes(relationshipType)
    ) {
      errors.push(path + " geographic unit cannot use " + relationshipType + " relationship");
    }
    if (relationshipType === "one_to_one" && relationships.length !== 1) {
      errors.push(path + " one_to_one relationship must reference exactly one feature");
    }
    if (relationshipType === "one_to_many" && relationships.length < 2) {
      errors.push(path + " one_to_many relationship must reference at least two features");
    }
    if (relationshipType === "many_to_one" && relationships.length !== 1) {
      errors.push(path + " many_to_one relationship must reference exactly one feature");
    }
    if (relationshipType === "unmatched") {
      summary.unmatchedResultUnits += 1;
    } else if (!["non_geographic", "source_alias"].includes(relationshipType)) {
      summary.matchedResultUnits += 1;
    }
  }

  for (const alias of aliases) {
    if (alias.aliasOfResultUnitCode === alias.resultUnitCode) {
      errors.push(alias.path + ".aliasOfResultUnitCode cannot reference itself");
      continue;
    }
    const target = resultUnitMetadata.get(alias.aliasOfResultUnitCode);
    if (!target) {
      errors.push(
        alias.path
        + ".aliasOfResultUnitCode references an unknown result unit",
      );
      continue;
    }
    if (!target.isGeographic) {
      errors.push(
        alias.path
        + ".aliasOfResultUnitCode must reference a geographic result unit",
      );
    }
    if (target.parentGeoid !== alias.parentGeoid) {
      errors.push(
        alias.path
        + ".aliasOfResultUnitCode references a result unit from a different parent",
      );
    }
  }

  for (const [featureId, uses] of featureUses) {
    if (
      uses.length > 1
      && uses.some((use) => use.relationshipType !== "many_to_one")
    ) {
      errors.push(
        "geometry feature "
        + featureId
        + " is reused without many_to_one relationships",
      );
    }
    if (
      uses.length === 1
      && uses[0].relationshipType === "many_to_one"
    ) {
      errors.push(
        "geometry feature "
        + featureId
        + " declares many_to_one but has only one result unit",
      );
    }
  }

  compareSummary(summary, manifest, errors);
  inspectReconciliation(
    value.reconciliation,
    manifest.crosswalk.status === "reviewed",
    errors,
  );
  if (
    manifest.crosswalk.status === "reviewed"
    && summary.relationships.pendingReview > 0
  ) {
    errors.push("reviewed crosswalk cannot contain pending relationships");
  }

  return { errors, summary };
}
