import json
import unittest
from pathlib import Path


class IdahoCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8"))

    def test_idaho_config_registers_official_sources_and_inventory(self):
        config = self.load_json("etl/state-configs/id.json")
        sources = {source["id"]: source for source in config["sources"]}

        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertEqual(config["expected"]["resultRows"], 44)
        self.assertEqual(config["expected"]["reviewRows"], 44)
        self.assertEqual(config["expected"]["turnoutRows"], 44)
        self.assertEqual(sources["id-2024-general-official-xml-index"]["authority"], "Idaho Secretary of State")
        self.assertEqual(sources["id-2024-general-official-congressional-map"]["parser"], "countyComparisonCsv")
        self.assertEqual(sources["id-2024-data-coverage-inventory"]["localFile"], "data/id-2024-data-coverage-inventory.json")
        self.assertEqual(sources["id-historical-presidential-baseline"]["parser"], "historicalPresidentialCsv")
        self.assertIn("2012/2016/2020", sources["id-historical-presidential-baseline"]["confidence"])
        self.assertEqual(config["expected"]["historicalBaselineRows"], 132)
        self.assertTrue(config["capabilities"]["historicalBaseline"])
        self.assertEqual(config["historicalBaselines"]["expected"]["rowCount"], 132)
        self.assertEqual(sources["id-2024-equipment-context"]["status"], "candidate")
        self.assertIn("district-based", config["reviewCharts"]["warning"])

    def test_idaho_inventory_keeps_loaded_and_missing_artifacts_distinct(self):
        inventory = self.load_json("data/id-2024-data-coverage-inventory.json")
        artifacts = {artifact["id"]: artifact for artifact in inventory["loadedArtifacts"]}
        findings = inventory["sourceFindings"]

        self.assertEqual(artifacts["id-2024-general-official-xml-index"]["confidence"], "loaded_official_with_county_table_fallback")
        self.assertEqual(artifacts["id-2024-general-official-xml-index"]["expectedCounts"]["stateTotal"], 904967)
        self.assertEqual(artifacts["id-2024-general-official-congressional-map"]["expectedCounts"]["reviewRows"], 44)
        self.assertEqual(artifacts["id-2024-eac-turnout"]["confidence"], "retained_official_benchmark")
        self.assertEqual(artifacts["id-2024-eac-turnout"]["expectedCounts"]["registeredVoters"], 1178750)
        self.assertEqual(artifacts["id-county-geometry"]["expectedCounts"]["geometryFeatures"], 44)
        self.assertEqual(artifacts["id-2024-equipment-context"]["confidence"], "loaded_context_only")
        self.assertEqual(artifacts["id-historical-presidential-baseline"]["expectedCounts"]["historicalRows"], 132)

        self.assertEqual(findings["stateNativeTurnout"]["status"], "official_state_native_county_turnout_loaded")
        self.assertEqual(findings["historicalBaselines"]["status"], "loaded_official_2012_2016_2020_active")
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2012, 2016, 2020])
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2012, 2016, 2020])
        self.assertIn("official 2020 SOS county statistics page", findings["historicalBaselines"]["caveat"])
        self.assertEqual(findings["postElectionAudit"]["status"], "not_inventoried_or_normalized")
        self.assertEqual(findings["cvrAvailability"]["status"], "not_loaded")
        self.assertIn("not claims of fraud or misconduct", inventory["displayApiCaveats"]["advisoryUse"])

    def test_idaho_registries_are_aligned(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(entry for entry in tiers["states"] if entry["state"] == "ID" and entry["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertIn("official county U.S. House comparison rows", tier["availableFields"])
        self.assertIn("data/id-2024-data-coverage-inventory.json", tier["parserStatus"])

        self.assertIn("ID", native_packages["completedNativeStates"])
        native_id = next(entry for entry in native_packages["states"] if entry["state"] == "ID")
        self.assertEqual(native_id["expected"]["localReviewRows"], 44)
        self.assertEqual(native_id["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. House")
        self.assertEqual(native_id["expected"]["historicalBaselineRows"], 132)
        self.assertIn("Official 2012/2016/2020", " ".join(native_id["caveats"]))

        turnout_id = next(entry for entry in turnout_packages["stateYearStatuses"] if entry["state"] == "ID")
        self.assertEqual(turnout_id["expectedTurnoutRows"], 44)
        self.assertIn("Idaho Secretary of State", turnout_id["sourceTitle"])
        self.assertEqual(turnout_id["sourceLevel"], "county")

        admin_id = next(entry for entry in admin_packages["stateYearStatuses"] if entry["state"] == "ID")
        self.assertEqual(admin_id["equipment"]["expectedJurisdictions"], 44)
        self.assertEqual(admin_id["audit"]["status"], "needs_data")
        self.assertEqual(admin_id["cvr"]["status"], "needs_data")
        self.assertEqual(admin_id["incidents"]["status"], "needs_data")


if __name__ == "__main__":
    unittest.main()


