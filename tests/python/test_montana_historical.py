import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class MontanaHistoricalBaselineTests(unittest.TestCase):
    def test_official_2020_historical_rows_are_configured_and_tagged(self):
        config = load_config("etl/state-configs/mt.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        raw_config = json.loads(Path("etl/state-configs/mt.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/mt-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "mt-2020-historical-presidential-official-county")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 56)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 56)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(len(rows), 56)
        self.assertEqual({row["election_year"] for row in rows}, {"2020"})
        self.assertTrue(all(row["jurisdiction_tag"].startswith("county:30") for row in rows))
        self.assertEqual(len({row["jurisdiction_tag"] for row in rows}), 56)
        self.assertEqual(sum(int(row["dem_votes"]) for row in rows), 244786)
        self.assertEqual(sum(int(row["rep_votes"]) for row in rows), 343602)
        self.assertEqual(sum(int(row["other_votes"]) for row in rows), 15252)
        self.assertEqual(sum(int(row["total_votes"]) for row in rows), 603640)

        native = artifact["native"]
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 56)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2020])
        self.assertEqual(len(native["historicalRows"]), 56)
        tagged = {row["jurisdictionName"]: row["jurisdictionTag"] for row in native["historicalRows"]}
        self.assertEqual(tagged["Beaverhead County"], "county:30001")
        self.assertEqual(tagged["Yellowstone County"], "county:30111")


if __name__ == "__main__":
    unittest.main()
