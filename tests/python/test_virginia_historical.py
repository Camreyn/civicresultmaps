import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class VirginiaHistoricalPipelineTests(unittest.TestCase):
    def test_virginia_election_stats_history_builds_locality_rows(self):
        config = load_config("etl/state-configs/va.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 400)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 400)

        accomack_2012 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["electionYear"] == 2012 and row["jurisdictionName"] == "Accomack County"
        )
        self.assertEqual(accomack_2012["sourceLevel"], "locality")
        self.assertEqual(accomack_2012["demVotes"], 7655)
        self.assertEqual(accomack_2012["repVotes"], 8213)
        self.assertEqual(accomack_2012["otherVotes"], 183)
        self.assertEqual(accomack_2012["totalVotes"], 16051)

        rows_2016 = [row for row in artifact["native"]["historicalRows"] if row["electionYear"] == 2016]
        self.assertEqual(sum(row["demVotes"] for row in rows_2016), 1981473)
        self.assertEqual(sum(row["repVotes"] for row in rows_2016), 1769443)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2016), 233704)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2016), 3984620)


if __name__ == "__main__":
    unittest.main()