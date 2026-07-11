import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class TennesseeCoverageInventoryTests(unittest.TestCase):
    def test_tennessee_historical_baselines_load_into_native_staging(self):
        etl_config = load_config("etl/state-configs/tn.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 190)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 5561878)

        anderson_2016 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Anderson County" and row["electionYear"] == 2016
        )
        self.assertEqual(anderson_2016["demVotes"], 9013)
        self.assertEqual(anderson_2016["repVotes"], 19212)
        self.assertEqual(anderson_2016["sourceDocumentId"], "tn-historical-presidential-baseline")

        davidson_2020 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Davidson County" and row["electionYear"] == 2020
        )
        self.assertEqual(davidson_2020["demVotes"], 199703)
        self.assertEqual(davidson_2020["repVotes"], 100218)


if __name__ == "__main__":
    unittest.main()
