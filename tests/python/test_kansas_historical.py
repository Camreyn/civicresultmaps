import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class KansasHistoricalPipelineTests(unittest.TestCase):
    def test_kansas_historical_baseline_rows_are_loaded(self):
        config = load_config("etl/state-configs/ks.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 315)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 315)

        johnson_2020 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Johnson County" and row["electionYear"] == 2020
        )
        self.assertEqual(johnson_2020["sourceLevel"], "county")
        self.assertEqual(johnson_2020["demVotes"], 184259)
        self.assertEqual(johnson_2020["repVotes"], 155631)
        self.assertEqual(johnson_2020["otherVotes"], 7324)
        self.assertEqual(johnson_2020["totalVotes"], 347214)

        allen_2012 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Allen County" and row["electionYear"] == 2012
        )
        self.assertEqual(allen_2012["rowMethod"], "wikipediaCountyPresidentialTableSecondaryCountyContext")
        self.assertEqual(allen_2012["totalVotes"], 5310)


if __name__ == "__main__":
    unittest.main()
