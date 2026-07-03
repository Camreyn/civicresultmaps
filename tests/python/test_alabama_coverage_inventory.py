import csv
import json
import unittest
from pathlib import Path


class AlabamaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/al-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/al-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = list(csv.DictReader(handle, delimiter="\t"))
        self.requests = {row["request_id"]: row for row in self.request_rows}

    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_inventory_records_loaded_official_precinct_zip_and_review_rows(self):
        finding = self.inventory["sourceFindings"]["official2024PrecinctResults"]
        self.assertEqual(finding["status"], "official_machine_readable_source_loaded")
        self.assertEqual(finding["sha256"], "4ECCA55FC235018AEB2385DEBD375E6FA7AAA553C5BD67786ADD08D850EFCC96")
        self.assertEqual(finding["expectedCounts"]["presidentTotal"], 2265090)
        self.assertEqual(finding["expectedCounts"]["trump"], 1462616)
        self.assertEqual(finding["expectedCounts"]["harris"], 772412)
        self.assertEqual(finding["expectedCounts"]["other"], 30062)
        self.assertEqual(finding["expectedCounts"]["reviewRows"], 2083)
        self.assertEqual(self.inventory["displayApiCaveats"]["currentAlabamaNativeStatus"], "certified_results_review_rows_eac_turnout_historical_context_loaded")
        self.assertIn("not claims of fraud or misconduct", self.inventory["displayApiCaveats"]["advisoryUse"])

    def test_request_matrix_tracks_loaded_and_remaining_alabama_artifacts(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/al-2024-source-request-matrix.tsv")
        self.assertEqual(len(self.request_rows), 5)
        self.assertEqual(
            self.requests["al-2024-precinct-president-house"]["status"],
            "loaded_native_etl",
        )
        self.assertIn("2,083 local review rows", self.requests["al-2024-precinct-president-house"]["expected_rows_or_totals"])
        self.assertEqual(
            self.requests["al-2024-state-native-turnout"]["status"],
            "collected_lead_eac_fallback_active",
        )
        self.assertIn("Do not replace EAC fallback yet", self.requests["al-2024-state-native-turnout"]["caveats"])
        self.assertEqual(
            self.requests["al-2024-historical-baselines"]["status"],
            "loaded_historical_context",
        )
        self.assertEqual(
            self.requests["al-2024-admin-audit-cvr-incident-records"]["status"],
            "needs_records_request_and_scope_review",
        )

    def test_alabama_registries_are_completed_native_with_turnout_caveat(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(row for row in tiers["states"] if row["state"] == "AL" and row["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_1_official_export_database")
        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertIn("official precinct/reporting-mode President-versus-U.S. House review rows", " ".join(tier["availableFields"]))
        self.assertIn("scripts/normalize-al-sos-results.mjs", tier["parserStatus"])

        self.assertIn("AL", native_packages["completedNativeStates"])
        self.assertFalse(any(row["state"] == "AL" for row in native_packages["sourceDiscoveryQueue"]))
        native_al = next(row for row in native_packages["states"] if row["state"] == "AL")
        self.assertEqual(native_al["expected"]["localReviewRows"], 2083)
        self.assertEqual(native_al["expected"]["historicalBaselineRows"], 201)

        turnout_al = next(row for row in turnout_packages["stateYearStatuses"] if row["state"] == "AL" and row["year"] == 2024)
        self.assertEqual(turnout_al["coverage"]["jurisdictionRows"], 67)
        self.assertIn("180 lower", turnout_al["statusNote"])

        admin_al = next(row for row in admin_packages["stateYearStatuses"] if row["state"] == "AL" and row["electionYear"] == 2024)
        self.assertEqual(admin_al["equipment"]["expectedJurisdictions"], 67)
        self.assertEqual(admin_al["audit"]["status"], "needs_data")
        self.assertIn("data/al-2024-source-request-matrix.tsv", admin_al["audit"]["why"])


if __name__ == "__main__":
    unittest.main()
