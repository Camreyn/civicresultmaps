import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthCarolinaHistoricalPipelineTests(unittest.TestCase):
    def test_south_carolina_election_history_builds_2016_2020_county_baselines(self):
        config = load_config("etl/state-configs/sc.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeSouthCarolinaElectionHistoryCsv")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 92)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 92)
        self.assertIn("official Elections Database", native["metrics"]["nativeHistoricalWarning"])

        abbeville_2020 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2020 and row["jurisdictionName"] == "Abbeville County"
        )
        self.assertEqual(abbeville_2020["sourceLevel"], "county")
        self.assertEqual(abbeville_2020["demVotes"], 4101)
        self.assertEqual(abbeville_2020["repVotes"], 8215)
        self.assertEqual(abbeville_2020["otherVotes"], 117)
        self.assertEqual(abbeville_2020["totalVotes"], 12433)

        rows_2020 = [row for row in native["historicalRows"] if row["electionYear"] == 2020]
        self.assertEqual(sum(row["demVotes"] for row in rows_2020), 1091541)
        self.assertEqual(sum(row["repVotes"] for row in rows_2020), 1385103)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2020), 36685)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2020), 2513329)


if __name__ == "__main__":
    unittest.main()
