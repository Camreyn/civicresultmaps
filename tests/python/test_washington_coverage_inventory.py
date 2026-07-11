import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class WashingtonCoverageInventoryTests(unittest.TestCase):
    def test_washington_historical_baselines_load_into_native_staging(self):
        etl_config = load_config("etl/state-configs/wa.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 78)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 7296845)

        king_2016 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "King County" and row["electionYear"] == 2016
        )
        self.assertEqual(king_2016["demVotes"], 718322)
        self.assertEqual(king_2016["repVotes"], 216339)
        self.assertEqual(king_2016["sourceDocumentId"], "wa-historical-presidential-baseline")

        pierce_2020 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Pierce County" and row["electionYear"] == 2020
        )
        self.assertEqual(pierce_2020["demVotes"], 249506)
        self.assertEqual(pierce_2020["repVotes"], 197730)


if __name__ == "__main__":
    unittest.main()
