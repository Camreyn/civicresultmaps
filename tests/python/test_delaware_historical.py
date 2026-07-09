import csv
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class DelawareHistoricalPipelineTests(unittest.TestCase):
    def test_delaware_2020_historical_baseline_rows_are_loaded_with_county_tags(self):
        config = load_config("etl/state-configs/de.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        csv_rows = list(csv.DictReader(Path("data/de-historical-presidential-baseline.csv").read_text().splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(len(csv_rows), 3)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 3)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 3)

        self.assertEqual(
            sorted(row["jurisdiction_tag"] for row in csv_rows),
            ["county:10001", "county:10003", "county:10005"],
        )
        self.assertEqual(
            sorted(row["jurisdictionTag"] for row in artifact["native"]["historicalRows"]),
            ["county:10001", "county:10003", "county:10005"],
        )

        new_castle = next(row for row in artifact["native"]["historicalRows"] if row["jurisdictionName"] == "New Castle County")
        self.assertEqual(new_castle["sourceJurisdictionName"], "New Castle")
        self.assertEqual(new_castle["jurisdictionTag"], "county:10003")
        self.assertEqual(new_castle["demVotes"], 195034)
        self.assertEqual(new_castle["repVotes"], 88364)
        self.assertEqual(new_castle["otherVotes"], 4235)
        self.assertEqual(new_castle["totalVotes"], 287633)

        self.assertEqual(sum(row["totalVotes"] for row in artifact["native"]["historicalRows"]), 504010)


if __name__ == "__main__":
    unittest.main()
