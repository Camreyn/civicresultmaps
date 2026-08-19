import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class ColoradoCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_colorado_config_loads_clarity_county_results_with_state_native_turnout(self):
        config = load_config("etl/state-configs/co.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(config.expected.result_rows, 64)
        self.assertEqual(config.expected.review_rows, 64)
        self.assertEqual(native["parser"], "nativeColoradoClarityDetailXml")
        self.assertEqual(native["metrics"]["nativeResultTotalVotes"], 3190873)
        self.assertEqual(native["metrics"]["nativeHarrisVotes"], 1728159)
        self.assertEqual(native["metrics"]["nativeTrumpVotes"], 1377441)
        self.assertEqual(native["metrics"]["nativeOtherVotes"], 85273)
        self.assertEqual(native["metrics"]["nativeColoradoCertifiedVoteGap"], 1872)
        self.assertEqual(native["metrics"]["nativeComparisonRows"], 64)
        self.assertEqual(native["metrics"]["nativeComparisonContest"], "Regent of the University of Colorado - At Large")
        self.assertEqual(native["metrics"]["nativeTurnoutRows"], 64)
        self.assertEqual(native["metrics"]["nativeBallotsCast"], 3241155)
        self.assertEqual(native["metrics"]["nativeRegisteredVoters"], 4583280)
        self.assertEqual(native["metrics"]["nativeTurnoutParser"], "normalizedTurnoutCsv")
        self.assertEqual(native["metrics"]["nativeColoradoClarityTurnoutRows"], 64)
        self.assertEqual(native["metrics"]["nativeColoradoClarityBallotsCastLead"], 3241120)
        self.assertEqual(native["metrics"]["nativeColoradoClarityTotalVotersLead"], 4058938)
        self.assertEqual(len(native["historicalRows"]), 192)
        self.assertEqual(sorted({row["electionYear"] for row in native["historicalRows"]}), [2012, 2016, 2020])
        self.assertEqual(
            sum(row["totalVotes"] for row in native["historicalRows"] if row["electionYear"] == 2012),
            2569522,
        )
        self.assertTrue(any(row["coverageMode"] == "presidentVsRegent" for row in native["reviewRows"]))

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["co-2024-clarity-detailxml"]["status"], "loaded")
        self.assertEqual(sources["co-2024-historical-voter-statistics"]["status"], "loaded")
        self.assertEqual(sources["co-2024-eac-turnout"]["status"], "candidate")
        inventory_source = sources["co-2024-data-coverage-inventory"]
        self.assertEqual(inventory_source["status"], "candidate")
        self.assertTrue(all(item["exists"] for item in inventory_source["metadata"]["artifacts"]))

    def test_colorado_inventory_and_registries_classify_official_source_path(self):
        inventory = self.load_json("data/co-2024-data-coverage-inventory.json")
        confirmed = {artifact["id"]: artifact for artifact in inventory["confirmedArtifacts"]}
        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}

        self.assertEqual(inventory["status"], "official_clarity_county_native_turnout_historical_loaded")
        self.assertEqual(confirmed["co-2024-clarity-detailxml-endpoint"]["expectedRowsOrTotals"]["presidentialLoadedCountyVotes"], 3190873)
        self.assertEqual(confirmed["co-2024-clarity-detailxml-endpoint"]["expectedRowsOrTotals"]["knownWriteInOrAbstractGap"], 1872)
        self.assertEqual(confirmed["co-2024-regent-at-large-comparison-lead"]["expectedRowsOrTotals"]["contestTotalVotes"], 2930776)
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "official_county_same_grain_loaded")
        self.assertEqual(findings["stateNativeTurnout"]["status"], "official_state_native_turnout_loaded")
        self.assertEqual(confirmed["co-2024-historical-voter-statistics"]["expectedRowsOrTotals"]["ballotsCast"], 3241155)
        self.assertEqual(confirmed["co-2024-historical-voter-statistics"]["expectedRowsOrTotals"]["totalVoters"], 4583280)
        self.assertEqual(confirmed["co-historical-presidential-baseline"]["expectedRowsOrTotals"]["historicalRows"], 192)
        self.assertEqual(findings["historicalBaselines"]["status"], "official_2012_2016_2020_county_baselines_loaded")

        tiers = self.load_json("data/source-acquisition-tiers.json")
        co_tier = next(row for row in tiers["states"] if row["state"] == "CO" and row["scope"] == "statewide")
        self.assertEqual(co_tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertIn("official Clarity detail XML ZIP endpoint", co_tier["exportFormats"])
        self.assertIn("official Historical Election Data voter-statistics CSV", co_tier["exportFormats"])
        self.assertIn("loaded county CU Regent at-large comparison rows from the same endpoint", co_tier["availableFields"])
        self.assertIn("official state-native county turnout and active-plus-inactive registered-voter denominator rows from Historical Election Data voter statistics", co_tier["availableFields"])
        self.assertNotIn("official 2012 county or county-equivalent presidential baseline normalized into ETL", co_tier["missingFields"])

        native_packages = self.load_json("data/native-import-source-packages.json")
        self.assertIn("CO", native_packages["completedNativeStates"])
        co_package = next(row for row in native_packages["states"] if row["state"] == "CO")
        self.assertEqual(co_package["expected"]["localReviewRows"], 64)
        self.assertEqual(co_package["expected"]["ballotsCast"], 3241155)
        self.assertEqual(co_package["expected"]["registeredVoters"], 4583280)
        self.assertEqual(co_package["expected"]["historicalBaselineRows"], 192)
        self.assertIn("Regent", co_package["artifacts"]["localReviewRows"]["comparisonContest"])


if __name__ == "__main__":
    unittest.main()
