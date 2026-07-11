import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthCarolinaCoverageInventoryTests(unittest.TestCase):
    def test_south_carolina_historical_baselines_load_into_native_staging(self):
        etl_config = load_config("etl/state-configs/sc.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 92)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 4616356)

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


if __name__ == "__main__":
    unittest.main()
