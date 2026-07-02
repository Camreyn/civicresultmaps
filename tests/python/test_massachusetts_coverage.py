import json
import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class MassachusettsCoverageTests(unittest.TestCase):
    def test_massachusetts_pd43_parser_builds_official_historical_rows(self):
        config = load_config("etl/state-configs/ma.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeMassachusettsPd43PrecinctCsv")
        self.assertEqual(native["metrics"]["nativeResultRows"], 14)
        self.assertEqual(native["metrics"]["nativeReviewRows"], 2382)
        self.assertEqual(native["metrics"]["nativeComparisonRows"], 2382)
        self.assertEqual(native["metrics"]["nativeTurnoutRows"], 351)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 42)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertIn("official PD43+", native["metrics"]["nativeHistoricalWarning"])

        rows_2020 = [row for row in native["historicalRows"] if row["electionYear"] == 2020]
        self.assertEqual(sum(row["demVotes"] for row in rows_2020), 2382202)
        self.assertEqual(sum(row["repVotes"] for row in rows_2020), 1167202)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2020), 81999)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2020), 3631403)
        self.assertTrue(all("electionstats.state.ma.us/elections/view/" in row["sourceUrl"] for row in rows_2020))
        self.assertTrue(all(row["rowMethod"] == "pd43OfficialCountyTable" for row in rows_2020))

        bristol_2012 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2012 and row["jurisdictionName"] == "Bristol County"
        )
        self.assertEqual(bristol_2012["demVotes"], 142962)
        self.assertEqual(bristol_2012["repVotes"], 93752)
        self.assertEqual(bristol_2012["otherVotes"], 4795)
        self.assertEqual(bristol_2012["totalVotes"], 241509)

    def test_massachusetts_source_inventory_documents_remaining_gaps(self):
        with open("data/ma-2024-data-coverage-inventory.json", encoding="utf8") as handle:
            inventory = json.load(handle)
        with open("data/native-import-source-packages.json", encoding="utf8") as handle:
            native_packages = json.load(handle)
        with open("data/source-acquisition-tiers.json", encoding="utf8") as handle:
            tiers = json.load(handle)
        with open("data/turnout-source-packages.json", encoding="utf8") as handle:
            turnout = json.load(handle)

        self.assertEqual(inventory["loadedArtifacts"]["historicalBaselines"]["status"], "loaded_official_pd43_county_context")
        self.assertEqual(inventory["loadedArtifacts"]["historicalBaselines"]["expectedRows"], 42)
        self.assertIn("one vote", inventory["loadedArtifacts"]["historicalBaselines"]["caveat"])
        self.assertEqual(inventory["loadedArtifacts"]["turnout"]["status"], "loaded_fallback_with_statewide_official_crosscheck")
        self.assertEqual(inventory["loadedArtifacts"]["turnout"]["statewideOfficialRegisteredVoters"], 5142343)
        self.assertIn("state-native local turnout", "\n".join(inventory["remainingGaps"]))
        self.assertIn("not proof of fraud or misconduct", inventory["advisoryUseCaveat"])

        native_ma = next(entry for entry in native_packages["states"] if entry["state"] == "MA")
        self.assertIn("MA", native_packages["completedNativeStates"])
        self.assertEqual(native_ma["expected"]["historicalBaselineRows"], 42)
        self.assertIn("official_pd43_county_context", native_ma["validationStatus"]["historicalBaselineMode"])

        tier_ma = next(entry for entry in tiers["states"] if entry["state"] == "MA" and entry["scope"] == "statewide")
        self.assertIn("official 2012/2016/2020 PD43+ county historical presidential baselines", tier_ma["availableFields"])
        self.assertIn("state-native local turnout denominator rows", tier_ma["missingFields"])

        turnout_ma = next(entry for entry in turnout["stateYearStatuses"] if entry["state"] == "MA" and entry["year"] == 2024)
        self.assertEqual(turnout_ma["coverage"]["statewideOfficialRegisteredVoters"], 5142343)
        self.assertIn("no local state-native replacement", turnout_ma["coverage"]["statewideOfficialCrosscheck"])


if __name__ == "__main__":
    unittest.main()
