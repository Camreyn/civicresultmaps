import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class TennesseeHistoricalTests(unittest.TestCase):
    def test_tennessee_native_staging_loads_2020_county_historical_rows(self):
        config = load_config("etl/state-configs/tn.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertTrue(artifact["capabilities"]["historicalBaseline"])
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 95)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2020])
        self.assertEqual(len(native["historicalRows"]), 95)
        self.assertTrue(all(row["rowMethod"] == "tennesseeSosCountyPdfHistorical" for row in native["historicalRows"]))
        self.assertEqual(sum(row["demVotes"] for row in native["historicalRows"]), 1143711)
        self.assertEqual(sum(row["repVotes"] for row in native["historicalRows"]), 1852475)
        self.assertEqual(sum(row["otherVotes"] for row in native["historicalRows"]), 57665)
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 3053851)

        anderson = next(row for row in native["historicalRows"] if row["jurisdictionName"] == "Anderson County")
        self.assertEqual(anderson["sourceDocumentId"], "tn-historical-presidential-baseline")
        self.assertEqual(anderson["sourceLevel"], "county")
        self.assertEqual(anderson["demVotes"], 11741)
        self.assertEqual(anderson["repVotes"], 23184)
        self.assertEqual(anderson["otherVotes"], 645)
        self.assertEqual(anderson["totalVotes"], 35570)


if __name__ == "__main__":
    unittest.main()
