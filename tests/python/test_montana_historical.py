import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class MontanaHistoricalBaselineTests(unittest.TestCase):
    def test_official_2016_2020_historical_rows_are_configured(self):
        config = load_config("etl/state-configs/mt.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        raw_config = json.loads(Path("etl/state-configs/mt.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/mt-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "mt-historical-presidential-baseline")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 112)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 112)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(len(rows), 112)
        self.assertEqual({row["election_year"] for row in rows}, {"2016", "2020"})
        self.assertEqual({year: sum(row["election_year"] == year for row in rows) for year in ("2016", "2020")}, {"2016": 56, "2020": 56})
        self.assertEqual(
            {year: len({row["jurisdiction_name"] for row in rows if row["election_year"] == year}) for year in ("2016", "2020")},
            {"2016": 56, "2020": 56},
        )
        rows_2020 = [row for row in rows if row["election_year"] == "2020"]
        self.assertEqual(sum(int(row["dem_votes"]) for row in rows_2020), 244786)
        self.assertEqual(sum(int(row["rep_votes"]) for row in rows_2020), 343602)
        self.assertEqual(sum(int(row["other_votes"]) for row in rows_2020), 15252)
        self.assertEqual(sum(int(row["total_votes"]) for row in rows_2020), 603640)

        native = artifact["native"]
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 112)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 112)
        beaverhead = next(row for row in native["historicalRows"] if row["electionYear"] == 2020 and row["jurisdictionName"] == "Beaverhead County")
        yellowstone = next(row for row in native["historicalRows"] if row["electionYear"] == 2020 and row["jurisdictionName"] == "Yellowstone County")
        self.assertEqual(beaverhead["sourceLevel"], "county")
        self.assertEqual(yellowstone["sourceLevel"], "county")


if __name__ == "__main__":
    unittest.main()
