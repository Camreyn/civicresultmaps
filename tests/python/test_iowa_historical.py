import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class IowaHistoricalPipelineTests(unittest.TestCase):
    def test_iowa_clarity_parser_builds_historical_rows(self):
        config = load_config("etl/state-configs/ia.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeIowaClarityCountyDetailXmlDirectory")
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 297)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 297)

        adair_2020 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Adair County" and row["electionYear"] == 2020
        )
        self.assertEqual(adair_2020["sourceLevel"], "county")
        self.assertEqual(adair_2020["demVotes"], 1198)
        self.assertEqual(adair_2020["repVotes"], 2917)
        self.assertEqual(adair_2020["otherVotes"], 62)
        self.assertEqual(adair_2020["totalVotes"], 4177)


if __name__ == "__main__":
    unittest.main()
