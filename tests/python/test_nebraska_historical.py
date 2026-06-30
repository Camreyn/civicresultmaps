import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NebraskaHistoricalPipelineTests(unittest.TestCase):
    def test_nebraska_county_parser_builds_official_historical_rows(self):
        config = load_config("etl/state-configs/ne.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeNebraskaCountyPresidentCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 279)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 279)

        adams_2020 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["jurisdictionName"] == "Adams County" and row["electionYear"] == 2020
        )
        self.assertEqual(adams_2020["sourceId"], "ne-2020-general-canvass-book")
        self.assertEqual(adams_2020["demVotes"], 4213)
        self.assertEqual(adams_2020["repVotes"], 10085)
        self.assertEqual(adams_2020["otherVotes"], 355)

        rows_2016 = [row for row in artifact["native"]["historicalRows"] if row["electionYear"] == 2016]
        self.assertEqual(sum(row["demVotes"] for row in rows_2016), 284494)
        self.assertEqual(sum(row["repVotes"] for row in rows_2016), 495961)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2016), 63772)


if __name__ == "__main__":
    unittest.main()
