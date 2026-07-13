import csv
import unittest
import uuid
from pathlib import Path

from civic_etl.models import EtlConfig, ExpectedConfig, SourceConfig
from civic_etl.native import _historical_baseline_rows, _historical_review_rows


FIELDNAMES = [
    "state", "election_year", "county", "jurisdiction_tag", "local_unit", "level",
    "dem_candidate", "rep_candidate", "dem_votes", "rep_votes", "other_votes", "total_votes",
    "comparison_contest", "comparison_dem_candidate", "comparison_rep_candidate",
    "comparison_dem_votes", "comparison_rep_votes", "comparison_other_votes", "coverage_mode",
    "source_id", "comparison_source_id", "source_url",
]


class HistoricalReviewRowsTest(unittest.TestCase):
    def build_config(self, artifact: Path) -> EtlConfig:
        source = SourceConfig(
            id="historical-review-normalized",
            category="historical_review",
            url="https://example.gov/results",
            local_file=str(artifact),
            parser="historicalReviewCsv",
            authority="Example election authority",
            timestamp_basis="certified canvass",
            confidence="official",
            status="loaded",
        )
        official_2016 = SourceConfig(
            id="official-2016",
            category="historical_review_source",
            url="https://example.gov/2016",
            local_file=str(artifact),
            parser="fixture",
            authority="Example election authority",
            timestamp_basis="certified canvass",
            confidence="official",
            status="loaded",
        )
        official_2020 = SourceConfig(
            id="official-2020",
            category="historical_review_source",
            url="https://example.gov/2020",
            local_file=str(artifact),
            parser="fixture",
            authority="Example election authority",
            timestamp_basis="certified canvass",
            confidence="official",
            status="loaded",
        )
        raw = {
            "expected": {"historicalReviewRows": 2},
            "historicalReview": {
                "format": "historicalReviewCsv",
                "sourceId": source.id,
                "warning": "Same-grain historical review fixture.",
                "expected": {
                    "rowCount": 2,
                    "years": [2016, 2020],
                    "rowCountsByYear": {"2016": 1, "2020": 1},
                },
            },
        }
        return EtlConfig(
            code="EX",
            name="Example",
            authority="Example election authority",
            election_year=2024,
            office="president",
            sources=[source, official_2016, official_2020],
            expected=ExpectedConfig(jurisdictions=0, result_rows=0, sources=3),
            capabilities={},
            raw=raw,
        )

    def write_rows(self, artifact: Path, state: str = "EX") -> None:
        rows = [
            {
                "state": state,
                "election_year": 2016,
                "county": "Alpha County",
                "jurisdiction_tag": "county:99001",
                "local_unit": "Precinct 1",
                "level": "precinct",
                "dem_candidate": "Hillary Clinton",
                "rep_candidate": "Donald Trump",
                "dem_votes": 120,
                "rep_votes": 100,
                "other_votes": 5,
                "total_votes": 225,
                "comparison_contest": "United States Senator",
                "comparison_dem_candidate": "Jane Democrat",
                "comparison_rep_candidate": "John Republican",
                "comparison_dem_votes": 110,
                "comparison_rep_votes": 95,
                "comparison_other_votes": 4,
                "coverage_mode": "presidentVsSenate",
                "source_id": "official-2016",
                "comparison_source_id": "official-2016",
                "source_url": "https://example.gov/2016",
            },
            {
                "state": state,
                "election_year": 2020,
                "county": "Beta County",
                "jurisdiction_tag": "county:99003",
                "local_unit": "Beta County",
                "level": "county",
                "dem_candidate": "Joe Biden",
                "rep_candidate": "Donald Trump",
                "dem_votes": 210,
                "rep_votes": 190,
                "other_votes": 8,
                "total_votes": 408,
                "comparison_contest": "United States Senator",
                "comparison_dem_candidate": "Jane Democrat",
                "comparison_rep_candidate": "John Republican",
                "comparison_dem_votes": 180,
                "comparison_rep_votes": 185,
                "comparison_other_votes": 6,
                "coverage_mode": "presidentVsUSSenateCounty",
                "source_id": "official-2020",
                "comparison_source_id": "official-2020",
                "source_url": "https://example.gov/2020",
            },
        ]
        with artifact.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)

    def mutate_first_row(self, artifact: Path, **changes) -> None:
        with artifact.open("r", encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        rows[0].update({key: str(value) for key, value in changes.items()})
        with artifact.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)
    def artifact_path(self) -> Path:
        return Path("tests/python") / f".historical-review-{uuid.uuid4().hex}.csv"

    def test_candidate_neutral_csv_preserves_year_tags_labels_and_metrics(self):
        artifact = self.artifact_path()
        try:
            self.write_rows(artifact)
            config = self.build_config(artifact)
            rows, metrics = _historical_review_rows(config, {source.id: source for source in config.sources})

            self.assertEqual(len(rows), 2)
            self.assertEqual(metrics["nativeHistoricalReviewYears"], [2016, 2020])
            self.assertEqual(metrics["nativeHistoricalReviewRowsByYear"], {2016: 1, 2020: 1})
            self.assertEqual(metrics["nativeHistoricalReviewComparisonRows"], 2)
            self.assertEqual(rows[0]["jurisdictionTag"], "county:99001")
            self.assertEqual(rows[0]["demCandidate"], "Hillary Clinton")
            self.assertEqual(rows[0]["repCandidate"], "Donald Trump")
            self.assertAlmostEqual(rows[0]["demShare"], 120 / 225 * 100, places=4)
            self.assertAlmostEqual(rows[0]["demDropoff"], 10 / 225 * 100, places=4)
            self.assertAlmostEqual(rows[0]["repDropoff"], 5 / 225 * 100, places=4)
        finally:
            artifact.unlink(missing_ok=True)

    def test_invalid_votes_sources_tags_and_comparison_semantics_are_rejected(self):
        cases = [
            ({"dem_votes": -1}, "negative votes"),
            ({"total_votes": 224}, "total_votes must equal"),
            ({"source_id": "missing-source"}, "unknown source ids"),
            ({"source_url": "https://other.example/2016"}, "source_url does not match"),
            ({"jurisdiction_tag": "county:bad"}, "invalid jurisdiction_tag"),
            ({"comparison_contest": ""}, "comparison values without comparison_contest"),
        ]
        for changes, message in cases:
            with self.subTest(changes=changes):
                artifact = self.artifact_path()
                try:
                    self.write_rows(artifact)
                    self.mutate_first_row(artifact, **changes)
                    config = self.build_config(artifact)
                    with self.assertRaisesRegex(ValueError, message):
                        _historical_review_rows(config, {source.id: source for source in config.sources})
                finally:
                    artifact.unlink(missing_ok=True)

    def test_zero_vote_named_comparison_candidate_is_still_present(self):
        artifact = self.artifact_path()
        try:
            self.write_rows(artifact)
            self.mutate_first_row(artifact, comparison_dem_votes=0)
            config = self.build_config(artifact)
            rows, _ = _historical_review_rows(config, {source.id: source for source in config.sources})
            self.assertTrue(rows[0]["comparisonDemCandidatePresent"])
            self.assertTrue(rows[0]["comparisonRepCandidatePresent"])
        finally:
            artifact.unlink(missing_ok=True)
    def test_historical_baseline_preserves_row_provenance_and_source_document(self):
        artifact = Path("tests/python") / f".historical-baseline-{uuid.uuid4().hex}.csv"
        source = SourceConfig(
            id="normalized-baseline",
            category="historical_baseline",
            url="https://example.gov/history",
            local_file=str(artifact),
            parser="historicalPresidentialCsv",
            authority="Example election authority",
            timestamp_basis="official exports",
            confidence="official",
            status="loaded",
        )
        config = EtlConfig(
            code="EX",
            name="Example",
            authority="Example election authority",
            election_year=2024,
            office="president",
            sources=[source],
            expected=ExpectedConfig(jurisdictions=0, result_rows=0, sources=1),
            capabilities={},
            raw={
                "historicalBaselines": {
                    "format": "historicalPresidentialCsv",
                    "sourceId": source.id,
                    "expected": {"rowCount": 1},
                },
            },
        )
        try:
            with artifact.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "state", "election_year", "jurisdiction_name", "jurisdiction_tag",
                    "source_id", "source_level", "row_method", "dem_votes", "rep_votes",
                    "other_votes", "total_votes", "source_url",
                ])
                writer.writeheader()
                writer.writerow({
                    "state": "EX",
                    "election_year": 2020,
                    "jurisdiction_name": "Alpha County",
                    "jurisdiction_tag": "county:99001",
                    "source_id": "official-2020-row-provenance",
                    "source_level": "county",
                    "row_method": "historicalPresidentialCsv",
                    "dem_votes": 120,
                    "rep_votes": 100,
                    "other_votes": 5,
                    "total_votes": 225,
                    "source_url": "https://example.gov/2020",
                })
            rows, metrics = _historical_baseline_rows(config, {source.id: source})
            self.assertEqual(metrics["nativeHistoricalYears"], [2020])
            self.assertEqual(rows[0]["sourceId"], "official-2020-row-provenance")
            self.assertEqual(rows[0]["sourceUrl"], "https://example.gov/2020")
            self.assertEqual(rows[0]["sourceDocumentId"], source.id)
            self.assertEqual(rows[0]["jurisdictionTag"], "county:99001")
        finally:
            artifact.unlink(missing_ok=True)
    def test_wrong_state_is_rejected(self):
        artifact = self.artifact_path()
        try:
            self.write_rows(artifact, state="NO")
            config = self.build_config(artifact)
            with self.assertRaisesRegex(ValueError, "wrong state"):
                _historical_review_rows(config, {source.id: source for source in config.sources})
        finally:
            artifact.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()