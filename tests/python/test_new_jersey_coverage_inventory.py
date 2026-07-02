import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewJerseyCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nj-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/nj-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_active_new_jersey_config_remains_turnout_only_with_inventory_source(self):
        config = load_config("etl/state-configs/nj.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertTrue(config.raw.get("turnoutOnly"))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 0)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 0)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 21)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 4321921)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 6630364)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["nj-2024-data-coverage-inventory"]["status"], "candidate")
        self.assertEqual(sources["nj-2024-data-coverage-inventory"]["localArtifact"], "data/nj-2024-data-coverage-inventory.json")

    def test_inventory_records_official_pdf_package_and_turnout_delta(self):
        self.assertEqual(self.inventory["state"], "NJ")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-02")
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedPresidentResults"]["status"], "official_text_pdf_package_identified_parser_needed")
        self.assertEqual(findings["certifiedPresidentResults"]["observedOfficialTotals"]["stateTotal"], 4272725)
        self.assertEqual(findings["sameGrainComparisonContest"]["preferredContest"], "U.S. Senate")
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["stateOfficialBallotsCast"], 4321921)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["officialMinusEacRegisteredVoters"], 52335)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "county_geometry_loaded_municipal_geometry_lead_identified_not_loaded")
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2020, 2016, 2012])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "official_audit_links_and_request_paths_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_and_request_matrix_keep_nj_in_source_discovery(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "NJ" and row["scope"] == "statewide")
        queue_entry = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "NJ")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "NJ" and row["year"] == 2024)
        admin_nj = next(row for row in admin["stateYearStatuses"] if row["state"] == "NJ" and row["electionYear"] == 2024)

        self.assertEqual(tier["tier"], "tier_6_official_pdf_hostile")
        self.assertIn("official county municipal result PDFs", tier["exportFormats"])
        self.assertNotIn("NJ", native["completedNativeStates"])
        self.assertEqual(queue_entry["requestMatrixArtifact"], "data/nj-2024-source-request-matrix.tsv")
        self.assertIn("official_text_pdf_result_review", queue_entry["currentStatus"])
        self.assertIn("52,335", turnout_status["nextAction"])
        self.assertEqual(admin_nj["audit"]["status"], "candidate")
        self.assertEqual(admin_nj["audit"]["localArtifact"], "data/nj-2024-data-coverage-inventory.json")

        self.assertEqual(self.request_rows["nj-2024-certified-president-pdfs"]["status"], "official_text_pdf_lead_parser_needed")
        self.assertEqual(self.request_rows["nj-2024-turnout-pdfs"]["status"], "state_native_source_lead_not_loaded")
        self.assertEqual(self.request_rows["nj-2024-admin-cvr-incident-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
