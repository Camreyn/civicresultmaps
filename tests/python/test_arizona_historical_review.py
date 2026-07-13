import csv
import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "etl" / "state-configs" / "az.json"
CSV_PATH = ROOT / "data" / "az-historical-review-rows.csv"
RECONCILIATION_PATH = ROOT / "data" / "az-historical-review-reconciliation.json"
PDF_PATH = ROOT / "data" / "az-2016-general-official-signed-state-canvass.pdf"
ZIP_PATH = ROOT / "data" / "az-2020-general-results-detail.xml.zip"
SCRIPT_PATH = ROOT / "scripts" / "normalize_az_historical_review.py"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_normalizer():
    spec = importlib.util.spec_from_file_location("normalize_az_historical_review", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load Arizona historical-review normalizer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ArizonaHistoricalReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        cls.reconciliation = json.loads(RECONCILIATION_PATH.read_text(encoding="utf-8"))
        with CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
            cls.rows = list(csv.DictReader(handle))

    def test_official_source_artifact_identity(self):
        self.assertEqual(PDF_PATH.stat().st_size, 9_624_192)
        self.assertEqual(
            sha256(PDF_PATH),
            "a765b3d03bcbdcaba4e3e869bd24cbb6dc2288841d7848eaa18b46e099ccaada",
        )
        self.assertEqual(ZIP_PATH.stat().st_size, 1_808_603)
        self.assertEqual(
            sha256(ZIP_PATH),
            "542f2e4d60463d6ad23b78e2de0f73759806945c6bcaedc6c0a7dd7aec422c06",
        )

    def test_csv_has_15_canonical_counties_per_year(self):
        self.assertEqual(len(self.rows), 30)
        expected_tags = {
            "county:04001", "county:04003", "county:04005", "county:04007",
            "county:04009", "county:04011", "county:04012", "county:04013",
            "county:04015", "county:04017", "county:04019", "county:04021",
            "county:04023", "county:04025", "county:04027",
        }
        for year in (2016, 2020):
            rows = [row for row in self.rows if int(row["election_year"]) == year]
            self.assertEqual(len(rows), 15)
            self.assertEqual({row["jurisdiction_tag"] for row in rows}, expected_tags)
            self.assertEqual({row["level"] for row in rows}, {"county"})
            self.assertEqual({row["coverage_mode"] for row in rows}, {"presidentVsUSSenateCounty"})
            for row in rows:
                self.assertEqual(
                    int(row["total_votes"]),
                    int(row["dem_votes"]) + int(row["rep_votes"]) + int(row["other_votes"]),
                )

    def test_statewide_president_and_senate_totals(self):
        expected = {
            2016: {
                "president": (1_161_167, 1_252_401, 159_597, 2_573_165),
                "comparison": (1_031_245, 1_359_267, 140_218, 2_530_730),
            },
            2020: {
                "president": (1_672_143, 1_661_686, 53_497, 3_387_326),
                "comparison": (1_716_467, 1_637_661, 1_189, 3_355_317),
            },
        }
        for year, totals in expected.items():
            rows = [row for row in self.rows if int(row["election_year"]) == year]
            president = (
                sum(int(row["dem_votes"]) for row in rows),
                sum(int(row["rep_votes"]) for row in rows),
                sum(int(row["other_votes"]) for row in rows),
                sum(int(row["total_votes"]) for row in rows),
            )
            comparison = (
                sum(int(row["comparison_dem_votes"]) for row in rows),
                sum(int(row["comparison_rep_votes"]) for row in rows),
                sum(int(row["comparison_other_votes"]) for row in rows),
                sum(
                    int(row["comparison_dem_votes"])
                    + int(row["comparison_rep_votes"])
                    + int(row["comparison_other_votes"])
                    for row in rows
                ),
            )
            self.assertEqual(president, totals["president"])
            self.assertEqual(comparison, totals["comparison"])

    def test_reconciliation_records_pdf_visual_qa(self):
        self.assertEqual(self.reconciliation["rowCount"], 30)
        self.assertEqual(self.reconciliation["rowCountsByYear"], {"2016": 15, "2020": 15})
        qa = self.reconciliation["pdfVisualQa"]
        self.assertEqual(qa["renderedPages"], list(range(1, 12)))
        self.assertEqual(qa["dpi"], 200)
        self.assertEqual(qa["status"], "passed")
        self.assertTrue(qa["noOcrUsed"])
        self.assertEqual(len(qa["textLayerSingleVoteCorrections"]), 38)

    def test_config_loads_year_specific_sources_and_normalized_rows(self):
        sources = {source["id"]: source for source in self.config["sources"]}
        baseline = sources["az-historical-presidential-wikipedia-county"]
        self.assertEqual(baseline["metadata"]["electionYears"], [2012, 2016, 2020])
        self.assertEqual(
            sources["az-2016-general-official-signed-state-canvass"]["metadata"]["electionYear"],
            2016,
        )
        self.assertEqual(
            sources["az-2020-general-results-detail-xml"]["metadata"]["electionYear"],
            2020,
        )
        normalized = sources["az-2016-2020-historical-advisory-county-review"]
        self.assertEqual(normalized["parser"], "historicalReviewCsv")
        self.assertEqual(normalized["metadata"]["electionYears"], [2016, 2020])
        review = self.config["historicalReview"]
        self.assertEqual(review["sourceId"], normalized["id"])
        self.assertEqual(review["expected"]["rowCount"], 30)
        self.assertEqual(review["expected"]["rowCountsByYear"], {"2016": 15, "2020": 15})
        self.assertEqual(self.config["expected"]["sources"], 9)
        self.assertEqual(self.config["expected"]["historicalReviewRows"], 30)

    def test_normalizer_reproduces_checked_in_rows_when_pdf_runtime_is_available(self):
        if importlib.util.find_spec("pdfplumber") is None:
            self.skipTest("pdfplumber is supplied by the bundled PDF runtime")
        normalizer = load_normalizer()
        generated_rows, generated_reconciliation = normalizer.build_rows(PDF_PATH, ZIP_PATH)
        self.assertEqual(generated_reconciliation, self.reconciliation)
        self.assertEqual(len(generated_rows), len(self.rows))
        for generated, checked_in in zip(generated_rows, self.rows, strict=True):
            self.assertEqual(
                {field: str(generated[field]) for field in normalizer.FIELDNAMES},
                checked_in,
            )


if __name__ == "__main__":
    unittest.main()
