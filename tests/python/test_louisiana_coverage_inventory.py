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
        self.assertEqual(config["expected"]["historicalBaselineRows"], 128)
        self.assertEqual(sources["la-2024-sos-precinct-csv-results"]["authority"], "Louisiana Secretary of State")
        self.assertEqual(sources["la-2024-sos-precinct-csv-results"]["parser"], "louisianaSosPrecinctCsvDirectory")
        self.assertEqual(sources["la-2024-data-coverage-inventory"]["localFile"], "data/la-2024-data-coverage-inventory.json")
        self.assertEqual(sources["la-2024-sos-post-election-statistics-turnout"]["parser"], "normalizedTurnoutCsv")
        self.assertEqual(sources["la-2024-sos-post-election-statistics-workbooks"]["parser"], "scripts/normalize-la-post-election-statistics.mjs")
        self.assertEqual(config["turnout"]["sourceId"], "la-2024-sos-post-election-statistics-turnout")
        self.assertEqual(config["turnout"]["expected"]["ballotsCast"], 2021164)
        self.assertEqual(config["turnout"]["expected"]["registeredVoters"], 3046375)
        self.assertEqual(config["turnout"]["eacBenchmark"]["ballotsCastDeltaSosMinusEac"], -424)
        self.assertEqual(sources["la-2024-equipment-context"]["status"], "candidate")
        self.assertIn("district", config["reviewCharts"]["warning"])

    def test_louisiana_inventory_keeps_loaded_and_missing_artifacts_distinct(self):
        inventory = self.load_json("data/la-2024-data-coverage-inventory.json")
        artifacts = {artifact["id"]: artifact for artifact in inventory["loadedArtifacts"]}
        findings = inventory["sourceFindings"]

        self.assertEqual(artifacts["la-2024-sos-precinct-csv-results"]["confidence"], "loaded_official")
        self.assertEqual(artifacts["la-2024-sos-precinct-csv-results"]["expectedCounts"]["stateTotal"], 2006975)
        self.assertEqual(artifacts["la-2024-sos-precinct-csv-results"]["expectedCounts"]["reviewRows"], 3885)
        self.assertEqual(artifacts["la-2024-sos-post-election-statistics-turnout"]["confidence"], "loaded_official_active_turnout")
        self.assertEqual(artifacts["la-2024-sos-post-election-statistics-turnout"]["expectedCounts"]["registeredVoters"], 3046375)
        self.assertEqual(artifacts["la-2024-sos-post-election-statistics-turnout"]["expectedCounts"]["ballotsCast"], 2021164)
        self.assertEqual(artifacts["la-2024-eac-turnout"]["confidence"], "loaded_official_benchmark")
        self.assertEqual(artifacts["la-2024-eac-turnout"]["expectedCounts"]["registeredVoters"], 3046376)
        self.assertEqual(artifacts["la-county-geometry"]["expectedCounts"]["geometryFeatures"], 64)
        self.assertEqual(artifacts["la-2024-equipment-context"]["confidence"], "loaded_context_only")
        self.assertEqual(artifacts["la-historical-presidential-baseline"]["expectedCounts"]["historicalRows"], 128)

        self.assertEqual(findings["stateNativeTurnout"]["status"], "loaded_sos_post_election_statistics_active")
        self.assertEqual(findings["stateNativeTurnout"]["eacBenchmarkDelta"]["ballotsCastSosMinusEac"], -424)
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2012, 2016, 2020])
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2016, 2020])
        self.assertEqual(findings["historicalBaselines"]["missingYears"], [2012])
        self.assertEqual(findings["postElectionAudit"]["status"], "not_normalized")
        self.assertEqual(findings["cvrAvailability"]["status"], "not_loaded")
        self.assertIn("not claims of fraud or misconduct", inventory["displayApiCaveats"]["advisoryUse"])

    def test_louisiana_turnout_reconciliation_summary_matches_generated_csv(self):
        summary = self.load_json("data/la-2024-post-election-statistics-reconciliation-summary.json")
        csv_rows = Path("data/la-2024-post-election-statistics-turnout.csv").read_text(encoding="utf-8").strip().splitlines()

        self.assertEqual(summary["sosTotals"]["rowCount"], 64)
        self.assertEqual(len(csv_rows) - 1, 64)
        self.assertEqual(summary["sosTotals"]["registeredVoters"], 3046375)
        self.assertEqual(summary["sosTotals"]["ballotsCast"], 2021164)
        self.assertEqual(summary["deltas"]["ballotsCastSosMinusEac"], -424)
        self.assertEqual(summary["deltas"]["registeredVotersSosMinusEac"], -1)
        self.assertIn("active 2024 turnout source", summary["activeTurnoutDecision"])

    def test_louisiana_registries_are_aligned(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(entry for entry in tiers["states"] if entry["state"] == "LA" and entry["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertIn("official precinct and vote-mode President rows", tier["availableFields"])
        self.assertIn("official SOS parish post-election qualified-voter and voted turnout rows", tier["availableFields"])
        self.assertNotIn("state-native turnout denominator rows", tier["missingFields"])
        self.assertIn("normalize-la-post-election-statistics", tier["parserStatus"])

        self.assertIn("LA", native_packages["completedNativeStates"])
        native_la = next(entry for entry in native_packages["states"] if entry["state"] == "LA")
        self.assertEqual(native_la["expected"]["localReviewRows"], 3885)
        self.assertEqual(native_la["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. House")
        self.assertIn("post-election turnout statistics", native_la["artifacts"]["turnout"]["sourceTitle"])
        self.assertEqual(native_la["validationStatus"]["historicalBaselineMode"], "official_2016_2020_sos_parish_context_2012_missing")
        self.assertIn("data/la-2024-data-coverage-inventory.json", " ".join(native_la["caveats"]))

        turnout_la = next(entry for entry in turnout_packages["stateYearStatuses"] if entry["state"] == "LA")
        self.assertEqual(turnout_la["expectedTurnoutRows"], 64)
        self.assertIn("Louisiana SOS", turnout_la["sourceTitle"])
        self.assertEqual(turnout_la["coverage"]["registeredVoters"], 3046375)
        self.assertEqual(turnout_la["coverage"]["ballotsCast"], 2021164)
        self.assertTrue(any(entry["state"] == "LA" for entry in turnout_packages["loadedPackages"]))

        admin_la = next(entry for entry in admin_packages["stateYearStatuses"] if entry["state"] == "LA")
        self.assertEqual(admin_la["equipment"]["expectedJurisdictions"], 64)
        self.assertEqual(admin_la["audit"]["status"], "needs_data")
        self.assertEqual(admin_la["cvr"]["status"], "needs_data")
        self.assertEqual(admin_la["incidents"]["status"], "needs_data")

        coverage_waves = self.load_json("data/jurisdiction-tag-coverage-waves.json")
        coverage_la = next(
            entry
            for wave in coverage_waves["waves"]
            for entry in wave["states"]
            if entry["state"] == "LA"
        )
        self.assertEqual(coverage_la["matchedRows2020"], 64)
        self.assertEqual(coverage_la["missingHistoricalRows"], 0)
        self.assertIn(
            "node scripts/normalize-la-historical-presidential-baseline.mjs",
            coverage_la["result"]["validations"],
        )
        self.assertNotIn(
            "node scripts/collect-la-historical-baseline.mjs",
            coverage_la["result"]["validations"],
        )

        coverage_2016_waves = self.load_json("data/jurisdiction-tag-coverage-2016-waves.json")
        coverage_2016_la = next(
            entry
            for wave in coverage_2016_waves["waves"]
            for entry in wave["states"]
            if entry["state"] == "LA"
        )
        self.assertEqual(coverage_2016_la["missingExpectedTags2016"], 0)
        self.assertEqual(coverage_2016_la["overlaySummary"]["matchedRows2016To2024"], 64)


if __name__ == "__main__":
    unittest.main()
