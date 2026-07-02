import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NorthDakotaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nd-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/nd-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = list(csv.DictReader(handle, delimiter="\t"))
        self.requests = {row["request_id"]: row for row in self.request_rows}

    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_nd_config_remains_turnout_only_with_inventory_provenance(self):
        config = load_config("etl/state-configs/nd.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(config.expected.result_rows, 0)
        self.assertEqual(config.expected.review_rows, 0)
        self.assertEqual(artifact["native"]["parser"], "nativeEacTurnoutCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 53)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 371974)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 0)

        sources = {source["id"]: source for source in artifact["sources"]}
        inventory_source = sources["nd-2024-data-coverage-inventory"]
        self.assertEqual(inventory_source["status"], "candidate")
        self.assertTrue(all(item["exists"] for item in inventory_source["metadata"]["artifacts"]))

    def test_inventory_records_official_results_and_denominator_caveat(self):
        findings = self.inventory["officialSourceFindings"]

        self.assertEqual(self.inventory["status"], "official_results_dashboard_and_exports_identified_inventory_only")
        self.assertEqual(
            findings["certifiedResults"]["status"],
            "official_dashboard_export_identified_parser_needed",
        )
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["presidentialTotalVotes"], 368155)
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["trumpVotes"], 246505)
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["harrisVotes"], 112327)
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["otherVotes"], 9323)
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["usSenateTotalVotes"], 364327)
        self.assertEqual(findings["stateNativeTurnoutAndDenominator"]["observedOfficialTotals"]["officialDashboardEligibleVoters"], 594140)
        self.assertIn("does not require voter registration", findings["stateNativeTurnoutAndDenominator"]["caveat"])
        self.assertIn("not evidence of fraud or misconduct", " ".join(self.inventory["remainingRisks"]))

    def test_request_matrix_tracks_follow_up_artifacts(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/nd-2024-source-request-matrix.tsv")
        self.assertEqual(len(self.request_rows), 8)
        self.assertEqual(
            self.requests["nd-2024-certified-results-export"]["status"],
            "official_export_form_identified_parser_needed",
        )
        self.assertIn("same exported grain", self.requests["nd-2024-comparison-results-export"]["needed_artifact"])
        self.assertEqual(
            self.requests["nd-2024-eligible-voter-turnout"]["status"],
            "state_native_eligible_voter_lead_not_loaded",
        )
        self.assertIn("does not require voter registration", self.requests["nd-2024-eligible-voter-turnout"]["caveats"])
        self.assertEqual(
            self.requests["nd-2024-recount-cvr-incident-records"]["status"],
            "needs_records_request_and_scope_review",
        )

    def test_nd_registries_are_source_discovery_not_complete_native(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")
        turnout_packages = self.load_json("data/turnout-source-packages.json")
        admin_packages = self.load_json("data/admin-source-packages.json")

        tier = next(row for row in tiers["states"] if row["state"] == "ND" and row["scope"] == "statewide")
        self.assertEqual(tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertEqual(tier["confidence"], "candidate_parser_ready")
        self.assertIn("CSV/Excel/XML export form", tier["exportFormats"])
        self.assertIn("data/nd-2024-data-coverage-inventory.json", tier["parserStatus"])

        self.assertNotIn("ND", native_packages["completedNativeStates"])
        native_nd = next(row for row in native_packages["sourceDiscoveryQueue"] if row["state"] == "ND")
        self.assertEqual(native_nd["requestMatrixArtifact"], "data/nd-2024-source-request-matrix.tsv")
        self.assertIn("does not require voter registration", native_nd["parserNeeded"])

        turnout_nd = next(row for row in turnout_packages["stateYearStatuses"] if row["state"] == "ND" and row["year"] == 2024)
        self.assertEqual(turnout_nd["coverage"]["jurisdictionRows"], 53)
        self.assertEqual(turnout_nd["coverage"]["registeredVoters"], 0)
        self.assertEqual(turnout_nd["coverage"]["stateNativeEligibleVotersLead"], 594140)
        self.assertIn("data/nd-2024-data-coverage-inventory.json", turnout_nd["coverage"]["coverageInventory"])

        admin_nd = next(row for row in admin_packages["stateYearStatuses"] if row["state"] == "ND" and row["electionYear"] == 2024)
        self.assertEqual(admin_nd["equipment"]["expectedJurisdictions"], 53)
        self.assertEqual(admin_nd["audit"]["status"], "candidate")
        self.assertIn("post-election audits in all 53 counties", admin_nd["audit"]["why"])
        self.assertEqual(admin_nd["cvr"]["status"], "candidate")


if __name__ == "__main__":
    unittest.main()
