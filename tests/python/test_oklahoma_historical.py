import csv
import importlib.util
import io
import json
import unittest
import zipfile
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts/normalize-ok-historical-presidential-baseline.py"
SPEC = importlib.util.spec_from_file_location("normalize_ok_historical", SCRIPT_PATH)
NORMALIZER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(NORMALIZER)


class OklahomaHistoricalTests(unittest.TestCase):
    def test_zip_reader_requires_one_exact_root_member(self):
        fixture_dir = REPO_ROOT / ".etl-test"
        fixture_dir.mkdir(exist_ok=True)
        archive_path = fixture_dir / "ok-historical-zip-validation.zip"
        expected = "20161108_CountyResults.csv"
        try:
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(f"../{expected}", "unsafe")
            with self.assertRaisesRegex(ValueError, "must contain only exact root member"):
                NORMALIZER.read_exact_root_csv(archive_path, expected)

            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(expected, "county,race_number,cand_name,cand_party,cand_tot_votes\n")
                archive.writestr("extra.csv", "unexpected")
            with self.assertRaisesRegex(ValueError, "must contain only exact root member"):
                NORMALIZER.read_exact_root_csv(archive_path, expected)

            expected_bytes = b"county,race_number,cand_name,cand_party,cand_tot_votes\n"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(expected, expected_bytes)
            actual_bytes, metadata = NORMALIZER.read_exact_root_csv(archive_path, expected)
            self.assertEqual(actual_bytes, expected_bytes)
            self.assertEqual(metadata["archiveMember"], expected)
            self.assertRegex(metadata["sha256"], r"^[0-9a-f]{64}$")
        finally:
            archive_path.unlink(missing_ok=True)

    def test_normalizer_reproduces_official_county_rows_and_summary(self):
        fixture_dir = REPO_ROOT / ".etl-test"
        fixture_dir.mkdir(exist_ok=True)
        output_path = fixture_dir / "ok-historical-generated.csv"
        summary_path = fixture_dir / "ok-historical-generated-summary.json"
        try:
            summary = NORMALIZER.normalize(REPO_ROOT, output_path, summary_path)
            committed = REPO_ROOT / "data/ok-historical-presidential-baseline.csv"
            self.assertEqual(output_path.read_bytes(), committed.read_bytes())
            self.assertEqual(summary["output"]["rowCount"], 154)
            self.assertEqual(summary["output"]["rowsPerYear"], {"2016": 77, "2020": 77})
            self.assertEqual(len(summary["sources"]), 2)
            self.assertTrue(all(source["sourceCountyCount"] == 77 for source in summary["sources"]))
            self.assertTrue(all(source["localFile"].endswith("CountyResults_csv.zip") for source in summary["sources"]))
            self.assertTrue(all(source["sourceUrl"].endswith(source["electionDate"]) for source in summary["sources"]))
            self.assertEqual(summary["sources"][0]["presidentCandidateCountyRows"], 231)
            self.assertEqual(summary["sources"][1]["presidentCandidateCountyRows"], 462)
            self.assertEqual(
                [source["sha256"] for source in summary["sources"]],
                [
                    "d4c4411c078ed7d7b3fcdf539b07c65026bb3bd185ff2dc570a53186f667bdf7",
                    "edf1231540b2ddf637b8a2c358fdb6bd4930cc0d12eacf9e2e18f533e3f9ff7b",
                ],
            )
            expected_tickets = {
                2016: {
                    ("DONALD J. TRUMP | MICHAEL R. PENCE", "REP"),
                    ("GARY JOHNSON | BILL WELD", "LIB"),
                    ("HILLARY CLINTON | TIM KAINE", "DEM"),
                },
                2020: {
                    ("BROCK PIERCE | KARLA BALLARD", "IND"),
                    ("DONALD J. TRUMP | MICHAEL R. PENCE", "REP"),
                    ("JADE SIMMONS | CLAUDELIAH J. ROZE", "IND"),
                    ("JO JORGENSEN | JEREMY SPIKE COHEN", "LIB"),
                    ("JOSEPH R. BIDEN | KAMALA D. HARRIS", "DEM"),
                    ("KANYE WEST | MICHELLE TIDBALL", "IND"),
                },
            }
            for source in summary["sources"]:
                actual = {(row["candidate"], row["party"]) for row in source["candidateTotals"]}
                self.assertEqual(actual, expected_tickets[source["year"]])
            rows = list(csv.DictReader(io.StringIO(output_path.read_text(encoding="utf-8"))))
            self.assertEqual(len(rows), 154)
            for year in (2016, 2020):
                year_rows = [row for row in rows if int(row["election_year"]) == year]
                self.assertEqual(len({row["jurisdiction_tag"] for row in year_rows}), 77)
                self.assertTrue(all(row["jurisdiction_tag"].startswith("county:40") for row in year_rows))
                self.assertTrue(all(row["local_unit"] for row in year_rows))
        finally:
            output_path.unlink(missing_ok=True)
            summary_path.unlink(missing_ok=True)

    def test_native_staging_attaches_2016_and_2020_county_baselines(self):
        config = load_config(REPO_ROOT / "etl/state-configs/ok.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertTrue(artifact["capabilities"]["historicalBaseline"])
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 154)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 154)
        for year, expected in {
            2016: {"demVotes": 420375, "repVotes": 949136, "otherVotes": 83481, "totalVotes": 1452992},
            2020: {"demVotes": 503890, "repVotes": 1020280, "otherVotes": 36529, "totalVotes": 1560699},
        }.items():
            rows = [row for row in native["historicalRows"] if row["electionYear"] == year]
            self.assertEqual(len(rows), 77)
            self.assertEqual(len({row["jurisdictionTag"] for row in rows}), 77)
            for field, value in expected.items():
                self.assertEqual(sum(row[field] for row in rows), value)
        self.assertEqual(native["historicalRows"][0]["sourceLevel"], "county")
        self.assertTrue(all(row["jurisdictionTag"].startswith("county:40") for row in native["historicalRows"]))

    def test_config_records_all_state_scoped_historical_artifacts(self):
        config = json.loads((REPO_ROOT / "etl/state-configs/ok.json").read_text(encoding="utf-8"))
        sources = {source["id"]: source for source in config["sources"]}
        for source_id in (
            "ok-2016-general-county-results",
            "ok-2020-general-county-results",
            "ok-historical-presidential-baseline",
            "ok-historical-presidential-baseline-summary",
        ):
            self.assertIn(source_id, sources)
            self.assertEqual(sources[source_id]["status"], "loaded")
        self.assertEqual(config["expected"]["sources"], 8)
        self.assertEqual(config["expected"]["historicalBaselineRows"], 154)
        self.assertEqual(config["historicalBaselines"]["expected"], {"rowCount": 154, "years": [2016, 2020]})
        self.assertIn("six presidential tickets", config["historicalBaselines"]["warning"])


if __name__ == "__main__":
    unittest.main()
