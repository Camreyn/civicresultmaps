import json
import unittest
from pathlib import Path


class NewHampshireCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nh-2024-admin-source-inventory.json").read_text(encoding="utf-8-sig"))

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
        self.assertEqual(unresolved[2020]["status"], "needs_targeted_archive_or_records_request")
        self.assertEqual(unresolved[2012]["status"], "needs_targeted_archive_or_records_request")
        self.assertIn("No historical baseline rows are loaded", historical["caveat"])

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


if __name__ == "__main__":
    unittest.main()
