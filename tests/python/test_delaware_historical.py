import csv
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class DelawareHistoricalPipelineTests(unittest.TestCase):
    def test_delaware_2016_2020_historical_baseline_rows_are_loaded_with_county_tags(self):
        config = load_config("etl/state-configs/de.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        csv_rows = list(csv.DictReader(Path("data/de-historical-presidential-baseline.csv").read_text().splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(len(csv_rows), 6)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 6)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 6)

        for year in (2016, 2020):
            self.assertEqual(
                sorted(row["jurisdiction_tag"] for row in csv_rows if int(row["election_year"]) == year),
                ["county:10001", "county:10003", "county:10005"],
            )
            self.assertEqual(
                sorted(
                    row["jurisdictionTag"]
                    for row in artifact["native"]["historicalRows"]
                    if row["electionYear"] == year
                ),
                ["county:10001", "county:10003", "county:10005"],
            )

        new_castle = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["electionYear"] == 2020 and row["jurisdictionName"] == "New Castle County"
        )
        new_castle_2016 = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["electionYear"] == 2016 and row["jurisdictionName"] == "New Castle County"
        )
        self.assertEqual(new_castle_2016["sourceJurisdictionName"], "Wilmington")
        self.assertEqual(new_castle["sourceJurisdictionName"], "New Castle")
        self.assertEqual(new_castle["jurisdictionTag"], "county:10003")
        self.assertEqual(new_castle["demVotes"], 195034)
        self.assertEqual(new_castle["repVotes"], 88364)
        self.assertEqual(new_castle["otherVotes"], 4235)
        self.assertEqual(new_castle["totalVotes"], 287633)

        self.assertEqual(
            {
                year: sum(
                    row["totalVotes"]
                    for row in artifact["native"]["historicalRows"]
                    if row["electionYear"] == year
                )
                for year in (2016, 2020)
            },
            {2016: 441590, 2020: 504010},
        )


if __name__ == "__main__":
    unittest.main()
