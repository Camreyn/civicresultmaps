import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SWING_STATES = ["AZ", "GA", "MI", "NV", "NC", "PA", "TX", "WI"];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = process.argv[2] ?? ".etl/staging";
const outPath = process.argv[3] ?? "data/swing-state-2024-parity-status.json";

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
}

function readJsonIfExists(file) {
  const fullPath = path.join(repoRoot, file);
  return fs.existsSync(fullPath) ? JSON.parse(fs.readFileSync(fullPath, "utf8")) : null;
}

function readReviewPolicy() {
  const text = fs.readFileSync(path.join(repoRoot, "src/lib/review-policy.ts"), "utf8");
  return Object.fromEntries(
    [...text.matchAll(/^\s*(\w+):\s*([0-9.]+),/gm)].map(([, key, value]) => [key, Number(value)]),
  );
}

function sourceById(config, sourceId) {
  return config.sources?.find((source) => source.id === sourceId) ?? null;
}

function compactSource(source) {
  if (!source) {
    return null;
  }
  return {
    id: source.id,
    category: source.category,
    status: source.status,
    parser: source.parser,
    localFile: source.localFile,
    url: source.url,
    authority: source.authority,
  };
}

function normalizeJurisdictionName(name) {
  return String(name ?? "").trim().replace(/\s+County$/i, "");
}

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function cityNameForWard(localUnit) {
  const match = String(localUnit || "").match(/^\s*city of\s+(.+?)\s+(?:wards?|precincts?)\b/i);
  return match ? titleCase(match[1]) : null;
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function pearsonSafe(xs, ys) {
  const pairs = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 2) {
    return 0;
  }

  const xAverage = average(pairs.map(([x]) => x));
  const yAverage = average(pairs.map(([, y]) => y));
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - xAverage) * (y - yAverage), 0);
  const xDenominator = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - xAverage) ** 2, 0));
  const yDenominator = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - yAverage) ** 2, 0));

  return xDenominator && yDenominator ? numerator / (xDenominator * yDenominator) : 0;
}

function scopesForReviewRows(stateCode, rows, policy) {
  const byCounty = new Map();

  for (const row of rows) {
    if (!row.county) {
      continue;
    }
    const county = normalizeJurisdictionName(row.county);
    byCounty.set(county, [...(byCounty.get(county) ?? []), row]);
  }

  const scopes = Array.from(byCounty.entries()).map(([county, countyRows]) => ({
    county,
    jurisdictionName: county,
    level: "county",
    rows: countyRows,
    scopeKey: `county:${county}`,
  }));

  if (stateCode !== "WI") {
    return scopes;
  }

  const cityGroups = new Map();
  for (const row of rows) {
    const city = cityNameForWard(row.localUnit ?? row.ward);
    if (!city || !row.county) {
      continue;
    }
    const county = normalizeJurisdictionName(row.county);
    const key = `${county.toLowerCase()}|${city.toLowerCase()}`;
    const group = cityGroups.get(key) ?? { city, county, rows: [] };
    group.rows.push(row);
    cityGroups.set(key, group);
  }

  for (const group of cityGroups.values()) {
    if (group.rows.length < policy.minWardRows) {
      continue;
    }
    const cityLocalUnits = new Set(group.rows.map((row) => row.localUnit ?? row.ward));
    const countyRows = byCounty.get(group.county) ?? [];
    const restRows = countyRows.filter((row) => !cityLocalUnits.has(row.localUnit ?? row.ward));
    if (!restRows.length) {
      continue;
    }
    scopes.push({
      city: group.city,
      county: group.county,
      jurisdictionName: `${group.city}, ${group.county} County`,
      level: "city",
      rows: group.rows,
      scopeKey: `city:${group.county}:${group.city}`,
    });
    scopes.push({
      city: group.city,
      county: group.county,
      jurisdictionName: `${group.county} County outside ${group.city}`,
      level: "rest_of_county",
      rows: restRows,
      scopeKey: `rest_of_county:${group.county}:${group.city}`,
    });
  }

  return scopes;
}

function metricsForRows(rows, policy) {
  const trumpCorrelation = pearsonSafe(
    rows.map((row) => row.trump ?? 0),
    rows.map((row) => row.trumpShare ?? 0),
  );
  const harrisCorrelation = pearsonSafe(
    rows.map((row) => row.harris ?? 0),
    rows.map((row) => row.harrisShare ?? 0),
  );
  const demAverageDropoff = average(rows.map((row) => row.demDropoff ?? 0));
  const repAverageDropoff = average(rows.map((row) => row.repDropoff ?? 0));
  const demOutliers = rows.filter(
    (row) => (row.harris ?? 0) >= policy.minCandidateVotes && Math.abs(row.demDropoff ?? 0) >= policy.outlierThresholdPct,
  ).length;
  const repOutliers = rows.filter(
    (row) => (row.trump ?? 0) >= policy.minCandidateVotes && Math.abs(row.repDropoff ?? 0) >= policy.outlierThresholdPct,
  ).length;
  const outlierTrigger = Math.max(3, Math.ceil(rows.length * 0.05));

  return {
    demAverageDropoff,
    demOutliers,
    harrisCorrelation,
    outlierTrigger,
    repAverageDropoff,
    repOutliers,
    rowCount: rows.length,
    trumpCorrelation,
  };
}

function indicatorsForReviewRows(stateCode, rows, policy) {
  const indicators = [];

  for (const scope of scopesForReviewRows(stateCode, rows, policy)) {
    if (scope.rows.length < policy.minWardRows) {
      continue;
    }

    const metrics = metricsForRows(scope.rows, policy);

    if (Math.abs(metrics.trumpCorrelation) >= policy.voteShareCorrelationThreshold || Math.abs(metrics.harrisCorrelation) >= policy.voteShareCorrelationThreshold) {
      indicators.push({ ...scope, metrics, type: "vote_share_pattern" });
    }

    if (Math.abs(metrics.demAverageDropoff) >= policy.downBallotAverageThresholdPct || Math.abs(metrics.repAverageDropoff) >= policy.downBallotAverageThresholdPct) {
      indicators.push({ ...scope, metrics, type: "average_down_ballot_difference" });
    }

    if (metrics.demOutliers + metrics.repOutliers >= metrics.outlierTrigger) {
      indicators.push({ ...scope, metrics, type: "down_ballot_outliers" });
    }
  }

  return indicators;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function indicatorSummaryForState(state, reviewRows, policy) {
  const indicators = indicatorsForReviewRows(state, reviewRows, policy);
  const countyIndicators = indicators.filter((indicator) => indicator.level === "county");
  return {
    state,
    reviewRows: reviewRows.length,
    uniqueFlaggedJurisdictions: new Set(indicators.map((indicator) => indicator.county)).size,
    uniqueFlaggedCountyJurisdictions: new Set(countyIndicators.map((indicator) => indicator.county)).size,
    flaggedAreas: new Set(indicators.map((indicator) => indicator.scopeKey)).size,
    indicatorRows: indicators.length,
    countyIndicatorRows: countyIndicators.length,
    byLevel: countBy(indicators, "level"),
    byType: countBy(indicators, "type"),
  };
}

function loadedEnough(status) {
  return ["loaded", "partial", "candidate"].includes(status);
}

function firstSourceWithCategory(config, pattern) {
  return config.sources?.find((source) => pattern.test(`${source.category ?? ""} ${source.id ?? ""}`)) ?? null;
}

function nativeReadinessGrade(config, acquisitionRow, metrics) {
  const grain = acquisitionRow?.reportingGrain ?? config.turnout?.sourceLevel ?? "unknown";
  const hasComparison = Boolean(config.comparisonContest || metrics.nativeComparisonContest);

  if (grain === "county" && metrics.nativeReviewRows <= metrics.nativeResultRows) {
    return "county_review_only";
  }
  if (!hasComparison) {
    return "subcounty_vote_share_only";
  }
  if (["precinct", "ward", "reporting_unit"].includes(grain)) {
    return "subcounty_comparison_review";
  }
  return "loaded_review_needs_classification";
}

function parityGaps({ adminStatus, acquisitionRow, config, metrics, state, wiRemaining }) {
  const gaps = [];
  const reviewGrade = nativeReadinessGrade(config, acquisitionRow, metrics);

  if (reviewGrade === "county_review_only") {
    gaps.push({
      id: "subcounty_review_rows",
      status: "missing_or_not_loaded",
      detail: "Current review rows are county-level only; Wisconsin parity has ward-level review rows.",
    });
  }

  if (reviewGrade === "subcounty_vote_share_only") {
    gaps.push({
      id: "same_row_comparison_contest",
      status: "missing_or_not_mapped",
      detail: "Local presidential vote-share rows are loaded, but no same-row comparison contest is mapped.",
    });
  }

  if (config.turnout?.warningRequired) {
    gaps.push({
      id: "state_native_turnout_denominator",
      status: "fallback_or_candidate",
      detail: config.turnout.notes ?? "Turnout denominator is not a fully state-native loaded package.",
    });
  }

  if (!loadedEnough(adminStatus.audit?.status)) {
    gaps.push({
      id: "audit_context",
      status: adminStatus.audit?.status ?? "missing",
      detail: adminStatus.audit?.why ?? "Audit artifacts are not inventoried or normalized.",
    });
  }

  if (!loadedEnough(adminStatus.cvr?.status)) {
    gaps.push({
      id: "cvr_or_ballot_mode_context",
      status: adminStatus.cvr?.status ?? "missing",
      detail: adminStatus.cvr?.why ?? "CVR or row-level ballot-mode artifacts are not inventoried.",
    });
  }

  if (!loadedEnough(adminStatus.incidents?.status)) {
    gaps.push({
      id: "incident_context",
      status: adminStatus.incidents?.status ?? "missing",
      detail: adminStatus.incidents?.why ?? "Incident, correction, recount, or litigation context is not inventoried.",
    });
  }

  if (state !== "WI") {
    gaps.push({
      id: "hard_missing_source_evidence",
      status: "not_yet_probed",
      detail: "No Wisconsin-style public-source evidence probe or records-request packet has been generated for this state.",
    });
  } else if ((wiRemaining?.summary?.hardMissingFamiliesStillRequireRecordsRequests ?? []).length > 0) {
    gaps.push({
      id: "hard_missing_records_requests",
      status: "request_required",
      detail: "Wisconsin has public-source evidence and request packets; the remaining hard-missing families require records requests.",
    });
  }

  if (state !== "WI") {
    gaps.push({
      id: "split_area_advisory_scopes",
      status: "not_implemented",
      detail: "City/rest-of-county advisory scopes are only implemented for Wisconsin ward naming so far.",
    });
  }

  if (!firstSourceWithCategory(config, /precinct.*geometry|ward.*geometry|boundary/i) || firstSourceWithCategory(config, /county boundaries/i)) {
    gaps.push({
      id: "subcounty_geometry",
      status: state === "WI" ? "candidate_context_only" : "county_geometry_only",
      detail:
        state === "WI"
          ? "Wisconsin ward geometry is collected as candidate context but is not promoted to row-level rendering."
          : "Current production map geometry is county-level; subcounty review rows are tabular context.",
    });
  }

  return gaps;
}

const reviewPolicy = readReviewPolicy();
const adminPackage = readJson("data/admin-source-packages.json");
const acquisitionPackage = readJson("data/source-acquisition-tiers.json");
const wiRemaining = readJsonIfExists("data/wi-2024-remaining-data-status.json");
const adminByState = new Map(adminPackage.stateYearStatuses.map((state) => [state.state, state]));
const acquisitionByState = new Map(
  acquisitionPackage.states
    .filter((row) => row.scope === "statewide" && row.dataFamily.includes("results_review_turnout"))
    .map((row) => [row.state, row]),
);

const states = SWING_STATES.map((state) => {
  const lower = state.toLowerCase();
  const config = readJson(`etl/state-configs/${lower}.json`);
  const staging = readJson(`${stagingDir}/${lower}-2024-staging.json`);
  const metrics = staging.validation?.metrics ?? {};
  const adminStatus = adminByState.get(state);
  const acquisitionRow = acquisitionByState.get(state);
  const indicators = indicatorSummaryForState(state, staging.native?.reviewRows ?? [], reviewPolicy);
  const gaps = parityGaps({ adminStatus, acquisitionRow, config, metrics, state, wiRemaining });
  const reviewGrade = nativeReadinessGrade(config, acquisitionRow, metrics);
  const benchmarkComparable =
    reviewGrade === "subcounty_comparison_review" &&
    !config.turnout?.warningRequired &&
    loadedEnough(adminStatus?.equipment?.status);

  return {
    state,
    stateName: config.name,
    electionYear: config.electionYear,
    parityStatus:
      state === "WI"
        ? "benchmark_tableable_with_records_requests_remaining"
        : benchmarkComparable && gaps.every((gap) => ["audit_context", "cvr_or_ballot_mode_context", "incident_context", "hard_missing_source_evidence", "split_area_advisory_scopes", "subcounty_geometry"].includes(gap.id))
          ? "native_review_near_parity_admin_context_missing"
          : "partial_parity",
    nativeCoverage: {
      readinessGrade: reviewGrade,
      sourceTier: acquisitionRow?.tier ?? "unknown",
      reportingGrain: acquisitionRow?.reportingGrain ?? config.turnout?.sourceLevel ?? "unknown",
      parserStatus: acquisitionRow?.parserStatus ?? "not_classified",
      resultRows: metrics.nativeResultRows ?? staging.native?.resultRows?.length ?? 0,
      reviewRows: metrics.nativeReviewRows ?? staging.native?.reviewRows?.length ?? 0,
      turnoutRows: metrics.nativeTurnoutRows ?? staging.native?.turnoutRows?.length ?? 0,
      comparisonContest: metrics.nativeComparisonContest ?? config.comparisonContest?.label ?? null,
      reviewWarning: metrics.nativeReviewWarning ?? config.reviewCharts?.warning ?? null,
      validationPassed: staging.validation?.passed === true,
    },
    indicatorCoverage: {
      reviewRows: indicators.reviewRows,
      flaggedCountyJurisdictions: indicators.uniqueFlaggedCountyJurisdictions,
      flaggedAreas: indicators.flaggedAreas,
      indicatorRows: indicators.indicatorRows,
      countyIndicatorRows: indicators.countyIndicatorRows,
      byLevel: indicators.byLevel,
      byType: indicators.byType,
    },
    turnoutContext: {
      status: config.turnout?.warningRequired ? "fallback_or_warning_required" : "loaded",
      sourceLevel: config.turnout?.sourceLevel ?? null,
      denominatorType: config.turnout?.denominatorType ?? null,
      registrationDenominatorTiming: config.turnout?.registrationDenominatorTiming ?? null,
      source: compactSource(sourceById(config, config.turnout?.sourceId)),
      registrationSource: compactSource(sourceById(config, config.turnout?.registrationSourceId)),
      notes: config.turnout?.notes ?? null,
    },
    administrationContext: {
      equipment: adminStatus?.equipment ?? null,
      audit: adminStatus?.audit ?? null,
      cvr: adminStatus?.cvr ?? null,
      incidents: adminStatus?.incidents ?? null,
    },
    sourceAcquisition: acquisitionRow
      ? {
          tier: acquisitionRow.tier,
          scope: acquisitionRow.scope,
          dataFamily: acquisitionRow.dataFamily,
          reportingGrain: acquisitionRow.reportingGrain,
          parserStatus: acquisitionRow.parserStatus,
          manualReviewBurden: acquisitionRow.manualReviewBurden,
          confidence: acquisitionRow.confidence,
          nextAction: acquisitionRow.nextAction,
          sourceUrls: acquisitionRow.sourceUrls,
        }
      : null,
    parityGaps: gaps,
    nextAction:
      state === "WI"
        ? "Table Wisconsin until records-request responses arrive; keep county flags authoritative and use loaded audit/CVR/geometry items as context only."
        : gaps.some((gap) => gap.id === "subcounty_review_rows")
          ? "Find and normalize official subcounty President plus comparison-contest rows before spending time on deeper context."
          : gaps.some((gap) => gap.id === "same_row_comparison_contest")
            ? "Map an official same-grain comparison contest, then rerun indicator counts."
            : "Add Wisconsin-style audit/CVR/incident inventories and a public-source evidence probe; keep current native flags visible while context catches up.",
  };
});

const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  electionYear: 2024,
  benchmarkState: "WI",
  swingStates: SWING_STATES,
  purpose:
    "Track swing-state parity against the Wisconsin package without replacing loaded result/review data. Parity means native review data plus explainable context: turnout denominator status, equipment, audit/CVR/incident context, source-acquisition tier, hard-missing evidence, and explicit next actions.",
  policy: reviewPolicy,
  summary: {
    states: states.length,
    validatedNativeStagingStates: states.filter((state) => state.nativeCoverage.validationPassed).length,
    statesWithLoadedEquipment: states.filter((state) => loadedEnough(state.administrationContext.equipment?.status)).length,
    statesWithAuditContext: states.filter((state) => loadedEnough(state.administrationContext.audit?.status)).length,
    statesWithCvrContext: states.filter((state) => loadedEnough(state.administrationContext.cvr?.status)).length,
    statesWithIncidentContext: states.filter((state) => loadedEnough(state.administrationContext.incidents?.status)).length,
    statesWithSubcountyComparisonReview: states.filter((state) => state.nativeCoverage.readinessGrade === "subcounty_comparison_review").length,
    statesWithCountyOnlyReview: states.filter((state) => state.nativeCoverage.readinessGrade === "county_review_only").length,
    statesWithHardMissingEvidence: states.filter((state) => state.state === "WI").length,
  },
  states,
};

fs.mkdirSync(path.dirname(path.join(repoRoot, outPath)), { recursive: true });
fs.writeFileSync(path.join(repoRoot, outPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outPath, states: states.length, summary: report.summary }, null, 2));
