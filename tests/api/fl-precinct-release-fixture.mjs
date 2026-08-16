import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildFloridaPrecinctGisPlan } from "../../scripts/lib/fl-precinct-gis-plan.mjs";
import { buildFloridaPrecinctReleaseCandidate } from "../../scripts/lib/fl-precinct-release-candidate.mjs";
import { prepareFloridaPrecinctReleaseCandidate } from "../../scripts/prepare-fl-precinct-release-candidate.mjs";

export const FLORIDA_TEST_VALIDATION_PATH =
  `.etl/test-artifacts/FL/${process.pid}-fl-precinct-public-local-gis-validation.json`;

async function writeSyntheticValidationReport(
  root,
  generatedAtUtc = "2026-08-12T23:58:58.000Z",
) {
  const plan = await buildFloridaPrecinctGisPlan({
    root,
    years: [2016, 2020, 2024],
  });
  const report = {
    schemaVersion: 1,
    generatedAtUtc,
    productionMutationPerformed: false,
    publicDeliveryAuthorized: false,
    validation: {
      database: {
        environment: "local",
        host: "loopback",
        port: 54329,
        name: "crm_clone_dev",
        readOnlySession: true,
      },
      invalidConstraints: 0,
      revision: 1,
      years: plan.years.map((year) => ({
        year: year.year,
        reportingUnits: year.reportingUnits.length,
        resultRows: year.resultRows.length,
        sameYearResultRows: year.resultRows.length,
        totalVotes: year.totals.Total,
        zeroVoteUnits: year.zeroVoteUnits,
        geographyVersions: 1,
        features: year.geometry.features.length,
        safeBlockedGeographyVersions: 1,
        reviewedCrosswalks: year.geometry.crosswalks.length,
        exactFeatures: year.geometry.features.length,
        exactCrosswalks: year.geometry.crosswalks.length,
      })),
    },
  };
  const absolute = path.resolve(root, ...FLORIDA_TEST_VALIDATION_PATH.split("/"));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(report, null, 2) + "\n");
}

export async function buildFloridaTestReleaseFixture(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  await writeSyntheticValidationReport(root, options.generatedAtUtc);
  const built = await buildFloridaPrecinctReleaseCandidate({
    root,
    validationReportPath: FLORIDA_TEST_VALIDATION_PATH,
  });
  const prepared = options.write
    ? await prepareFloridaPrecinctReleaseCandidate({
      root,
      validationReportPath: FLORIDA_TEST_VALIDATION_PATH,
      write: true,
    })
    : null;
  return { built, prepared };
}
