import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthDakotaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/sd-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/sd-2024-source-request-matrix.tsv").open("r", encoding="utf-8-sig", newline="") as handle:
            self.request_rows = {row["requestId"]: row for row in csv.DictReader(handle, delimiter="\t")}

    def test_active_south_dakota_config_loads_caveated_county_staging_rows(self):
        config = load_config("etl/state-configs/sd.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(artifact["native"]["parser"], "nativeCountyPresidentCsv")
        self.assertEqual(len(artifact["native"]["resultRows"]), 66)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 66)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 66)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 198)
        self.assertEqual(metrics["nativeResultTotalVotes"], 428922)
        self.assertEqual(metrics["nativeTrumpVotes"], 272081)
        self.assertEqual(metrics["nativeHarrisVotes"], 146859)
        self.assertEqual(metrics["nativeOtherVotes"], 9982)
        self.assertEqual(metrics["nativeComparisonRows"], 66)
        self.assertEqual(metrics["nativeComparisonContest"], "United States Representative")
        self.assertEqual(metrics["nativeBallotsCast"], 435739)
        self.assertEqual(metrics["nativeRegisteredVoters"], 690306)

    def test_inventory_records_official_source_blocker_and_display_caveats(self):
        self.assertEqual(self.inventory["state"], "SD")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-03")
        self.assertEqual(self.inventory["currentConfigStatus"]["completionDecision"], "remain_in_source_discovery_queue")
        self.assertEqual(self.inventory["currentConfigStatus"]["resultRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["reviewRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["turnoutRows"], 66)
        self.assertIn("official SD SOS canvass PDF/static export", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("secondary staging coverage", " ".join(self.inventory["displayCaveats"]))
        self.assertIn("not precinct-level scatter plots", " ".join(self.inventory["displayCaveats"]))

    def test_registries_keep_sd_in_source_discovery_until_official_artifact_is_retained(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "SD" and row["scope"] == "statewide")
        discovery = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "SD")

        self.assertEqual(tier["confidence"], "partial_secondary_staging")
        self.assertNotIn("SD", native["completedNativeStates"])
        self.assertEqual(discovery["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertEqual(discovery["expected"]["localReviewRows"], 66)
        self.assertEqual(self.request_rows["sd-official-2024-canvass"]["priority"], "P0")
        self.assertIn("official 2024 General Election Canvass", self.request_rows["sd-official-2024-canvass"]["sourceNeed"])
        self.assertEqual(self.request_rows["sd-state-native-turnout"]["priority"], "P1")


if __name__ == "__main__":
    unittest.main()
