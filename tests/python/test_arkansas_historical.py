import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import load_config, validate_config


class ArkansasHistoricalSourceArtifactTests(unittest.TestCase):
    def test_arkansas_historical_source_artifact_is_scripted_and_configured(self):
        config = load_config("etl/state-configs/ar.json")
        report = validate_config(config)
        raw_config = json.loads(Path("etl/state-configs/ar.json").read_text(encoding="utf-8"))
        rows = list(csv.DictReader(Path("data/ar-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))

        self.assertTrue(report.passed)
        self.assertEqual(raw_config["historicalBaselines"]["sourceId"], "ar-historical-presidential-baseline")
        self.assertEqual(raw_config["historicalBaselines"]["expected"]["rowCount"], 225)
        self.assertEqual(raw_config["expected"]["historicalBaselineRows"], 225)
        self.assertTrue(raw_config["capabilities"]["historicalBaseline"])
        self.assertEqual(len(rows), 225)
        self.assertEqual(sorted({int(row["election_year"]) for row in rows}), [2012, 2016, 2020])

        pulaski_2020 = next(row for row in rows if row["election_year"] == "2020" and row["jurisdiction_name"] == "Pulaski County")
        self.assertEqual(pulaski_2020["row_method"], "arkansasTotalResultsOfficialCountyHistorical")
        self.assertEqual(int(pulaski_2020["dem_votes"]), 101947)
        self.assertEqual(int(pulaski_2020["rep_votes"]), 63687)
        self.assertEqual(int(pulaski_2020["other_votes"]), 4322)
        self.assertEqual(int(pulaski_2020["total_votes"]), 169956)

        rows_2012 = [row for row in rows if row["election_year"] == "2012"]
        self.assertTrue(all(row["row_method"] == "wikipediaCountyPresidentialTable2012OfficialApiBlocked" for row in rows_2012))
        self.assertEqual(sum(int(row["dem_votes"]) for row in rows_2012), 394409)
        self.assertEqual(sum(int(row["rep_votes"]) for row in rows_2012), 647744)
        self.assertEqual(sum(int(row["other_votes"]) for row in rows_2012), 27315)
        self.assertEqual(sum(int(row["total_votes"]) for row in rows_2012), 1069468)


if __name__ == "__main__":
    unittest.main()
