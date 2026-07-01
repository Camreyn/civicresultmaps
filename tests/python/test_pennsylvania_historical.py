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
        self.assertIn("contextual baseline", native["metrics"]["nativeHistoricalWarning"])

        allegheny_2020 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2020 and row["jurisdictionName"] == "Allegheny County"
        )
        self.assertEqual(allegheny_2020["sourceLevel"], "county")
        self.assertEqual(allegheny_2020["demVotes"], 430759)
        self.assertEqual(allegheny_2020["repVotes"], 282913)
        self.assertEqual(allegheny_2020["otherVotes"], 11128)
        self.assertEqual(allegheny_2020["totalVotes"], 724800)

        rows_2016 = [row for row in native["historicalRows"] if row["electionYear"] == 2016]
        self.assertEqual(sum(row["demVotes"] for row in rows_2016), 2926458)
        self.assertEqual(sum(row["repVotes"] for row in rows_2016), 2970742)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2016), 269738)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2016), 6166938)


if __name__ == "__main__":
    unittest.main()
