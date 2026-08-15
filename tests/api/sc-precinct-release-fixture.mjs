import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSouthCarolinaPrecinctGisPlan } from "../../scripts/lib/sc-precinct-gis-plan.mjs";
import { buildSouthCarolinaPrecinctReleaseCandidate } from "../../scripts/lib/sc-precinct-release-candidate.mjs";
import { prepareSouthCarolinaPrecinctReleaseCandidate } from "../../scripts/prepare-sc-precinct-release-candidate.mjs";

export const SOUTH_CAROLINA_TEST_VALIDATION_PATH =
  `.etl/test-artifacts/SC/${process.pid}-sc-precinct-public-local-gis-validation.json`;

async function writeSyntheticValidationReport(
  root,
  generatedAtUtc = "2026-08-12T23:58:58.000Z",
) {
  const plan = await buildSouthCarolinaPrecinctGisPlan({
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
  const absolute = path.resolve(root, ...SOUTH_CAROLINA_TEST_VALIDATION_PATH.split("/"));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(report, null, 2) + "\n");
}

export async function buildSouthCarolinaTestReleaseFixture(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  await writeSyntheticValidationReport(root, options.generatedAtUtc);
  const built = await buildSouthCarolinaPrecinctReleaseCandidate({
    root,
    validationReportPath: SOUTH_CAROLINA_TEST_VALIDATION_PATH,
  });
  const prepared = options.write
    ? await prepareSouthCarolinaPrecinctReleaseCandidate({
      root,
      validationReportPath: SOUTH_CAROLINA_TEST_VALIDATION_PATH,
      write: true,
    })
    : null;
  return { built, prepared };
}
