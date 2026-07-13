import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import load_config, validate_config


class WashingtonHistoricalBaselineTests(unittest.TestCase):
    def test_washington_2016_2020_historical_source_artifact_is_scripted_and_configured(self):
        config = load_config("etl/state-configs/wa.json")
        report = validate_config(config)
        raw_config = json.loads(Path("etl/state-configs/wa.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/wa-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "wa-historical-presidential-baseline")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 78)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 78)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(len(rows), 78)
        self.assertEqual(sorted({int(row["election_year"]) for row in rows}), [2016, 2020])

        king = next(row for row in rows if row["election_year"] == "2020" and row["jurisdiction_name"] == "King County")
        self.assertEqual(king["row_method"], "historicalPresidentialCsv")
        self.assertEqual(int(king["dem_votes"]), 907310)
        self.assertEqual(int(king["rep_votes"]), 269167)
        self.assertEqual(int(king["other_votes"]), 34030)
        self.assertEqual(int(king["total_votes"]), 1210507)

        rows_2020 = [row for row in rows if row["election_year"] == "2020"]
        self.assertEqual(sum(int(row["dem_votes"]) for row in rows_2020), 2369612)
        self.assertEqual(sum(int(row["rep_votes"]) for row in rows_2020), 1584651)
        self.assertEqual(sum(int(row["other_votes"]) for row in rows_2020), 133368)
        self.assertEqual(sum(int(row["total_votes"]) for row in rows_2020), 4087631)


if __name__ == "__main__":
    unittest.main()
