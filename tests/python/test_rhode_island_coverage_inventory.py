import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config

ROOT = Path(__file__).resolve().parents[2]


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


class RhodeIslandCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = load_json("data/ri-2024-data-coverage-inventory.json")
        with (ROOT / "data/ri-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = {row["request_id"]: row for row in csv.DictReader(handle, delimiter="\t")}

    def test_active_ri_config_remains_turnout_only_with_inventory_source(self):
        config = load_config("etl/state-configs/ri.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertTrue(config.raw.get("turnoutOnly"))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 0)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 0)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 39)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 522164)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 792075)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["ri-2024-data-coverage-inventory"]["status"], "candidate")
        self.assertEqual(sources["ri-2024-data-coverage-inventory"]["localArtifact"], "data/ri-2024-data-coverage-inventory.json")

    def test_inventory_records_official_ri_boe_result_and_senate_leads(self):
        self.assertEqual(self.inventory["state"], "RI")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-02")
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_zip_and_json_identified_parser_needed")
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["statewidePresidentTotal"], 513386)
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["statewideSenateTotal"], 491948)
        self.assertIn("U.S. Senate", findings["sameGrainComparisonContest"]["preferredContest"])
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["eacFallbackRows"], 39)
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2020, 2016, 2012])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "request_paths_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_and_request_matrix_keep_ri_in_source_discovery(self):
        tiers = load_json("data/source-acquisition-tiers.json")
        native = load_json("data/native-import-source-packages.json")
        turnout = load_json("data/turnout-source-packages.json")
        admin = load_json("data/admin-source-packages.json")

        tier = next(row for row in tiers["states"] if row["state"] == "RI" and row["scope"] == "statewide")
        queue_entry = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "RI")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "RI" and row["year"] == 2024)
        admin_status = next(row for row in admin["stateYearStatuses"] if row["state"] == "RI" and row["electionYear"] == 2024)

        self.assertEqual(tier["tier"], "tier_1_official_export_database")
        self.assertIn("data/ri-2024-data-coverage-inventory.json", tier["parserStatus"])
        self.assertNotIn("RI", native["completedNativeStates"])
        self.assertEqual(queue_entry["requestMatrixArtifact"], "data/ri-2024-source-request-matrix.tsv")
        self.assertIn("EAC fallback active", turnout_status["nextAction"])
        self.assertEqual(admin_status["audit"]["localArtifact"], "data/ri-2024-data-coverage-inventory.json")

        self.assertEqual(self.request_rows["ri-2024-certified-results-zip"]["status"], "official_zip_lead_parser_needed")
        self.assertEqual(self.request_rows["ri-2024-us-senate-review"]["status"], "official_same_grain_lead_parser_needed")
        self.assertEqual(self.request_rows["ri-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
