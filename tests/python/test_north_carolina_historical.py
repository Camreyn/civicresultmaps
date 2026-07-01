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


if __name__ == "__main__":
    unittest.main()