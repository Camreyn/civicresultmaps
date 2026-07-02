import json
import unittest
from pathlib import Path


class NewHampshireCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nh-2024-admin-source-inventory.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/nh-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_loaded_package_counts_and_ballots_cast_caveat_are_preserved(self):
        summary = self.inventory["loadedPackageSummary"]
        expected = summary["expectedRowsOrTotals"]

        self.assertEqual(self.inventory["state"], "NH")
        self.assertEqual(self.inventory["reportingGrain"], "town_ward")
        self.assertEqual(expected["countyResultRows"], 10)
        self.assertEqual(expected["townWardReviewRows"], 304)
        self.assertEqual(expected["townWardTurnoutRows"], 304)
        self.assertEqual(expected["ballotsCastDetailTotal"], 831468)
        self.assertIn("831,467", summary["caveat"])
        self.assertIn("831,468", summary["caveat"])

    def test_historical_inventory_records_only_confirmed_2016_archive_leads(self):
        historical = self.inventory["historicalBaselineFeasibility"]
        lead = historical["availableOfficialArchiveLeads"][0]
        unresolved = {item["year"]: item for item in historical["blockedOrUnresolvedLeads"]}

        self.assertEqual(historical["status"], "candidate_2016_official_archive_lead")
        self.assertEqual(lead["year"], 2016)
        self.assertIn("2016-ge-president-summary-and-belknap.xls", lead["artifactCandidates"])
        self.assertIn("2016-ge-governor.xls", lead["artifactCandidates"])
        self.assertIn("2016-ge-congressional-district-2.xlsx", lead["artifactCandidates"])
        self.assertEqual(len(lead["cdxCaptureEvidence"]), 12)
        self.assertEqual(lead["cdxCaptureEvidence"][0]["timestamp"], "20240720085645")
        self.assertEqual(lead["cdxCaptureEvidence"][0]["mimetype"], "application/vnd.ms-excel")
        self.assertEqual(lead["cdxCaptureEvidence"][-1]["filename"], "2016-ge-congressional-district-2.xlsx")
        self.assertEqual(lead["directDownloadAttempt"]["attemptedArtifacts"], 12)
        self.assertEqual(lead["directDownloadAttempt"]["artifactFilesCreated"], 0)
        self.assertIn("Unable to connect", " ".join(lead["directDownloadAttempt"]["observedErrors"]))
        self.assertEqual(unresolved[2020]["status"], "needs_targeted_archive_or_records_request")
        self.assertEqual(unresolved[2012]["status"], "needs_targeted_archive_or_records_request")
        self.assertIn("No historical baseline rows are loaded", historical["caveat"])
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/nh-2024-source-request-matrix.tsv")
        self.assertIn("nh-2016-historical-workbooks", historical["requestMatrixRows"])

    def test_geometry_admin_and_display_paths_remain_inventory_only(self):
        geometry = self.inventory["geometryAndCrosswalk"]
        recounts = self.inventory["recountsCorrectionsIncidentsLitigation"]
        audit_cvr = self.inventory["auditAndCvr"]
        display = self.inventory["websiteAndApiDisplayPath"]

        self.assertEqual(geometry["status"], "county_geometry_loaded_town_ward_geometry_blocked")
        self.assertIn("city wards unresolved", geometry["caveat"])
        self.assertEqual(recounts["status"], "partial_inventory")
        self.assertGreaterEqual(len(recounts["archivedRecountArtifactsIdentified"]), 7)
        self.assertEqual(audit_cvr["status"], "needs_source_inventory")
        self.assertFalse(display["productionChecked"])

    def test_source_request_matrix_tracks_follow_up_artifacts_without_loading_rows(self):
        self.assertEqual(self.request_rows["nh-2016-historical-workbooks"]["status"], "confirmed_archive_lead_binary_download_blocked")
        self.assertIn("exact timestamps", self.request_rows["nh-2016-historical-workbooks"]["expected_rows_or_totals"])
        self.assertIn("sandbox escalation", self.request_rows["nh-2016-historical-workbooks"]["confidence_notes"])
        self.assertEqual(self.request_rows["nh-2020-historical-request"]["status"], "needs_targeted_archive_or_records_request")
        self.assertEqual(self.request_rows["nh-2012-historical-request"]["status"], "needs_targeted_archive_or_records_request")
        self.assertEqual(self.request_rows["nh-town-ward-geometry"]["reporting_grain"], "town_ward")
        self.assertEqual(self.request_rows["nh-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")
        self.assertIn("not describe", self.request_rows["nh-admin-audit-cvr-records"]["caveats"])


if __name__ == "__main__":
    unittest.main()
