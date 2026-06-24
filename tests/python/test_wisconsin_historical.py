import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class WisconsinHistoricalPipelineTests(unittest.TestCase):
    def test_wisconsin_ward_parser_builds_historical_rows(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeWisconsinWardByWardXlsx")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 72)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 3503)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 1851)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 216)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 216)
        adams_2020 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Adams County" and row["electionYear"] == 2020
        )
        self.assertEqual(adams_2020["demVotes"], 4329)
        self.assertEqual(adams_2020["repVotes"], 7362)


if __name__ == "__main__":
    unittest.main()
