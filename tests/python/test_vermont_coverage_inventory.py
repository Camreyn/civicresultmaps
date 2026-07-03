import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class VermontCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/vt-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/vt-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = list(csv.DictReader(handle, delimiter="\t"))
        self.requests = {row["request_id"]: row for row in self.request_rows}

    def test_active_vermont_config_remains_turnout_only(self):
        config = load_config("etl/state-configs/vt.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertTrue(config.raw.get("turnoutOnly"))
        self.assertEqual(len(artifact["native"]["resultRows"]), 0)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 0)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 247)
        self.assertFalse(config.raw["capabilities"]["certifiedResults"])
        self.assertFalse(config.raw["capabilities"]["reviewGraphs"])
        self.assertTrue(config.raw["capabilities"]["turnout"])

    def test_inventory_records_official_source_leads_and_parser_blocker(self):
        self.assertEqual(self.inventory["state"], "VT")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-03")
        self.assertFalse(self.inventory["productionChecked"])
        self.assertTrue(self.inventory["currentEtLStatus"]["turnoutOnly"])
        self.assertEqual(self.inventory["currentEtLStatus"]["expectedRows"]["reviewRows"], 0)
        self.assertEqual(self.inventory["repoDrift"][0]["path"], "docs/developer/index.md")

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_canvass_pdf_identified_parser_not_active")
        self.assertEqual(findings["sameGrainComparisonContest"]["preferredContest"], "U.S. Senate")
        self.assertIn("row grain", findings["sameGrainComparisonContest"]["notes"])
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialJsonTotals"]["townRows"], 247)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialJsonTotals"]["votersCast"], 372885)
        self.assertEqual(findings["stateNativeTurnout"]["activeFallbackTotals"]["ballotsCast"], 361604)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "county_geometry_loaded_town_reporting_crosswalk_missing")

    def test_registries_keep_vermont_in_source_discovery(self):
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))

        discovery = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "VT")
        tier = next(row for row in tiers["states"] if row["state"] == "VT")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "VT" and row["year"] == 2024)
        admin_status = next(row for row in admin["stateYearStatuses"] if row["state"] == "VT" and row["electionYear"] == 2024)

        self.assertNotIn("VT", native["completedNativeStates"])
        self.assertEqual(discovery["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertIn("split-town/district", discovery["blocker"])
        self.assertEqual(tier["confidence"], "classified_candidate")
        self.assertIn("official SOS static JSON", tier["exportFormats"])
        self.assertIn("Vermont SOS 2024 General Election Voter Turnout", turnout_status["nextAction"])
        self.assertEqual(admin_status["audit"]["status"], "candidate")
        self.assertEqual(admin_status["incidents"]["requestMatrixArtifact"], "data/vt-2024-source-request-matrix.tsv")

    def test_request_matrix_tracks_remaining_vermont_asks(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/vt-2024-source-request-matrix.tsv")
        self.assertEqual(len(self.request_rows), 7)
        self.assertEqual(self.requests["vt-2024-certified-president-canvass"]["status"], "official_pdf_identified_parser_not_active")
        self.assertEqual(self.requests["vt-2024-same-grain-us-senate"]["status"], "official_json_identified_not_loaded")
        self.assertIn("284 federal reporting rows", self.requests["vt-2024-same-grain-us-senate"]["expected_rows_or_totals"])
        self.assertEqual(self.requests["vt-2024-state-native-turnout"]["status"], "official_pdf_json_identified_not_loaded")
        self.assertIn("361604 ballots cast", self.requests["vt-2024-state-native-turnout"]["confidence_notes"])
        self.assertIn("evidence of fraud or misconduct", self.requests["vt-2024-audit-recount-cvr-incident-records"]["caveats"])


if __name__ == "__main__":
    unittest.main()
