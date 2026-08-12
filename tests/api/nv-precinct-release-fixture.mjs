import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildNevadaPrecinctGisPlan } from "../../scripts/lib/nv-precinct-gis-plan.mjs";
import { buildNevadaPrecinctReleaseCandidate } from "../../scripts/lib/nv-precinct-release-candidate.mjs";
import { prepareNevadaPrecinctReleaseCandidate } from "../../scripts/prepare-nv-precinct-release-candidate.mjs";

export const NEVADA_TEST_VALIDATION_PATH =
  ".etl/test-artifacts/NV/nv-public-precinct-gis-validation.json";

async function writeSyntheticValidationReport(root) {
  const plan = await buildNevadaPrecinctGisPlan({
    root,
    years: [2016, 2020, 2024],
  });
  const coverage = JSON.parse(readFileSync(path.resolve(
    root,
    "data/precinct-geometry-coverage-inventory-2016.json",
  )));
  const activatedAtUtc = coverage.states.find((row) => row.state === "NV")
    ?.checkedAt;
  if (typeof activatedAtUtc !== "string" || Number.isNaN(Date.parse(activatedAtUtc))) {
    throw new Error("Nevada test fixture requires the activated coverage timestamp");
  }
  const report = {
    schemaVersion: 1,
    generatedAtUtc: activatedAtUtc,
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
  const absolute = path.resolve(root, ...NEVADA_TEST_VALIDATION_PATH.split("/"));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(report, null, 2) + "\n");
}

export async function buildNevadaTestReleaseFixture(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  await writeSyntheticValidationReport(root);
  const built = await buildNevadaPrecinctReleaseCandidate({
    root,
    validationReportPath: NEVADA_TEST_VALIDATION_PATH,
  });
  const prepared = options.write
    ? await prepareNevadaPrecinctReleaseCandidate({
      root,
      validationReportPath: NEVADA_TEST_VALIDATION_PATH,
      write: true,
    })
    : null;
  return { built, prepared };
}
