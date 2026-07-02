import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class DelawareCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/de-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/de-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_active_delaware_config_remains_turnout_only_with_inventory_source(self):
        config = load_config("etl/state-configs/de.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertTrue(config.raw.get("turnoutOnly"))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 0)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 0)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 3)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 514367)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 788441)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["de-2024-data-coverage-inventory"]["status"], "candidate")
        self.assertEqual(sources["de-2024-data-coverage-inventory"]["localArtifact"], "data/de-2024-data-coverage-inventory.json")

    def test_inventory_records_official_leads_and_turnout_reconciliation_need(self):
        self.assertEqual(self.inventory["state"], "DE")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-02")
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_digital_report_identified_parser_needed")
        self.assertEqual(findings["sameGrainComparisonContest"]["preferredContest"].split(",")[0], "U.S. Senate")
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["ageGroupPartyReportRegisteredVoters"], 788864)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["eacFallbackRegisteredVoters"], 788441)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "official_election_district_geometry_lead_identified_not_loaded")
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2020, 2016, 2012])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "request_paths_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_and_request_matrix_keep_de_in_source_discovery(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "DE" and row["scope"] == "statewide")
        queue_entry = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "DE")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "DE" and row["year"] == 2024)

        self.assertEqual(tier["tier"], "tier_5_digital_inconsistent")
        self.assertIn("Power BI", " ".join(tier["exportFormats"]))
        self.assertNotIn("DE", native["completedNativeStates"])
        self.assertEqual(queue_entry["requestMatrixArtifact"], "data/de-2024-source-request-matrix.tsv")
        self.assertIn("AGP", turnout_status["nextAction"])

        self.assertEqual(self.request_rows["de-2024-certified-results-export"]["status"], "official_report_lead_parser_needed")
        self.assertEqual(self.request_rows["de-2024-turnout-agp-normalizer"]["status"], "state_native_source_lead_not_loaded")
        self.assertEqual(self.request_rows["de-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()

