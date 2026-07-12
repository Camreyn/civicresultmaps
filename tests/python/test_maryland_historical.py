import csv
import json
import unittest
from pathlib import Path

from civic_etl.native import build_native_payload
from civic_etl.pipeline import load_config, validate_config


class MarylandHistoricalBaselineTests(unittest.TestCase):
    def test_maryland_2016_2020_historical_rows_are_official_and_loaded(self):
        config = load_config("etl/state-configs/md.json")
        report = validate_config(config)
        raw_config = json.loads(Path("etl/state-configs/md.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/md-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))
        summary = json.loads(Path("data/md-historical-presidential-baseline-summary.json").read_text(encoding="utf-8"))

        self.assertTrue(report.passed)
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "md-historical-presidential-baseline")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 48)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 48)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(len(rows), 48)
        self.assertEqual(sorted({int(row["election_year"]) for row in rows}), [2016, 2020])
        self.assertEqual({year: sum(int(row["election_year"]) == year for row in rows) for year in (2016, 2020)}, {2016: 24, 2020: 24})
        self.assertEqual(summary["output"]["rowCount"], 48)
        self.assertEqual(summary["output"]["years"], [2016, 2020])
        source_2020 = next(source for source in summary["sources"] if source["year"] == 2020)
        self.assertEqual(
            {key: source_2020[key] for key in ("demVotes", "repVotes", "otherVotes", "totalVotes")},
            {"demVotes": 1985023, "repVotes": 976414, "otherVotes": 75594, "totalVotes": 3037031},
        )

        baltimore_city = next(row for row in rows if row["election_year"] == "2020" and row["jurisdiction_name"] == "Baltimore City")
        baltimore_county = next(row for row in rows if row["election_year"] == "2020" and row["jurisdiction_name"] == "Baltimore County")
        self.assertNotEqual(baltimore_city["jurisdiction_name"], baltimore_county["jurisdiction_name"])
        self.assertEqual(int(baltimore_city["dem_votes"]), 207260)
        self.assertEqual(int(baltimore_county["dem_votes"]), 258409)

        payload = build_native_payload(config)
        historical_rows = payload["historicalRows"]
        self.assertEqual(payload["metrics"]["nativeHistoricalRows"], 48)
        self.assertEqual(payload["metrics"]["nativeHistoricalYears"], [2016, 2020])
        staged_city = next(row for row in historical_rows if row["electionYear"] == 2020 and row["jurisdictionName"] == "Baltimore City")
        self.assertEqual(staged_city["sourceLevel"], "county")
        self.assertEqual(staged_city["sourceJurisdictionName"], "Baltimore City")


if __name__ == "__main__":
    unittest.main()
