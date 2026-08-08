import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildNativeReportingUnitRecord,
} from "../../src/db/native-import.ts";

const base = {
  stateCode: "VA",
  electionEventId: "2024-11-05-general",
  fallbackDisplayName: "Precinct 1",
  sourceDocumentId: "00000000-0000-0000-0000-000000000001",
};

test("native reporting units preserve source ID and parent context", () => {
  const fairfax = buildNativeReportingUnitRecord({
    ...base,
    reportingUnit: {
      sourceUnitId: "0001",
      sourceDisplayName: "001 - Example",
      parentGeoid: "51059",
      reportingGrain: "precinct",
      isGeographic: true,
    },
  });
  const loudoun = buildNativeReportingUnitRecord({
    ...base,
    reportingUnit: {
      sourceUnitId: "0001",
      sourceDisplayName: "001 - Example",
      parentGeoid: "51107",
      reportingGrain: "precinct",
      isGeographic: true,
    },
  });

  assert.ok(fairfax);
  assert.ok(loudoun);
  assert.notEqual(fairfax.code, loudoun.code);
  assert.equal(fairfax.source_unit_id, "0001");
  assert.equal(fairfax.parent_geoid, "51059");
  assert.equal(fairfax.reporting_grain, "precinct");
  assert.equal(fairfax.is_geographic, true);
});

test("native reporting units require parent context for local geographic grains", () => {
  assert.throws(
    () =>
      buildNativeReportingUnitRecord({
        ...base,
        reportingUnit: {
          sourceUnitId: "0001",
          reportingGrain: "precinct",
          isGeographic: true,
        },
      }),
    /requires a parentGeoid/,
  );

  const provisional = buildNativeReportingUnitRecord({
    ...base,
    fallbackDisplayName: "Statewide Provisional",
    reportingUnit: {
      sourceUnitId: "PROVISIONAL",
      reportingGrain: "non_geographic",
      isGeographic: false,
    },
  });
  assert.equal(provisional.parent_geoid, null);
  assert.match(provisional.code, /:non_geographic:~:PROVISIONAL$/);
});

test("legacy native rows remain compatible when structured identity is absent", () => {
  assert.equal(
    buildNativeReportingUnitRecord({
      ...base,
      reportingUnit: undefined,
    }),
    null,
  );
});

test("native promotion persists and links reporting units without name-only tags", () => {
  const importer = readFileSync("src/db/native-import.ts", "utf8");

  assert.match(importer, /insert into reporting_units/);
  assert.match(
    importer,
    /on conflict on constraint reporting_units_state_election_grain_parent_source_unique/,
  );
  assert.match(importer, /reporting_unit_id: reportingUnit\?\.id \?\? null/);
  assert.match(importer, /const supportsReportingUnits = database\.driver === "postgres"/);
  assert.match(importer, /update result_rows as target\s+set reporting_unit_id/);
  assert.match(importer, /update review_rows as target\s+set reporting_unit_id/);
  assert.match(importer, /update turnout_rows as target\s+set reporting_unit_id/);
  assert.doesNotMatch(importer, /reporting_unit_id = excluded\.reporting_unit_id/);
  assert.match(
    importer,
    /const tag = reportingUnit \? null : jurisdictionTagForRow/,
  );
  assert.match(
    importer,
    /values \(\$\{electionYear\}, \$\{office\}, \$\{electionEvent\.date\}/,
  );
});
