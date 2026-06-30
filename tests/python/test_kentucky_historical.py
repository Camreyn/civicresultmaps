import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class KentuckyHistoricalPipelineTests(unittest.TestCase):
    def test_kentucky_official_historical_baseline_rows(self):
        config = load_config("etl/state-configs/ky.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 360)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 360)

        adair_2012 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Adair County" and row["electionYear"] == 2012
        )
        self.assertEqual(adair_2012["sourceLevel"], "county")
        self.assertEqual(adair_2012["repVotes"], 5841)
        self.assertEqual(adair_2012["demVotes"], 1660)
        self.assertEqual(adair_2012["totalVotes"], 7600)

        fayette_2020 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Fayette County" and row["electionYear"] == 2020
        )
        self.assertEqual(fayette_2020["repVotes"], 58860)
        self.assertEqual(fayette_2020["demVotes"], 90600)


if __name__ == "__main__":
    unittest.main()
