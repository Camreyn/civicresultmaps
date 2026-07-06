import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class PennsylvaniaHistoricalPipelineTests(unittest.TestCase):
    def test_pennsylvania_bulk_parser_builds_historical_rows(self):
        config = load_config("etl/state-configs/pa.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativePennsylvaniaBulkCsv")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 201)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 201)
        self.assertIn("official Department of State", native["metrics"]["nativeHistoricalWarning"])

        allegheny_2020 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2020 and row["jurisdictionName"] == "Allegheny County"
        )
        self.assertEqual(allegheny_2020["sourceLevel"], "county")
        self.assertEqual(allegheny_2020["demVotes"], 430212)
        self.assertEqual(allegheny_2020["repVotes"], 283089)
        self.assertEqual(allegheny_2020["otherVotes"], 8345)
        self.assertEqual(allegheny_2020["totalVotes"], 721646)

        rows_2016 = [row for row in native["historicalRows"] if row["electionYear"] == 2016]
        self.assertEqual(sum(row["demVotes"] for row in rows_2016), 2925758)
        self.assertEqual(sum(row["repVotes"] for row in rows_2016), 2970378)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2016), 218160)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2016), 6114296)


if __name__ == "__main__":
    unittest.main()
