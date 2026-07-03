import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewYorkCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def load_request_rows(self):
        lines = Path("data/ny-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig").strip().splitlines()
        header = lines[0].split("\t")
        return {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_active_new_york_config_builds_partial_review_staging(self):
        config = load_config("etl/state-configs/ny.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 62)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 9753)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 62)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 186)
        self.assertEqual(metrics["nativeResultTotalVotes"], 8381429)
        self.assertEqual(metrics["nativeHarrisVotes"], 4619543)
        self.assertEqual(metrics["nativeTrumpVotes"], 3579519)
        self.assertEqual(metrics["nativeOtherVotes"], 182367)
        self.assertEqual(metrics["nativeBallotsCast"], 8389626)
        self.assertEqual(metrics["nativeRegisteredVoters"], 13579416)
        self.assertIn("county-certified result totals remain the map authority", metrics["nativeReviewWarning"])

    def test_inventory_and_registries_keep_ny_in_source_discovery(self):
        inventory = self.load_json("data/ny-2024-data-coverage-inventory.json")
        native = self.load_json("data/native-import-source-packages.json")
        tiers = self.load_json("data/source-acquisition-tiers.json")
        manifest = self.load_json("data/ny-2024-local-review-sources.json")
        request_rows = self.load_request_rows()

        queue_entry = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "NY")
        tier = next(row for row in tiers["states"] if row["state"] == "NY" and row["scope"] == "statewide")
        monroe = next(row for row in manifest["files"] if row["file"] == "Monroe.xlsx")
        excluded = {row["county"] for row in manifest["excludedFiles"]}

        self.assertNotIn("NY", native["completedNativeStates"])
        self.assertEqual(inventory["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertIn("Wave 19", inventory["completionDecision"]["wave19Decision"])
        self.assertFalse(inventory["productionChecked"])
        self.assertIn("docs/developer/index.md", inventory["repoDrift"][0])
        self.assertEqual(inventory["sourceRequestMatrix"], "data/ny-2024-source-request-matrix.tsv")
        self.assertEqual(queue_entry["requestMatrixArtifact"], "data/ny-2024-source-request-matrix.tsv")
        self.assertIn("source request matrix", tier["parserStatus"])
        self.assertIn("13 county equivalents", tier["caveats"])

        coverage = inventory["completionDecision"]["reviewCoverage"]
        self.assertEqual(coverage["reviewRows"], 9753)
        self.assertEqual(coverage["coveredCountyEquivalents"], 49)
        self.assertEqual(coverage["missingCountyEquivalents"], 13)
        self.assertEqual(monroe["status"], "excluded_zero_rows")
        self.assertIn("Monroe County", coverage["excludedOrNotYetReviewedCounties"])
        self.assertIn("Rockland County", coverage["excludedOrNotYetReviewedCounties"])
        self.assertIn("Rockland County", excluded)

        self.assertEqual(request_rows["ny-2024-certified-county-results"]["status"], "loaded_from_official_nysboe_pdf")
        self.assertEqual(request_rows["ny-2024-supplemental-local-review"]["status"], "partial_loaded_with_missing_counties")
        self.assertEqual(request_rows["ny-2024-excluded-local-review-counties"]["status"], "needs_official_source_or_reviewed_extraction")
        self.assertEqual(request_rows["ny-2024-state-native-turnout"]["status"], "state_native_source_lead_not_loaded")
        self.assertEqual(request_rows["ny-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")

    def test_local_review_csv_does_not_silently_cover_excluded_counties(self):
        rows = list(csv.DictReader(Path("data/ny-2024-local-review.csv").read_text(encoding="utf-8-sig").splitlines()))
        counties = {row["county"] for row in rows}
        missing_counties = set(self.load_json("data/ny-2024-data-coverage-inventory.json")["completionDecision"]["reviewCoverage"]["excludedOrNotYetReviewedCounties"])

        self.assertEqual(len(rows), 9753)
        self.assertTrue(missing_counties.isdisjoint(counties))
        self.assertIn("Suffolk County", counties)
        self.assertIn("Westchester County", counties)


if __name__ == "__main__":
    unittest.main()
