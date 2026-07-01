import json
import unittest
from pathlib import Path


class IndianaCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/in-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))
        self.admin = next(entry for entry in admin["stateYearStatuses"] if entry["state"] == "IN")

    def test_loaded_artifacts_keep_official_and_supplemental_sources_distinct(self):
        artifacts = {entry["id"]: entry for entry in self.inventory["loadedArtifacts"]}
        self.assertEqual(artifacts["in-2024-official-enr-president"]["reportingGrain"], "county")
        self.assertEqual(artifacts["in-2024-general-turnout"]["expectedCounts"]["rows"], 92)
        self.assertEqual(artifacts["in-2024-mit-precinct-president-senate"]["confidence"], "loaded_secondary_supplemental")
        self.assertIn("Certified county map/result totals", " ".join(artifacts["in-2024-official-enr-president"]["caveats"]))
        self.assertIn("supplemental", " ".join(artifacts["in-2024-mit-precinct-president-senate"]["caveats"]).lower())

    def test_2012_historical_gap_is_official_endpoint_not_loaded_rows(self):
        lead = next(entry for entry in self.inventory["historicalBaselineSourceLeads"] if entry["year"] == 2012)
        self.assertEqual(lead["status"], "official_endpoint_identified_not_script_replayable")
        self.assertIn("ENRHistorical", lead["sourceUrl"])
        gap = next(entry for entry in self.inventory["gaps"] if entry["artifact"] == "2012_historical_presidential_baseline")
        self.assertEqual(gap["status"], "official_endpoint_identified_not_script_replayable")
        self.assertIn("stable official export", gap["remainingRisk"])

    def test_admin_source_paths_are_documented_but_not_normalized(self):
        self.assertEqual(self.admin["status"], "partial")
        self.assertEqual(self.admin["audit"]["status"], "candidate")
        self.assertIn("vstop-post-election-risk-limiting-audit-reports", self.admin["audit"]["sourceUrl"])
        self.assertEqual(self.admin["cvr"]["status"], "needs_data")
        self.assertEqual(self.admin["incidents"]["status"], "candidate")
        self.assertIn("indiana-recount-commission", self.admin["incidents"]["sourceUrl"])


if __name__ == "__main__":
    unittest.main()
