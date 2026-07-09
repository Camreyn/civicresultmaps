import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class IdahoHistoricalTests(unittest.TestCase):
    def test_idaho_historical_baselines_load_official_county_rows(self):
        config = load_config("etl/state-configs/id.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)

        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 132)
        self.assertEqual(len(native["historicalRows"]), 132)
        self.assertEqual(sorted({row["electionYear"] for row in native["historicalRows"]}), [2012, 2016, 2020])

        rows_2020 = [row for row in native["historicalRows"] if row["electionYear"] == 2020]
        self.assertEqual(len(rows_2020), 44)
        self.assertEqual(sum(row["demVotes"] for row in rows_2020), 287021)
        self.assertEqual(sum(row["repVotes"] for row in rows_2020), 554119)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2020), 26794)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2020), 867934)

        ada_2020 = next(row for row in rows_2020 if row["jurisdictionName"] == "Ada County")
        self.assertEqual(ada_2020["demVotes"], 120539)
        self.assertEqual(ada_2020["repVotes"], 130699)
        self.assertEqual(ada_2020["otherVotes"], 8462)
        self.assertEqual(ada_2020["rowMethod"], "officialIdahoSosStatisticsHtmlCountyHistorical")


if __name__ == "__main__":
    unittest.main()
