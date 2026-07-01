import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class MichiganHistoricalPipelineTests(unittest.TestCase):
    def test_michigan_mvic_parser_builds_historical_rows(self):
        config = load_config("etl/state-configs/mi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeMichiganMvic")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 249)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 249)
        self.assertIn("contextual baseline", native["metrics"]["nativeHistoricalWarning"])

        wayne_2020 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2020 and row["jurisdictionName"] == "Wayne County"
        )
        self.assertEqual(wayne_2020["sourceLevel"], "county")
        self.assertEqual(wayne_2020["demVotes"], 597170)
        self.assertEqual(wayne_2020["repVotes"], 264553)
        self.assertEqual(wayne_2020["otherVotes"], 12295)
        self.assertEqual(wayne_2020["totalVotes"], 874018)

        rows_2016 = [row for row in native["historicalRows"] if row["electionYear"] == 2016]
        self.assertEqual(sum(row["demVotes"] for row in rows_2016), 2268839)
        self.assertEqual(sum(row["repVotes"] for row in rows_2016), 2279543)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2016), 276160)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2016), 4824542)


if __name__ == "__main__":
    unittest.main()
