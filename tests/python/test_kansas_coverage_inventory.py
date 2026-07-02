import json
import unittest
from pathlib import Path


class KansasCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8"))

    def test_kansas_config_registers_official_sources_and_inventory(self):
        config = self.load_json("etl/state-configs/ks.json")
        sources = {source["id"]: source for source in config["sources"]}

        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertEqual(config["expected"]["resultRows"], 105)
        self.assertEqual(config["expected"]["reviewRows"], 3739)
        self.assertEqual(config["expected"]["turnoutRows"], 105)
        self.assertEqual(sources["ks-2024-presidential-results"]["authority"], "Kansas Secretary of State")
        self.assertEqual(sources["ks-2024-general-us-house-precinct"]["parser"], "kansasUsHousePrecinctXlsx")
        self.assertEqual(sources["ks-2024-data-coverage-inventory"]["localFile"], "data/ks-2024-data-coverage-inventory.json")
        self.assertEqual(sources["ks-2024-equipment-context"]["status"], "candidate")
        self.assertIn("district-based", config["reviewCharts"]["warning"])

    def test_kansas_inventory_keeps_loaded_and_missing_artifacts_distinct(self):
        inventory = self.load_json("data/ks-2024-data-coverage-inventory.json")
        artifacts = {artifact["id"]: artifact for artifact in inventory["loadedArtifacts"]}
        findings = inventory["sourceFindings"]

        self.assertEqual(artifacts["ks-2024-presidential-results"]["confidence"], "loaded_official")
        self.assertEqual(artifacts["ks-2024-presidential-results"]["expectedCounts"]["stateTotal"], 1327591)
        self.assertEqual(artifacts["ks-2024-general-us-house-precinct"]["expectedCounts"]["reviewRows"], 3739)
        self.assertEqual(artifacts["ks-2024-eac-turnout"]["confidence"], "loaded_official_fallback")
        self.assertEqual(artifacts["ks-2024-eac-turnout"]["expectedCounts"]["registeredVoters"], 2031119)
        self.assertEqual(artifacts["ks-county-geometry"]["expectedCounts"]["geometryFeatures"], 105)
        self.assertEqual(artifacts["ks-2024-equipment-context"]["confidence"], "loaded_context_only")

        self.assertEqual(findings["stateNativeTurnout"]["status"], "not_loaded_eac_fallback_active")
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2012, 2016, 2020])
        self.assertEqual(findings["postElectionAudit"]["status"], "not_inventoried_or_normalized")
        self.assertEqual(findings["cvrAvailability"]["status"], "not_loaded")
        self.assertIn("not claims of fraud or misconduct", inventory["displayApiCaveats"]["advisoryUse"])

    def test_kansas_registries_are_aligned(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(entry for entry in tiers["states"] if entry["state"] == "KS" and entry["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_1_official_export_database")
        self.assertIn("official precinct U.S. House comparison rows from SOS workbook", tier["availableFields"])
        self.assertIn("data/ks-2024-data-coverage-inventory.json", tier["parserStatus"])

        self.assertIn("KS", native_packages["completedNativeStates"])
        native_ks = next(entry for entry in native_packages["states"] if entry["state"] == "KS")
        self.assertEqual(native_ks["expected"]["localReviewRows"], 3739)
        self.assertEqual(native_ks["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. House")
        self.assertIn("data/ks-2024-data-coverage-inventory.json", " ".join(native_ks["caveats"]))

        turnout_ks = next(entry for entry in turnout_packages["loadedPackages"] if entry["state"] == "KS")
        self.assertEqual(turnout_ks["expected"]["turnoutRows"], 105)
        self.assertIn("EAC fallback", " ".join(turnout_ks["caveats"]))

        admin_ks = next(entry for entry in admin_packages["stateYearStatuses"] if entry["state"] == "KS")
        self.assertEqual(admin_ks["equipment"]["expectedJurisdictions"], 105)
        self.assertEqual(admin_ks["audit"]["status"], "needs_data")
        self.assertEqual(admin_ks["cvr"]["status"], "needs_data")
        self.assertEqual(admin_ks["incidents"]["status"], "needs_data")


if __name__ == "__main__":
    unittest.main()
