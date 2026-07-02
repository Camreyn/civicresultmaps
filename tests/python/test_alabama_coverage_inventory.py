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

    def test_inventory_records_official_precinct_zip_without_loading_review_rows(self):
        finding = self.inventory["sourceFindings"]["official2024PrecinctResults"]
        self.assertEqual(finding["status"], "official_machine_readable_source_identified_not_loaded")
        self.assertEqual(finding["temporaryInspection"]["countyXlsFiles"], 67)
        self.assertEqual(finding["temporaryInspection"]["sha256"], "4ECCA55FC235018AEB2385DEBD375E6FA7AAA553C5BD67786ADD08D850EFCC96")
        self.assertEqual(finding["expectedCounts"]["presidentTotal"], 2265090)
        self.assertEqual(finding["expectedCounts"]["trump"], 1462616)
        self.assertEqual(finding["expectedCounts"]["harris"], 772412)
        self.assertEqual(finding["expectedCounts"]["other"], 30062)
        self.assertEqual(self.inventory["displayApiCaveats"]["currentAlabamaNativeStatus"], "turnout_only_eac_fallback")
        self.assertIn("not claims of fraud or misconduct", self.inventory["displayApiCaveats"]["advisoryUse"])

    def test_request_matrix_tracks_alabama_follow_up_artifacts(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/al-2024-source-request-matrix.tsv")
        self.assertEqual(len(self.request_rows), 5)
        self.assertEqual(
            self.requests["al-2024-precinct-president-house"]["status"],
            "official_machine_readable_source_identified_not_collected",
        )
        self.assertIn("district coverage is explicit", self.requests["al-2024-precinct-president-house"]["next_action"])
        self.assertEqual(
            self.requests["al-2024-state-native-turnout"]["status"],
            "state_native_leads_identified_eac_fallback_active",
        )
        self.assertIn("before replacing EAC", self.requests["al-2024-state-native-turnout"]["caveats"])
        self.assertEqual(
            self.requests["al-2024-admin-audit-cvr-incident-records"]["status"],
            "needs_records_request_and_scope_review",
        )

    def test_alabama_registries_are_source_discovery_not_complete_native(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(row for row in tiers["states"] if row["state"] == "AL" and row["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_1_official_export_database")
        self.assertEqual(tier["confidence"], "candidate_parser_ready")
        self.assertIn("official precinct/reporting-mode U.S. House comparison rows", " ".join(tier["availableFields"]))
        self.assertIn("data/al-2024-data-coverage-inventory.json", tier["parserStatus"])

        self.assertNotIn("AL", native_packages["completedNativeStates"])
        native_al = next(row for row in native_packages["sourceDiscoveryQueue"] if row["state"] == "AL")
        self.assertEqual(native_al["requestMatrixArtifact"], "data/al-2024-source-request-matrix.tsv")
        self.assertIn("67 county XLS files", native_al["blocker"])

        turnout_al = next(row for row in turnout_packages["stateYearStatuses"] if row["state"] == "AL" and row["year"] == 2024)
        self.assertEqual(turnout_al["coverage"]["jurisdictionRows"], 67)
        self.assertIn("data/al-2024-data-coverage-inventory.json", turnout_al["nextAction"])

        admin_al = next(row for row in admin_packages["stateYearStatuses"] if row["state"] == "AL" and row["electionYear"] == 2024)
        self.assertEqual(admin_al["equipment"]["expectedJurisdictions"], 67)
        self.assertEqual(admin_al["audit"]["status"], "needs_data")
        self.assertIn("data/al-2024-source-request-matrix.tsv", admin_al["audit"]["why"])


if __name__ == "__main__":
    unittest.main()
