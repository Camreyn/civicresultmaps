import csv
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class UtahPipelineTests(unittest.TestCase):
    def test_utah_official_sources_results_review_turnout_and_historical_rows_are_configured(self):
        config = load_config("etl/state-configs/ut.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeCountyPresidentCsv")
        self.assertEqual(len(native["resultRows"]), 29)
        self.assertEqual(len(native["reviewRows"]), 29)
        self.assertEqual(native["metrics"]["nativeResultTotalVotes"], 1488494)
        self.assertEqual(native["metrics"]["nativeTrumpVotes"], 883818)
        self.assertEqual(native["metrics"]["nativeHarrisVotes"], 562566)
        self.assertEqual(native["metrics"]["nativeOtherVotes"], 42110)
        self.assertEqual(native["metrics"]["nativeComparisonRows"], 29)
        self.assertEqual(native["metrics"]["nativeComparisonContest"], "Attorney General")
        self.assertEqual(native["metrics"]["nativeTurnoutRows"], 29)
        self.assertEqual(native["metrics"]["nativeBallotsCast"], 1529139)
        self.assertEqual(native["metrics"]["nativeRegisteredVoters"], 1793317)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 87)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertIn("county-level President-versus-Attorney-General", native["metrics"]["nativeReviewWarning"])

        beaver = next(row for row in native["reviewRows"] if row["county"] == "Beaver County")
        self.assertEqual(beaver["coverageMode"], "presidentVsAttorneyGeneral")
        self.assertEqual(beaver["comparisonDemVotes"], 299)
        self.assertEqual(beaver["comparisonRepVotes"], 2537)
        self.assertEqual(beaver["comparisonOtherVotes"], 278)

        source_ids = {source["id"] for source in artifact["sources"]}
        self.assertIn("ut-2024-general-president-county", source_ids)
        self.assertIn("ut-2024-general-president-official-api", source_ids)
        self.assertIn("ut-2024-general-attorney-general-county", source_ids)
        self.assertIn("ut-2024-general-turnout-county", source_ids)
        self.assertIn("ut-historical-presidential-wikipedia-county", source_ids)

        with Path("data/ut-2024-general-president.csv").open(newline="") as handle:
            president_rows = list(csv.DictReader(handle))
        self.assertEqual(len(president_rows), 29)
        self.assertEqual(sum(int(row["trump"]) for row in president_rows), 883818)
        self.assertEqual(sum(int(row["harris"]) for row in president_rows), 562566)
        self.assertEqual(sum(int(row["other"]) for row in president_rows), 42110)

        historical = config.raw["historicalBaselines"]
        self.assertEqual(historical["expected"]["rowCount"], 87)
        self.assertEqual(historical["expected"]["years"], [2012, 2016, 2020])
        self.assertIn("official Utah historical", historical["warning"])


if __name__ == "__main__":
    unittest.main()
