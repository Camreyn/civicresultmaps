import json
import unittest
from pathlib import Path


class LouisianaCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8"))

    def test_louisiana_config_registers_official_sources_and_inventory(self):
        config = self.load_json("etl/state-configs/la.json")
        sources = {source["id"]: source for source in config["sources"]}

        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertEqual(config["expected"]["resultRows"], 64)
        self.assertEqual(config["expected"]["reviewRows"], 3885)
        self.assertEqual(config["expected"]["turnoutRows"], 64)
        self.assertEqual(sources["la-2024-sos-precinct-csv-results"]["authority"], "Louisiana Secretary of State")
        self.assertEqual(sources["la-2024-sos-precinct-csv-results"]["parser"], "louisianaSosPrecinctCsvDirectory")
        self.assertEqual(sources["la-2024-data-coverage-inventory"]["localFile"], "data/la-2024-data-coverage-inventory.json")
        self.assertEqual(sources["la-2024-equipment-context"]["status"], "candidate")
        self.assertIn("district", config["reviewCharts"]["warning"])

    def test_louisiana_inventory_keeps_loaded_and_missing_artifacts_distinct(self):
        inventory = self.load_json("data/la-2024-data-coverage-inventory.json")
        artifacts = {artifact["id"]: artifact for artifact in inventory["loadedArtifacts"]}
        findings = inventory["sourceFindings"]

        self.assertEqual(artifacts["la-2024-sos-precinct-csv-results"]["confidence"], "loaded_official")
        self.assertEqual(artifacts["la-2024-sos-precinct-csv-results"]["expectedCounts"]["stateTotal"], 2006975)
        self.assertEqual(artifacts["la-2024-sos-precinct-csv-results"]["expectedCounts"]["reviewRows"], 3885)
        self.assertEqual(artifacts["la-2024-eac-turnout"]["confidence"], "loaded_official_fallback")
        self.assertEqual(artifacts["la-2024-eac-turnout"]["expectedCounts"]["registeredVoters"], 3046376)
        self.assertEqual(artifacts["la-county-geometry"]["expectedCounts"]["geometryFeatures"], 64)
        self.assertEqual(artifacts["la-2024-equipment-context"]["confidence"], "loaded_context_only")

        self.assertEqual(findings["stateNativeTurnout"]["status"], "not_loaded_eac_fallback_active")
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2012, 2016, 2020])
        self.assertEqual(findings["postElectionAudit"]["status"], "not_normalized")
        self.assertEqual(findings["cvrAvailability"]["status"], "not_loaded")
        self.assertIn("not claims of fraud or misconduct", inventory["displayApiCaveats"]["advisoryUse"])

    def test_louisiana_registries_are_aligned(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(entry for entry in tiers["states"] if entry["state"] == "LA" and entry["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertIn("official precinct and vote-mode President rows", tier["availableFields"])
        self.assertIn("data/la-2024-data-coverage-inventory.json", tier["parserStatus"])

        self.assertIn("LA", native_packages["completedNativeStates"])
        native_la = next(entry for entry in native_packages["states"] if entry["state"] == "LA")
        self.assertEqual(native_la["expected"]["localReviewRows"], 3885)
        self.assertEqual(native_la["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. House")
        self.assertIn("data/la-2024-data-coverage-inventory.json", " ".join(native_la["caveats"]))

        turnout_la = next(entry for entry in turnout_packages["stateYearStatuses"] if entry["state"] == "LA")
        self.assertEqual(turnout_la["expectedTurnoutRows"], 64)
        self.assertIn("EAC", turnout_la["sourceTitle"])

        admin_la = next(entry for entry in admin_packages["stateYearStatuses"] if entry["state"] == "LA")
        self.assertEqual(admin_la["equipment"]["expectedJurisdictions"], 64)
        self.assertEqual(admin_la["audit"]["status"], "needs_data")
        self.assertEqual(admin_la["cvr"]["status"], "needs_data")
        self.assertEqual(admin_la["incidents"]["status"], "needs_data")


if __name__ == "__main__":
    unittest.main()
