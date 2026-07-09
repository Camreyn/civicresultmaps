import csv
import json
import unittest
from pathlib import Path

from civic_etl.native import build_native_payload
from civic_etl.pipeline import load_config, validate_config


class MarylandHistoricalBaselineTests(unittest.TestCase):
    def test_maryland_2020_historical_rows_are_official_tagged_and_loaded(self):
        config = load_config("etl/state-configs/md.json")
        report = validate_config(config)
        raw_config = json.loads(Path("etl/state-configs/md.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/md-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))
        summary = json.loads(Path("data/md-2020-historical-presidential-baseline-summary.json").read_text(encoding="utf-8"))

        self.assertTrue(report.passed)
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "md-historical-presidential-baseline")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 24)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 24)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(len(rows), 24)
        self.assertEqual(sorted({int(row["election_year"]) for row in rows}), [2020])
        self.assertTrue(all(row["jurisdiction_tag"].startswith("county:24") for row in rows))
        self.assertEqual(summary["totals"], {"dem": 1985023, "rep": 976414, "other": 75593, "total": 3037030})
        self.assertTrue(summary["reconcilesToStatewideFile"])

        baltimore_city = next(row for row in rows if row["jurisdiction_name"] == "Baltimore City")
        baltimore_county = next(row for row in rows if row["jurisdiction_name"] == "Baltimore County")
        self.assertEqual(baltimore_city["jurisdiction_tag"], "county:24510")
        self.assertEqual(baltimore_county["jurisdiction_tag"], "county:24005")
        self.assertEqual(int(baltimore_city["dem_votes"]), 207260)
        self.assertEqual(int(baltimore_county["dem_votes"]), 258409)

        payload = build_native_payload(config)
        historical_rows = payload["historicalRows"]
        self.assertEqual(payload["metrics"]["nativeHistoricalRows"], 24)
        self.assertEqual(payload["metrics"]["nativeHistoricalYears"], [2020])
        staged_city = next(row for row in historical_rows if row["jurisdictionName"] == "Baltimore City")
        self.assertEqual(staged_city["jurisdictionTag"], "county:24510")
        self.assertEqual(staged_city["jurisdictionGeoid"], "24510")


if __name__ == "__main__":
    unittest.main()