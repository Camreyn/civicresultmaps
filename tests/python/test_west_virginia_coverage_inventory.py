import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class WestVirginiaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/wv-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))

    def test_inventory_preserves_loaded_result_review_and_turnout_counts(self):
        config = load_config("etl/state-configs/wv.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 55)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 1648)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 1649)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutBallotsCast"], 770587)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRegisteredVoters"], 1187991)

        sources = {source["id"]: source for source in artifact["sources"]}
        inventory_source = sources["wv-2024-data-coverage-inventory"]
        self.assertEqual(inventory_source["status"], "candidate")
        self.assertTrue(all(item["exists"] for item in inventory_source["metadata"]["artifacts"]))

    def test_inventory_records_geometry_audit_cvr_and_historical_gaps(self):
        self.assertEqual(self.inventory["state"], "WV")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-01")

        findings = {item["topic"]: item for item in self.inventory["sourceFindings"]}
        self.assertEqual(findings["precinctBoundaryGeometry"]["status"], "needs_data")
        self.assertIn("Voter%20Data%20Request.pdf", findings["precinctBoundaryGeometry"]["relatedSourceUrls"][1])
        self.assertEqual(findings["postElectionAudit"]["status"], "policy_documented_outcomes_need_data")
        self.assertEqual(findings["cvrAvailabilityAndRequestPaths"]["status"], "request_path_documented_not_loaded")
        self.assertEqual(findings["historicalBaselines"]["status"], "official_source_leads_confirmed_not_loaded")
        self.assertFalse(self.inventory["productionChecked"])
        self.assertTrue(any("not evidence of fraud or misconduct" in risk for risk in self.inventory["remainingRisks"]))


if __name__ == "__main__":
    unittest.main()
