import csv
import json
from pathlib import Path
import unittest


class NewHampshireHistoricalBaselineTests(unittest.TestCase):
    def test_2016_official_historical_candidate_package_is_normalized(self):
        with Path("data/nh-historical-presidential-baseline.csv").open(encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 10)
        self.assertEqual(sorted({row["election_year"] for row in rows}), ["2016"])

        belknap = next(row for row in rows if row["jurisdiction_name"] == "Belknap County")
        self.assertEqual(int(belknap["dem_votes"]), 13517)
        self.assertEqual(int(belknap["rep_votes"]), 19315)
        self.assertEqual(int(belknap["other_votes"]), 2213)
        self.assertIn("official county write-in votes", belknap["notes"])

        config = json.loads(Path("etl/state-configs/nh.json").read_text(encoding="utf-8"))
        source = next(source for source in config["sources"] if source["id"] == "nh-2016-official-historical-presidential-workbooks")
        self.assertEqual(source["status"], "candidate")
        self.assertEqual(source["parser"], "historicalPresidentialCsv")
        self.assertFalse(config["capabilities"]["historicalBaseline"])
        self.assertNotIn("historicalBaselines", config)
        self.assertIn("shared civic_etl/native.py dispatcher change", source["confidence"])


if __name__ == "__main__":
    unittest.main()