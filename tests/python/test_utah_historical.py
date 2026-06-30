import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class UtahHistoricalPipelineTests(unittest.TestCase):
    def test_utah_turnout_only_config_builds_historical_rows(self):
        config = load_config("etl/state-configs/ut.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeEacTurnoutCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 29)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 87)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 87)
        salt_lake_2020 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Salt Lake County" and row["electionYear"] == 2020
        )
        self.assertEqual(salt_lake_2020["demVotes"], 289906)
        self.assertEqual(salt_lake_2020["repVotes"], 230174)


if __name__ == "__main__":
    unittest.main()