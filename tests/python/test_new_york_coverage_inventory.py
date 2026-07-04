import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewYorkCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def load_request_rows(self):
        lines = Path("data/ny-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig").strip().splitlines()
        header = lines[0].split("\t")
        return {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_active_new_york_config_builds_partial_review_staging(self):
        config = load_config("etl/state-configs/ny.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 62)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 10408)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 62)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 186)
        self.assertEqual(metrics["nativeResultTotalVotes"], 8381429)
        self.assertEqual(metrics["nativeHarrisVotes"], 4619543)
        self.assertEqual(metrics["nativeTrumpVotes"], 3579519)
        self.assertEqual(metrics["nativeOtherVotes"], 182367)
        self.assertEqual(metrics["nativeBallotsCast"], 8389626)
        self.assertEqual(metrics["nativeRegisteredVoters"], 13579416)
        self.assertIn("county-certified result totals remain the map authority", metrics["nativeReviewWarning"])

    def test_inventory_and_registries_keep_ny_in_source_discovery(self):
        inventory = self.load_json("data/ny-2024-data-coverage-inventory.json")
        native = self.load_json("data/native-import-source-packages.json")
        tiers = self.load_json("data/source-acquisition-tiers.json")
        manifest = self.load_json("data/ny-2024-local-review-sources.json")
        request_rows = self.load_request_rows()
        packets = self.load_json("data/ny-2024-missing-county-request-packets.json")
        packet_counties = {packet["county"] for packet in packets["packets"]}

        queue_entry = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "NY")
        tier = next(row for row in tiers["states"] if row["state"] == "NY" and row["scope"] == "statewide")
        monroe_workbook = next(row for row in manifest["files"] if row["file"] == "Monroe.xlsx")
        monroe_official = next(row for row in manifest["files"] if row["file"] == "ny-2024-monroe-canvass-book.pdf")
        excluded = {row["county"] for row in manifest["excludedFiles"]}

        self.assertNotIn("NY", native["completedNativeStates"])
        self.assertEqual(inventory["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertIn("Wave 19", inventory["completionDecision"]["wave19Decision"])
        self.assertIn("Wave 21", inventory["completionDecision"]["wave21Decision"])
        self.assertIn("Wave 23", inventory["completionDecision"]["wave23Decision"])
        self.assertIn("Wave 25", inventory["completionDecision"]["wave25Decision"])
        self.assertFalse(inventory["productionChecked"])
        self.assertIn("docs/developer/index.md", inventory["repoDrift"][0])
        self.assertEqual(inventory["sourceRequestMatrix"], "data/ny-2024-source-request-matrix.tsv")
        self.assertEqual(inventory["requestPath"]["countyRequestPackets"], "data/ny-2024-missing-county-request-packets.json")
        self.assertEqual(queue_entry["requestMatrixArtifact"], "data/ny-2024-source-request-matrix.tsv")
        self.assertEqual(queue_entry["requestPacketArtifact"], "data/ny-2024-missing-county-request-packets.json")
        self.assertIn("source request matrix", tier["parserStatus"])
        self.assertIn("12 county equivalents", tier["caveats"])
        self.assertIn("future official export paths", tier["parserStatus"])
        self.assertIn("Monroe", tier["parserStatus"])

        coverage = inventory["completionDecision"]["reviewCoverage"]
        self.assertEqual(coverage["reviewRows"], 10408)
        self.assertEqual(coverage["coveredCountyEquivalents"], 50)
        self.assertEqual(coverage["missingCountyEquivalents"], 12)
        self.assertEqual(coverage["requestPacketCount"], 12)
        self.assertEqual(coverage["requestPacketArtifact"], "data/ny-2024-missing-county-request-packets.json")
        self.assertEqual(len(packets["packets"]), 12)
        self.assertEqual(packet_counties, set(coverage["excludedOrNotYetReviewedCounties"]))
        self.assertEqual(sum(packet["status"] == "packet_ready_no_loaded_rows" for packet in packets["packets"]), 11)
        self.assertEqual(sum(packet["status"] == "official_artifacts_found_not_loaded_reconciliation_needed" for packet in packets["packets"]), 1)
        self.assertEqual(next(packet for packet in packets["packets"] if packet["county"] == "Nassau County")["currentReviewStatus"], "no_manifest_source_file")
        self.assertNotIn("Monroe County", packet_counties)
        self.assertEqual(monroe_official["status"], "loaded")
        self.assertEqual(monroe_official["rows"], 655)
        self.assertEqual(next(packet for packet in packets["packets"] if packet["county"] == "Rockland County")["currentSourceLead"]["status"], "president_only_no_same_grain_us_senate_rows")
        self.assertEqual(next(packet for packet in packets["packets"] if packet["county"] == "Oswego County")["status"], "official_artifacts_found_not_loaded_reconciliation_needed")
        self.assertIn("oswegocountyny.gov", next(packet for packet in packets["packets"] if packet["county"] == "Oswego County")["currentSourceLead"]["url"])
        self.assertEqual(monroe_workbook["status"], "excluded_zero_rows")
        self.assertNotIn("Monroe County", coverage["excludedOrNotYetReviewedCounties"])
        self.assertIn("Rockland County", coverage["excludedOrNotYetReviewedCounties"])
        self.assertIn("Rockland County", excluded)

        self.assertEqual(request_rows["ny-2024-certified-county-results"]["status"], "loaded_from_official_nysboe_pdf")
        self.assertEqual(request_rows["ny-2024-supplemental-local-review"]["status"], "partial_loaded_with_missing_counties")
        self.assertEqual(request_rows["ny-2024-excluded-local-review-counties"]["status"], "needs_official_source_or_reviewed_extraction")
        self.assertEqual(request_rows["ny-2024-state-native-turnout"]["status"], "state_native_source_lead_not_loaded")
        self.assertEqual(request_rows["ny-2026-flateau-veda-export-readiness"]["status"], "future_official_path_empty_for_2024")
        self.assertEqual(request_rows["ny-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")
        packet_request_ids = {packet["packetId"] for packet in packets["packets"]}
        self.assertTrue(packet_request_ids.issubset(request_rows.keys()))
        self.assertEqual(request_rows["ny-2024-local-monroe"]["status"], "loaded_official_detail_reconciled")
        self.assertEqual(request_rows["ny-2024-local-oswego"]["status"], "official_artifacts_found_not_loaded_reconciliation_needed")
        self.assertEqual(request_rows["ny-2024-wave25-official-path-checks"]["status"], "evidence_artifact_added_no_loaded_rows")
        self.assertTrue(all(request_rows[request_id]["status"] == "packet_ready_no_loaded_rows" for request_id in packet_request_ids if request_id != "ny-2024-local-oswego"))

        wave25 = self.load_json("data/ny-2024-wave25-official-path-checks.json")
        self.assertEqual(wave25["summary"]["missingCountyEquivalentsRechecked"], 12)
        self.assertEqual(wave25["summary"]["officialPublicResultLeadsFoundNotLoaded"], ["Oswego County"])
        self.assertEqual(next(row for row in wave25["countyChecks"] if row["county"] == "Oswego County")["status"], "official_result_workbook_lead_found_not_loaded_reconciliation_needed")

        blocker_sources = {row["sourceUrl"]: row for row in inventory["officialBlockerEvidence"]}
        self.assertEqual(blocker_sources["https://flateau.elections.ny.gov/"]["observed"], "The VEDA dashboard reported 0 total elections for 2026 and no election data available.")
        self.assertIn("Election Results", blocker_sources["https://flateau.elections.ny.gov/downloads"]["observed"])
        self.assertIn("11/01/2024", blocker_sources["https://elections.ny.gov/enrollment-county"]["observed"])
        self.assertIn("124 county files", blocker_sources["https://elections.ny.gov/enrollment-election-district?f%5B0%5D=filter_term%3A571"]["observed"])

    def test_local_review_csv_does_not_silently_cover_excluded_counties(self):
        rows = list(csv.DictReader(Path("data/ny-2024-local-review.csv").read_text(encoding="utf-8-sig").splitlines()))
        counties = {row["county"] for row in rows}
        missing_counties = set(self.load_json("data/ny-2024-data-coverage-inventory.json")["completionDecision"]["reviewCoverage"]["excludedOrNotYetReviewedCounties"])

        self.assertEqual(len(rows), 10408)
        self.assertTrue(missing_counties.isdisjoint(counties))
        self.assertIn("Monroe County", counties)
        self.assertIn("Suffolk County", counties)
        self.assertIn("Westchester County", counties)


if __name__ == "__main__":
    unittest.main()
