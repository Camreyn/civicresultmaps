import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewMexicoCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nm-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/nm-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_active_new_mexico_config_remains_turnout_only_with_inventory_source(self):
        config = load_config("etl/state-configs/nm.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertTrue(config.raw.get("turnoutOnly"))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 0)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 0)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 33)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 927923)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 1415984)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["nm-2024-data-coverage-inventory"]["status"], "candidate")
        self.assertEqual(sources["nm-2024-data-coverage-inventory"]["localArtifact"], "data/nm-2024-data-coverage-inventory.json; data/nm-2024-source-request-matrix.tsv")

    def test_inventory_records_official_dashboard_turnout_and_admin_leads(self):
        self.assertEqual(self.inventory["status"], "official_results_dashboard_export_identified_inventory_only")
        self.assertIn("docs/developer/index.md", self.inventory["repoDrift"][0])
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["presidentialTotalVotes"], 923403)
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["harrisVotes"], 478802)
        self.assertEqual(findings["sameGrainComparisonContest"]["preferredContest"], "U.S. Senate")
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["senateTotalVotes"], 903311)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["ballotsCastDeltaOfficialMinusEac"], 367)
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2020, 2016, 2012])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "request_paths_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_and_request_matrix_keep_nm_in_source_discovery(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native = self.load_json("data/native-import-source-packages.json")
        turnout = self.load_json("data/turnout-source-packages.json")
        admin = self.load_json("data/admin-source-packages.json")

        tier = next(row for row in tiers["states"] if row["state"] == "NM" and row["scope"] == "statewide")
        queue_entry = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "NM")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "NM" and row["year"] == 2024)
        admin_status = next(row for row in admin["stateYearStatuses"] if row["state"] == "NM" and row["electionYear"] == 2024)

        self.assertEqual(tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertIn("CSV media/results exports", tier["exportFormats"])
        self.assertNotIn("NM", native["completedNativeStates"])
        self.assertEqual(queue_entry["requestMatrixArtifact"], "data/nm-2024-source-request-matrix.tsv")
        self.assertIn("U.S. Senate", queue_entry["preferredComparisonContest"])
        self.assertEqual(turnout_status["coverage"]["stateNativeBallotsCastDelta"], 367)
        self.assertEqual(admin_status["audit"]["status"], "candidate")
        self.assertEqual(admin_status["cvr"]["status"], "candidate")
        self.assertEqual(admin_status["incidents"]["status"], "candidate")

        self.assertEqual(self.request_rows["nm-2024-certified-results-export"]["status"], "official_dashboard_csv_lead_not_collected")
        self.assertEqual(self.request_rows["nm-2024-turnout-details"]["status"], "state_native_source_lead_not_loaded")
        self.assertEqual(self.request_rows["nm-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
