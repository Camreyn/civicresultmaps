import json
from pathlib import Path
import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthCarolinaCoverageInventoryTests(unittest.TestCase):
    def test_south_carolina_historical_baselines_load_into_native_staging(self):
        etl_config = load_config("etl/state-configs/sc.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 138)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 6580474)

        abbeville_2012 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Abbeville County" and row["electionYear"] == 2012
        )
        self.assertEqual(abbeville_2012["demVotes"], 4543)
        self.assertEqual(abbeville_2012["repVotes"], 5981)
        self.assertEqual(abbeville_2012["otherVotes"], 147)
        self.assertEqual(abbeville_2012["totalVotes"], 10671)

        charleston_2016 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Charleston County" and row["electionYear"] == 2016
        )
        self.assertEqual(charleston_2016["demVotes"], 89299)
        self.assertEqual(charleston_2016["repVotes"], 75443)
        self.assertEqual(charleston_2016["sourceDocumentId"], "sc-historical-presidential-baseline")

        greenville_2020 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Greenville County" and row["electionYear"] == 2020
        )
        self.assertEqual(greenville_2020["demVotes"], 103030)
        self.assertEqual(greenville_2020["repVotes"], 150021)

    def test_south_carolina_election_history_voter_statistics_stays_candidate(self):
        etl_config = load_config("etl/state-configs/sc.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        self.assertTrue(report.passed)
        sources = {source["id"]: source for source in artifact["sources"]}
        candidate = sources["sc-2024-election-history-voter-statistics"]
        self.assertEqual(candidate["status"], "candidate")
        retained_artifact = candidate["metadata"]["artifacts"][0]
        self.assertEqual(retained_artifact["byteSize"], 81664)
        self.assertEqual(retained_artifact["sha256"], "c90adc5ca5a8939a870d6d65db1acb0f2a776887d93f6e2c5adb0823a8725b94")
        self.assertEqual(candidate["metadata"]["contestId"], "7075")
        self.assertEqual(candidate["metadata"]["normalizedFile"], "data/sc-2024-election-history/voter-statistics-7075-county.csv")
        reconciliation = json.loads(
            Path("data/sc-2024-election-history/voter-statistics-7075-vs-vrems-reconciliation.json").read_text()
        )
        self.assertEqual(reconciliation["reconciliation"]["grain"]["electionHistorySource"], "state/county/precinct")
        self.assertIn("same election event", reconciliation["reconciliation"]["timing"]["vrems"])
        self.assertIn("No active/inactive", reconciliation["reconciliation"]["inactiveTreatment"]["electionHistory"])
        self.assertEqual(reconciliation["reconciliation"]["disposition"], "candidate_not_loaded")
        self.assertEqual(reconciliation["provenance"]["electionHistoryRawSha256"], retained_artifact["sha256"])


if __name__ == "__main__":
    unittest.main()
