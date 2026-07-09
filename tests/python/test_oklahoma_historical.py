import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class OklahomaHistoricalBaselineTests(unittest.TestCase):
    def test_oklahoma_2020_historical_baseline_rows_are_loaded(self):
        config = load_config("etl/state-configs/ok.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        raw_config = json.loads(Path("etl/state-configs/ok.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/ok-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))

        self.assertTrue(report.passed)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "ok-historical-presidential-baseline")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 77)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 77)
        self.assertEqual(len(rows), 77)
        self.assertEqual(sorted({int(row["election_year"]) for row in rows}), [2020])
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 77)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2020])

        oklahoma_county = next(row for row in artifact["native"]["historicalRows"] if row["jurisdictionName"] == "Oklahoma County")
        self.assertEqual(oklahoma_county["demVotes"], 141724)
        self.assertEqual(oklahoma_county["repVotes"], 145050)
        self.assertEqual(oklahoma_county["otherVotes"], 7966)
        self.assertEqual(oklahoma_county["totalVotes"], 294740)
        self.assertEqual(oklahoma_county["jurisdictionTag"], "county:40109")

        adair = next(row for row in artifact["native"]["historicalRows"] if row["jurisdictionName"] == "Adair County")
        self.assertEqual(adair["jurisdictionTag"], "county:40001")

        totals = {
            "dem": sum(int(row["dem_votes"]) for row in rows),
            "rep": sum(int(row["rep_votes"]) for row in rows),
            "other": sum(int(row["other_votes"]) for row in rows),
            "total": sum(int(row["total_votes"]) for row in rows),
        }
        self.assertEqual(totals, {"dem": 503890, "rep": 1020280, "other": 36529, "total": 1560699})


if __name__ == "__main__":
    unittest.main()
