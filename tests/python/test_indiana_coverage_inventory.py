import csv
import json
import unittest
from pathlib import Path


class IndianaCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/in-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        self.enr_inventory = json.loads(Path("data/in-2024-official-enr-public-data-inventory.json").read_text(encoding="utf-8-sig"))
        self.routing_summary = json.loads(Path("data/in-2024-county-request-routing-summary.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))
        self.admin = next(entry for entry in admin["stateYearStatuses"] if entry["state"] == "IN")
        self.request_packet = Path("data/source-records-request-packets/in-2024-precinct-results-request.md")
        with Path("data/in-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = list(csv.DictReader(handle, delimiter="\t"))
        with Path("data/in-2024-county-request-routing.csv").open(encoding="utf-8-sig", newline="") as handle:
            self.routing_rows = list(csv.DictReader(handle))

    def test_loaded_artifacts_keep_official_and_supplemental_sources_distinct(self):
        artifacts = {entry["id"]: entry for entry in self.inventory["loadedArtifacts"]}
        self.assertEqual(artifacts["in-2024-official-enr-president"]["reportingGrain"], "county")
        self.assertEqual(artifacts["in-2024-general-turnout"]["expectedCounts"]["rows"], 92)
        self.assertEqual(artifacts["in-2024-mit-precinct-president-senate"]["confidence"], "loaded_secondary_supplemental")
        audit = artifacts["in-2024-vstop-general-audit-summary"]
        self.assertEqual(audit["expectedCounts"]["rows"], 7)
        self.assertEqual(audit["expectedCounts"]["ballotComparisonCounties"], 3)
        self.assertIn("not proof", " ".join(audit["caveats"]))
        routing = artifacts["in-2024-county-request-routing"]
        self.assertEqual(routing["expectedCounts"]["counties"], 92)
        self.assertEqual(routing["expectedCounts"]["precincts"], 5147)
        self.assertEqual(routing["expectedCounts"]["precinctSplits"], 1342)
        self.assertIn("Certified county map/result totals", " ".join(artifacts["in-2024-official-enr-president"]["caveats"]))
        self.assertIn("supplemental", " ".join(artifacts["in-2024-mit-precinct-president-senate"]["caveats"]).lower())

    def test_official_enr_public_data_inventory_confirms_local_blocker(self):
        self.assertFalse(self.enr_inventory["conclusion"]["officialSameGrainSubcountyPresidentSenateRowsAvailable"])
        self.assertIn("voter statistics only", self.enr_inventory["appDataPathProbe"]["scriptEvidence"][2]["observation"])
        retained = {entry["officeCategoryId"]: entry for entry in self.enr_inventory["retainedOfficeCategoryFiles"]}
        self.assertEqual(retained["1019"]["regionCount"], 92)
        self.assertEqual(retained["1006"]["regionCount"], 92)
        self.assertEqual(retained["1019"]["localCandidateFieldNames"], [])
        self.assertEqual(self.enr_inventory["jurisdictionReportInventory"]["rescannedCandidateContainerCount"], 0)
        self.assertIn("supplemental MIT/OpenElections", self.enr_inventory["conclusion"]["blocker"])

    def test_2012_historical_baseline_is_loaded_from_official_endpoint(self):
        lead = next(entry for entry in self.inventory["historicalBaselineSourceLeads"] if entry["year"] == 2012)
        self.assertEqual(lead["status"], "loaded_official_county_baseline")
        self.assertIn("ENRHistorical", lead["sourceUrl"])
        artifacts = {entry["id"]: entry for entry in self.inventory["loadedArtifacts"]}
        historical = artifacts["in-historical-presidential-official-enr"]
        self.assertEqual(historical["expectedCounts"]["rows"], 276)
        self.assertIn(2012, historical["expectedCounts"]["years"])
        self.assertFalse(any(entry["artifact"] == "2012_historical_presidential_baseline" for entry in self.inventory["gaps"]))

    def test_completion_decision_keeps_official_precinct_blocker_visible(self):
        native_packages = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        discovery = next(entry for entry in native_packages["sourceDiscoveryQueue"] if entry["state"] == "IN")
        source_tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        source_tier = next(entry for entry in source_tiers["states"] if entry["state"] == "IN")

        self.assertEqual(self.inventory["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertEqual(discovery["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertNotIn("IN", native_packages["completedNativeStates"])
        self.assertIn("official same-grain precinct/subcounty", self.inventory["completionDecision"]["reason"])
        self.assertIn("in-2024-official-enr-public-data-inventory", discovery["completionDecision"]["reason"])
        self.assertIn("MIT/OpenElections", discovery["completionDecision"]["reason"])
        self.assertIn("requestRouting", discovery["availableArtifacts"])
        self.assertEqual(source_tier["confidence"], "loaded_with_caveat")
        self.assertIn("supplemental MIT/OpenElections", source_tier["caveats"])
        self.assertIn("county custodian follow-up", source_tier["parserStatus"])
        self.assertTrue(any("supplemental MIT/OpenElections" in caveat for caveat in self.inventory["displayCaveats"]))

    def test_admin_source_paths_are_documented_but_not_normalized(self):
        self.assertEqual(self.admin["status"], "partial")
        self.assertEqual(self.admin["audit"]["status"], "partial")
        self.assertIn("vstop-post-election-risk-limiting-audit-reports", self.admin["audit"]["sourceUrl"])
        self.assertEqual(self.admin["audit"]["expectedRows"], 7)
        self.assertTrue(Path(self.admin["audit"]["normalizedArtifact"]).exists())
        self.assertIn("Detailed audit-unit", self.admin["audit"]["why"])
        self.assertEqual(self.admin["cvr"]["status"], "needs_data")
        self.assertEqual(self.admin["incidents"]["status"], "candidate")
        self.assertIn("indiana-recount-commission", self.admin["incidents"]["sourceUrl"])
        self.assertIn("source-request-matrix", self.admin["incidents"]["why"])

    def test_request_matrix_tracks_remaining_official_source_asks(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/in-2024-source-request-matrix.tsv")
        self.assertEqual(
            self.inventory["requestPacketArtifact"],
            "data/source-records-request-packets/in-2024-precinct-results-request.md",
        )
        artifacts = {row["artifact"]: row for row in self.request_rows}
        self.assertEqual(len(self.request_rows), 9)
        self.assertEqual(artifacts["official_precinct_or_local_reporting_unit_president"]["priority"], "high")
        self.assertIn("request_packet_ready", artifacts["official_precinct_or_local_reporting_unit_president"]["local_artifact_status"])
        self.assertIn("precinct split identifier", artifacts["official_precinct_or_local_reporting_unit_us_senate"]["needed_fields"])
        self.assertEqual(artifacts["official_2012_county_presidential_baseline"]["local_artifact_status"], "loaded_official_endpoint_json")
        self.assertEqual(artifacts["vstop_audit_selection_outcome"]["local_artifact_status"], "loaded_official_summary_pdf_normalized")
        self.assertIn("not proof", artifacts["vstop_audit_selection_outcome"]["caveat"])
        self.assertEqual(artifacts["county_custodian_request_routing"]["local_artifact_status"], "loaded_machine_readable_tracking:data/in-2024-county-request-routing.csv")
        self.assertIn("92 official custodians", artifacts["county_custodian_request_routing"]["blocker"])
        self.assertIn("misconduct", artifacts["recount_incident_correction_records"]["caveat"])

    def test_request_packet_records_precinct_split_ask(self):
        self.assertTrue(self.request_packet.exists())
        packet = self.request_packet.read_text(encoding="utf-8-sig")
        self.assertIn("5,147 precincts", packet)
        self.assertIn("1,342 precinct splits", packet)
        self.assertIn("Generated by `scripts/build-in-request-packet.mjs`", packet)
        self.assertIn("Parser Requirements", packet)
        self.assertIn("same local keys", packet)
        self.assertIn("precinct split code", packet)
        self.assertIn("data/in-2024-county-request-routing.csv", packet)
        self.assertIn("elections@iec.in.gov", packet)
        self.assertIn("not asking for conclusions about misconduct", packet)

    def test_county_request_routing_tracker_is_machine_readable(self):
        self.assertEqual(self.inventory["requestRoutingArtifact"], "data/in-2024-county-request-routing.csv")
        self.assertEqual(self.routing_summary["totals"]["counties"], 92)
        self.assertEqual(self.routing_summary["totals"]["precincts"], 5147)
        self.assertEqual(self.routing_summary["totals"]["precinctSplits"], 1342)
        self.assertEqual(self.routing_summary["totals"]["precinctsWithSplits"], 1092)
        self.assertIn("stateRequestEvidence", self.routing_summary)
        self.assertIn("parserRequirements", self.routing_summary)
        self.assertTrue(
            any("reconcile local President and U.S. Senate totals" in item for item in self.routing_summary["parserRequirements"])
        )
        self.assertEqual(len(self.routing_rows), 92)
        marion = next(row for row in self.routing_rows if row["county"] == "Marion County")
        self.assertEqual(marion["routing_priority"], "high_volume_or_split")
        self.assertEqual(marion["precinct_count"], "621")
        self.assertEqual(marion["precinct_split_count"], "78")
        self.assertIn("Marion County Election Board", marion["office_name"])
        self.assertIn("county_followup_if_state_confirms_no_statewide_export", marion["county_followup_status"])
        self.assertIn("no President or U.S. Senate candidate result rows", marion["notes"])


if __name__ == "__main__":
    unittest.main()
