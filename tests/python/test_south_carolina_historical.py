import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthCarolinaHistoricalPipelineTests(unittest.TestCase):
    def test_south_carolina_election_history_builds_2012_2016_2020_county_baselines(self):
        config = load_config("etl/state-configs/sc.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeSouthCarolinaElectionHistoryCsv")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 138)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 138)
        self.assertIn("official Elections Database", native["metrics"]["nativeHistoricalWarning"])

        abbeville_2012 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2012 and row["jurisdictionName"] == "Abbeville County"
        )
        self.assertEqual(abbeville_2012["sourceLevel"], "county")
        self.assertEqual(abbeville_2012["demVotes"], 4543)
        self.assertEqual(abbeville_2012["repVotes"], 5981)
        self.assertEqual(abbeville_2012["otherVotes"], 147)
        self.assertEqual(abbeville_2012["totalVotes"], 10671)

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

        rows_2012 = [row for row in native["historicalRows"] if row["electionYear"] == 2012]
        self.assertEqual(sum(row["demVotes"] for row in rows_2012), 865941)
        self.assertEqual(sum(row["repVotes"] for row in rows_2012), 1071645)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2012), 26532)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2012), 1964118)


if __name__ == "__main__":
    unittest.main()
