import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class OregonCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/or-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))

    def test_inventory_preserves_loaded_result_review_and_turnout_counts(self):
        config = load_config("etl/state-configs/or.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(artifact["native"]["parser"], "nativeOregonCountyPresidentCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 36)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 2244493)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 919480)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 1240600)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 84413)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 36)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 36)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 2269608)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 3060374)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutParser"], "eacTurnoutCsv")

        sources = {source["id"]: source for source in artifact["sources"]}
        inventory_source = sources["or-2024-data-coverage-inventory"]
        self.assertEqual(inventory_source["status"], "candidate")
        self.assertTrue(all(item["exists"] for item in inventory_source["metadata"]["artifacts"]))

    def test_inventory_records_turnout_historical_precinct_and_admin_gaps(self):
        self.assertEqual(self.inventory["state"], "OR")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-02")
        self.assertFalse(self.inventory["productionChecked"])

        findings = {item["topic"]: item for item in self.inventory["sourceFindings"]}
        self.assertEqual(findings["historicalBaselines"]["status"], "official_source_leads_confirmed_not_loaded")
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2012, 2016, 2020])
        self.assertEqual(findings["stateNativeTurnout"]["status"], "official_source_lead_confirmed_not_loaded")
        self.assertEqual(findings["precinctReviewRows"]["status"], "source_package_collected_parser_needed")
        self.assertEqual(findings["postElectionAudit"]["status"], "source_path_needed")
        self.assertEqual(findings["cvrAvailabilityAndRequestPaths"]["status"], "request_path_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])


if __name__ == "__main__":
    unittest.main()
