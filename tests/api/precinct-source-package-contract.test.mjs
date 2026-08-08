import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectPrecinctSourcePackageManifest,
} from "../../src/lib/precinct-source-package.ts";

function packageRow(overrides = {}) {
  return {
    id: "adair-county",
    indexId: "county-index",
    label: "Adair County Precinct Boundaries.zip",
    url:
      "https://sos.iowa.gov/elections/pdf/shapefiles/County%20Precincts/"
      + "Adair%20County%20Precinct%20Boundaries.zip",
    artifact:
      "data/precinct-geometry/IA/2024-11-05-general/raw/"
      + "iowa-sos-county-index/Adair County Precinct Boundaries.zip",
    sha256: "a".repeat(64),
    byteCount: 100,
    parent: {
      name: "Adair County",
      geoid: "19001",
    },
    packageRole: "primary",
    archive: {
      format: "shapefile_zip",
      members: ["precinct.shp", "precinct.shx", "precinct.dbf", "precinct.prj"],
      sourceCrs: "EPSG:4326",
      sourceFeatureCount: 5,
      nativeFieldNames: ["LONGNAME", "SHORTNAME", "DISTRICT"],
    },
    ...overrides,
  };
}

function validManifest() {
  const primary = packageRow();
  const supplemental = packageRow({
    id: "adair-city",
    label: "Adair City Precinct Boundaries.zip",
    url:
      "https://sos.iowa.gov/elections/pdf/shapefiles/City%20Precincts/"
      + "Adair%20City%20Precinct%20Boundaries.zip",
    artifact:
      "data/precinct-geometry/IA/2024-11-05-general/raw/"
      + "iowa-sos-city-index/Adair City Precinct Boundaries.zip",
    sha256: "b".repeat(64),
    byteCount: 60,
    packageRole: "supplemental",
    archive: {
      ...primary.archive,
      members: [...primary.archive.members],
      nativeFieldNames: [...primary.archive.nativeFieldNames],
      sourceFeatureCount: 2,
    },
  });
  return {
    schemaVersion: 1,
    id: "ia-2024-11-05-official-precinct-packages",
    state: "IA",
    election: {
      id: "2024-11-05-general",
      date: "2024-11-05",
      type: "general",
    },
    geographyLevel: "precinct",
    authority: "Iowa Secretary of State",
    licenseOrTerms: "Public official election geography.",
    indexes: [
      {
        id: "county-index",
        kind: "county_precincts",
        url: "https://sos.iowa.gov/shapefiles-county-precincts",
        retrievedAt: "2026-08-01T12:00:00.000Z",
        retrievalMethod: "browser_assisted",
        boundaryBasis: "Approved post-2020 reprecincting plans.",
        effectiveDate: "2022-03-15",
        caveats: [],
      },
    ],
    packages: [primary, supplemental],
    coverage: {
      expectedParentCount: 2,
      parentsWithPackages: 1,
      missingParents: [
        {
          name: "Adams County",
          geoid: "19003",
          reason: "No package was listed.",
        },
      ],
    },
    summary: {
      packageCount: 2,
      byteCount: 160,
      sourceFeatureCount: 7,
    },
    caveats: [],
  };
}

test("source package manifest supports multiple official files per parent", () => {
  const inspection = inspectPrecinctSourcePackageManifest(validManifest());
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.manifest?.coverage.parentsWithPackages, 1);
  assert.equal(inspection.manifest?.summary.sourceFeatureCount, 7);
});

test("statewide source packages may explicitly cover multiple parents", () => {
  const fixture = validManifest();
  fixture.packages = [packageRow({
    parent: null,
    coveredParents: [
      { name: "Adair County", geoid: "19001" },
      { name: "Adams County", geoid: "19003" },
    ],
    parentAssignmentStatus: "confirmed",
  })];
  fixture.coverage = {
    expectedParentCount: 2,
    parentsWithPackages: 2,
    missingParents: [],
  };
  fixture.summary = {
    packageCount: 1,
    byteCount: 100,
    sourceFeatureCount: 5,
  };

  const inspection = inspectPrecinctSourcePackageManifest(fixture);
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.manifest?.coverage.parentsWithPackages, 2);

  fixture.packages[0].coveredParents.push(
    { name: "Adair County", geoid: "19001" },
  );
  assert.ok(
    inspectPrecinctSourcePackageManifest(fixture).errors.some((error) =>
      error.includes("duplicate covered parent"),
    ),
  );
});

test("source package manifest retains unparented city archives without claiming coverage", () => {
  const fixture = validManifest();
  fixture.packages.push(packageRow({
    id: "cross-county-city",
    indexId: "county-index",
    label: "Cross County City Precinct Boundaries.zip",
    url:
      "https://sos.iowa.gov/elections/pdf/shapefiles/City%20Precincts/"
      + "Cross%20County%20City%20Precinct%20Boundaries.zip",
    artifact:
      "data/precinct-geometry/IA/2024-11-05-general/raw/"
      + "iowa-sos-city-index/Cross County City Precinct Boundaries.zip",
    parent: null,
    parentAssignmentStatus: "ambiguous",
    packageRole: "supplemental",
    sha256: "c".repeat(64),
    byteCount: 40,
    archive: {
      format: "shapefile_zip",
      members: ["city.shp", "city.shx", "city.dbf", "city.prj"],
      sourceCrs: "EPSG:4326",
      sourceFeatureCount: 3,
      nativeFieldNames: ["LONGNAME"],
    },
  }));
  fixture.summary.packageCount = 3;
  fixture.summary.byteCount = 200;
  fixture.summary.sourceFeatureCount = 10;

  const inspection = inspectPrecinctSourcePackageManifest(fixture);
  assert.deepEqual(inspection.errors, []);
  assert.equal(inspection.manifest?.coverage.parentsWithPackages, 1);

  fixture.packages[2].parentAssignmentStatus = "confirmed";
  assert.ok(
    inspectPrecinctSourcePackageManifest(fixture).errors.some((error) =>
      error.includes("confirmed parent assignment requires parent metadata"),
    ),
  );
});

test("source package manifest requires explicit selection for multilayer archives", () => {
  const fixture = validManifest();
  fixture.packages[0].archive.members.push(
    "blocks.shp",
    "blocks.shx",
    "blocks.dbf",
    "blocks.prj",
  );
  const ambiguous = inspectPrecinctSourcePackageManifest(fixture);
  assert.ok(
    ambiguous.errors.some((error) => error.includes("selectedLayer")),
  );

  fixture.packages[0].archive.selectedLayer = "precinct";
  assert.deepEqual(
    inspectPrecinctSourcePackageManifest(fixture).errors,
    [],
  );

  fixture.packages[0].archive.selectedLayer = "missing";
  assert.ok(
    inspectPrecinctSourcePackageManifest(fixture).errors.some((error) =>
      error.includes("selectedLayer"),
    ),
  );
});

test("source package manifest rejects unsafe artifacts and incomplete archives", () => {
  const fixture = validManifest();
  fixture.packages[0].artifact = "../outside.zip";
  fixture.packages[0].archive.members = [
    "precinct.shp",
    "precinct.shx",
    "precinct.dbf",
  ];
  const inspection = inspectPrecinctSourcePackageManifest(fixture);
  assert.ok(inspection.errors.some((error) => error.includes("artifact")));
  assert.ok(inspection.errors.some((error) => error.includes(".prj")));
});

test("source package manifest rejects duplicate identities and broken summaries", () => {
  const fixture = validManifest();
  fixture.packages[1].id = fixture.packages[0].id;
  fixture.packages[1].indexId = "unknown-index";
  fixture.packages[1].artifact = fixture.packages[0].artifact;
  fixture.summary.byteCount = 999;
  fixture.coverage.missingParents[0].geoid = "19001";
  const inspection = inspectPrecinctSourcePackageManifest(fixture);
  assert.ok(inspection.errors.some((error) => error.includes("duplicate package id")));
  assert.ok(inspection.errors.some((error) => error.includes("unknown source index")));
  assert.ok(inspection.errors.some((error) => error.includes("duplicate package artifact")));
  assert.ok(inspection.errors.some((error) => error.includes("sum of package byte counts")));
  assert.ok(inspection.errors.some((error) => error.includes("both covered and missing")));
});

test("source package manifest requires event-safe election identity", () => {
  const fixture = validManifest();
  fixture.election.id = "2024";
  const inspection = inspectPrecinctSourcePackageManifest(fixture);
  assert.ok(
    inspection.errors.some((error) =>
      error.includes("election.id must be the election date")
    ),
  );

  const primaryFixture = validManifest();
  primaryFixture.election.type = "primary";
  primaryFixture.election.id = "2024-06-04-primary";
  primaryFixture.election.date = "2024-06-04";
  assert.deepEqual(
    inspectPrecinctSourcePackageManifest(primaryFixture).errors,
    [],
  );
});
