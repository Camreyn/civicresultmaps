import csv
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class DistrictOfColumbiaHistoricalPipelineTests(unittest.TestCase):
    def test_certified_rows_load_as_one_current_and_two_historical_county_equivalents(self):
        config = load_config("etl/state-configs/dc.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        csv_rows = list(csv.DictReader(Path("data/dc-historical-presidential-baseline.csv").read_text().splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 1)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 325869)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 2)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2016, 2020])

        current = artifact["native"]["resultRows"][0]
        self.assertEqual(current["jurisdictionName"], "District of Columbia")
        self.assertEqual(current["jurisdictionCode"], "11001")
        self.assertEqual(current["level"], "county")
        self.assertEqual(current["votes"], {"Trump": 21076, "Harris": 294185, "Other": 10608})

        historical = artifact["native"]["historicalRows"]
        self.assertEqual(len(csv_rows), 2)
        self.assertTrue(all(row["jurisdictionTag"] == "county:11001" for row in historical))
        self.assertTrue(all(row["jurisdictionName"] == "District of Columbia" for row in historical))
        self.assertEqual([row["totalVotes"] for row in historical], [311268, 344356])


if __name__ == "__main__":
    unittest.main()
