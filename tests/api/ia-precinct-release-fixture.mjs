import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildIowaPrecinctGisPlan } from "../../scripts/lib/ia-precinct-gis-plan.mjs";
import { buildIowaPrecinctReleaseCandidate } from "../../scripts/lib/ia-precinct-release-candidate.mjs";
import { prepareIowaPrecinctReleaseCandidate } from "../../scripts/prepare-ia-precinct-release-candidate.mjs";

export const IOWA_TEST_VALIDATION_PATH =
  ".etl/test-artifacts/IA/ia-public-precinct-gis-validation.json";

async function writeSyntheticValidationReport(root) {
  const plan = await buildIowaPrecinctGisPlan({
    root,
    years: [2016, 2020, 2024],
  });
  const report = {
    schemaVersion: 1,
    generatedAtUtc: "2026-08-12T23:58:58.000Z",
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
  const absolute = path.resolve(root, ...IOWA_TEST_VALIDATION_PATH.split("/"));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(report, null, 2) + "\n");
}

export async function buildIowaTestReleaseFixture(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  await writeSyntheticValidationReport(root);
  const built = await buildIowaPrecinctReleaseCandidate({
    root,
    validationReportPath: IOWA_TEST_VALIDATION_PATH,
  });
  const prepared = options.write
    ? await prepareIowaPrecinctReleaseCandidate({
      root,
      validationReportPath: IOWA_TEST_VALIDATION_PATH,
      write: true,
    })
    : null;
  return { built, prepared };
}
