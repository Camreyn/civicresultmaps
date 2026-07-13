import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NorthCarolinaHistoricalPipelineTests(unittest.TestCase):
    def test_north_carolina_official_historical_baseline_rows(self):
        config = load_config("etl/state-configs/nc.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 300)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 300)
        self.assertIn("official NCSBE 2012, 2016, and 2020 precinct results ZIPs", native["metrics"]["nativeHistoricalWarning"])
        self.assertTrue(
            all(row["rowMethod"] == "northCarolinaPrecinctResultsZipCountyAggregate" for row in native["historicalRows"])
        )
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"] if row["electionYear"] == 2020), 5524802)

        self.assertEqual(native["metrics"]["nativeHistoricalReviewRows"], 2762)
        self.assertEqual(native["metrics"]["nativeHistoricalReviewYears"], [2016, 2020])
        self.assertEqual(native["metrics"]["nativeHistoricalReviewRowsByYear"], {2016: 100, 2020: 2662})
        review_rows_2016 = [row for row in native["historicalReviewRows"] if row["electionYear"] == 2016]
        review_rows_2020 = [row for row in native["historicalReviewRows"] if row["electionYear"] == 2020]
        self.assertEqual(len(review_rows_2016), 100)
        self.assertEqual(len(review_rows_2020), 2662)
        self.assertTrue(all(row["level"] == "county" for row in review_rows_2016))
        self.assertTrue(all(row["level"] == "precinct" for row in review_rows_2020))
        self.assertEqual(len({row["jurisdictionTag"] for row in review_rows_2016}), 100)
        self.assertEqual(len({row["jurisdictionTag"] for row in review_rows_2020}), 100)
        self.assertTrue(all(row["sourceId"] == "nc-2016-results-precinct-zip" for row in review_rows_2016))
        self.assertTrue(all(row["sourceId"] == "nc-2020-results-precinct-zip" for row in review_rows_2020))
        self.assertEqual(sum(row["totalVotes"] for row in review_rows_2016), 4741564)
        self.assertEqual(sum(row["comparisonDemVotes"] + row["comparisonRepVotes"] + row["comparisonOtherVotes"] for row in review_rows_2016), 4691133)


if __name__ == "__main__":
    unittest.main()