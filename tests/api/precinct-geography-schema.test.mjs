import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/schema.ts", "utf8");
const migration = readFileSync(
  "drizzle/0008_typical_thunderbolts.sql",
  "utf8",
);
const snapshot = JSON.parse(
  readFileSync("drizzle/meta/0008_snapshot.json", "utf8"),
);

test("additive precinct geography tables keep reporting units separate from features", () => {
  assert.match(schema, /export const geographyVersions = pgTable/);
  assert.match(schema, /export const geographyFeatures = pgTable/);
  assert.match(schema, /export const reportingUnits = pgTable/);
  assert.match(
    schema,
    /export const reportingUnitGeometryCrosswalks = pgTable/,
  );

  assert.match(
    schema,
    /geography_versions_state_election_type_vintage_idx/,
  );
  assert.match(
    schema,
    /reporting_units_state_election_grain_parent_source_unique/,
  );
  assert.match(
    schema,
    /reporting_unit_geometry_crosswalks_feature_relationship_check/,
  );
  assert.match(schema, /'unmatched', 'non_geographic', 'source_alias'/);
  assert.match(schema, /'one_to_one', 'one_to_many', 'many_to_one'/);
  assert.doesNotMatch(schema, /allocationWeight|allocation_weight/);
  assert.match(
    schema,
    /reporting_unit_geometry_crosswalks_feature_version_geography_features_fk/,
  );
});

test("existing result, turnout, and review rows gain nullable reporting-unit references", () => {
  assert.match(
    migration,
    /ALTER TABLE "result_rows" ADD COLUMN "reporting_unit_id" uuid;/,
  );
  assert.match(
    migration,
    /ALTER TABLE "turnout_rows" ADD COLUMN "reporting_unit_id" uuid;/,
  );
  assert.match(
    migration,
    /ALTER TABLE "review_rows" ADD COLUMN "reporting_unit_id" uuid;/,
  );
  assert.doesNotMatch(
    migration,
    /ADD COLUMN "reporting_unit_id" uuid NOT NULL/,
  );

  assert.match(schema, /result_rows_reporting_unit_id_idx/);
  assert.match(schema, /turnout_rows_reporting_unit_id_idx/);
  assert.match(schema, /review_rows_reporting_unit_id_idx/);
  assert.match(
    schema,
    /result_rows_contest_jurisdiction_candidate_idx/,
  );
});

test("parent-null reporting identities remain unique and crosswalks fail closed", () => {
  assert.match(
    migration,
    /CONSTRAINT "reporting_units_state_election_grain_parent_source_unique" UNIQUE NULLS NOT DISTINCT/,
  );
  assert.match(
    migration,
    /CONSTRAINT "reporting_unit_geometry_crosswalks_unique" UNIQUE NULLS NOT DISTINCT/,
  );
  assert.match(
    migration,
    /relationship_type" in \('unmatched', 'non_geographic', 'source_alias'\).*geography_feature_id" is null/s,
  );
  assert.match(
    migration,
    /relationship_type" in \('one_to_one', 'one_to_many', 'many_to_one'\).*geography_feature_id" is not null/s,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("geography_feature_id","geometry_version_id"\) REFERENCES "public"."geography_features"\("id","geometry_version_id"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "geography_features_id_version_unique" UNIQUE\("id","geometry_version_id"\)/,
  );
});

test("generated Drizzle snapshot contains all precinct geography relationships", () => {
  const tables = snapshot.tables;
  assert.ok(tables["public.geography_versions"]);
  assert.ok(tables["public.geography_features"]);
  assert.ok(tables["public.reporting_units"]);
  assert.ok(tables["public.reporting_unit_geometry_crosswalks"]);

  assert.ok(
    tables["public.result_rows"].columns.reporting_unit_id,
  );
  assert.equal(
    tables["public.result_rows"].columns.reporting_unit_id.notNull,
    false,
  );
  assert.ok(
    tables["public.reporting_unit_geometry_crosswalks"].foreignKeys[
      "reporting_unit_geometry_crosswalks_geometry_version_id_geography_versions_id_fk"
    ],
  );
  const crosswalkTable =
    tables["public.reporting_unit_geometry_crosswalks"];
  const versionQualifiedFeature =
    crosswalkTable.foreignKeys[
      "reporting_unit_geometry_crosswalks_feature_version_geography_features_fk"
    ];
  assert.deepEqual(
    versionQualifiedFeature.columnsFrom,
    ["geography_feature_id", "geometry_version_id"],
  );
  assert.deepEqual(
    versionQualifiedFeature.columnsTo,
    ["id", "geometry_version_id"],
  );
  assert.ok(
    tables["public.geography_features"].uniqueConstraints
      .geography_features_id_version_unique,
  );
});

