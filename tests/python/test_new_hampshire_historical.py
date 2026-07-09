import csv
import json
from pathlib import Path
import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewHampshireHistoricalBaselineTests(unittest.TestCase):
    def test_official_historical_package_is_normalized(self):
        with Path("data/nh-historical-presidential-baseline.csv").open(encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 20)
        self.assertEqual(sorted({row["election_year"] for row in rows}), ["2016", "2020"])
        self.assertTrue(all(row["jurisdiction_tag"].startswith("county:33") for row in rows))

        belknap = next(row for row in rows if row["jurisdiction_name"] == "Belknap County" and row["election_year"] == "2016")
        self.assertEqual(int(belknap["dem_votes"]), 13517)
        self.assertEqual(int(belknap["rep_votes"]), 19315)
        self.assertEqual(int(belknap["other_votes"]), 2213)
        self.assertIn("official county write-in votes", belknap["notes"])

        belknap_2020 = next(row for row in rows if row["jurisdiction_name"] == "Belknap County" and row["election_year"] == "2020")
        self.assertEqual(int(belknap_2020["dem_votes"]), 16894)
        self.assertEqual(int(belknap_2020["rep_votes"]), 20899)
        self.assertEqual(int(belknap_2020["other_votes"]), 686)
        self.assertEqual(belknap_2020["jurisdiction_tag"], "county:33001")

        config = json.loads(Path("etl/state-configs/nh.json").read_text(encoding="utf-8"))
        source = next(source for source in config["sources"] if source["id"] == "nh-2016-official-historical-presidential-workbooks")
        self.assertEqual(source["status"], "loaded")
        self.assertEqual(source["parser"], "historicalPresidentialCsv")
        self.assertTrue(config["capabilities"]["historicalBaseline"])
        self.assertEqual(config["historicalBaselines"]["expected"]["rowCount"], 20)
        self.assertEqual(config["expected"]["historicalBaselineRows"], 20)
        self.assertIn("2012 official historical workbook sets remain blocked", source["confidence"])

    def test_native_import_includes_2020_historical_rows_with_tags(self):
        config = load_config(Path("etl/state-configs/nh.json"))
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        self.assertTrue(report.passed)
        historical_rows = artifact["native"]["historicalRows"]
        self.assertEqual(len(historical_rows), 20)
        rows_2020 = [row for row in historical_rows if row["electionYear"] == 2020]
        self.assertEqual(len(rows_2020), 10)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2020), 806205)
        self.assertEqual({row["jurisdictionTag"] for row in rows_2020}, {
            "county:33001", "county:33003", "county:33005", "county:33007", "county:33009",
            "county:33011", "county:33013", "county:33015", "county:33017", "county:33019",
        })


if __name__ == "__main__":
    unittest.main()
