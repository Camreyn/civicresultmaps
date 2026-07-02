import csv
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class UtahHistoricalPipelineTests(unittest.TestCase):
    def test_utah_official_sources_turnout_and_historical_rows_are_configured(self):
        config = load_config("etl/state-configs/ut.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeNormalizedTurnoutCsv")
        self.assertEqual(native["metrics"]["nativeTurnoutRows"], 29)
        self.assertEqual(native["metrics"]["nativeBallotsCast"], 1529139)
        self.assertEqual(native["metrics"]["nativeRegisteredVoters"], 1793317)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 87)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])

        source_ids = {source["id"] for source in artifact["sources"]}
        self.assertIn("ut-2024-general-president-county", source_ids)
        self.assertIn("ut-2024-general-attorney-general-county", source_ids)
        self.assertIn("ut-2024-general-turnout-county", source_ids)
        self.assertIn("ut-historical-presidential-wikipedia-county", source_ids)

        with Path("data/ut-2024-general-president.csv").open(newline="") as handle:
            president_rows = list(csv.DictReader(handle))
        self.assertEqual(len(president_rows), 29)
        self.assertEqual(sum(int(row["trump"]) for row in president_rows), 883818)
        self.assertEqual(sum(int(row["harris"]) for row in president_rows), 562566)
        self.assertEqual(sum(int(row["other"]) for row in president_rows), 41626)

        historical = config.raw["historicalBaselines"]
        self.assertEqual(historical["expected"]["rowCount"], 87)
        self.assertEqual(historical["expected"]["years"], [2012, 2016, 2020])
        self.assertIn("official Utah historical", historical["warning"])


if __name__ == "__main__":
    unittest.main()