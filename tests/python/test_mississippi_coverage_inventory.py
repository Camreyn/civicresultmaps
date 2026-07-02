import csv
import json
import unittest
from pathlib import Path


class MississippiCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/ms-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))
        self.admin = next(entry for entry in admin["stateYearStatuses"] if entry["state"] == "MS")
        with Path("data/ms-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = list(csv.DictReader(handle, delimiter="\t"))
        self.requests = {row["request_id"]: row for row in self.request_rows}

    def test_request_matrix_tracks_remaining_mississippi_asks(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/ms-2024-source-request-matrix.tsv")
        self.assertEqual(self.inventory["requestPath"]["sourceMatrixArtifact"], "data/ms-2024-source-request-matrix.tsv")
        self.assertEqual(len(self.request_rows), 7)
        self.assertEqual(self.requests["ms-precinct-president-senate-ocr-review"]["status"], "partial_review_gated_not_importable")
        self.assertIn("11 import-ready counties", self.requests["ms-precinct-president-senate-ocr-review"]["expected_rows_or_totals"])
        self.assertEqual(self.requests["ms-state-native-ballots-cast-turnout"]["status"], "denominator_lead_collected_ballots_cast_missing")
        self.assertIn("Keep EAC fallback turnout active", self.requests["ms-state-native-ballots-cast-turnout"]["caveats"])

    def test_historical_and_geometry_rows_remain_source_requests_only(self):
        for request_id in [
            "ms-2020-historical-county-president",
            "ms-2016-historical-county-president",
            "ms-2012-historical-county-president",
        ]:
            self.assertEqual(self.requests[request_id]["status"], "official_archive_lead_identified_artifact_not_collected")
            self.assertIn("future Mississippi historical", self.requests[request_id]["parser_or_normalization_path"])

        self.assertEqual(self.requests["ms-precinct-geometry-crosswalk"]["status"], "needs_official_geometry_or_crosswalk")
        self.assertIn("county map joins", self.requests["ms-precinct-geometry-crosswalk"]["caveats"])

    def test_admin_rows_stay_request_provenance_not_findings(self):
        admin_request = self.requests["ms-admin-audit-cvr-incident-records"]
        self.assertEqual(admin_request["status"], "needs_records_request_and_scope_review")
        self.assertIn("proof of fraud or misconduct", admin_request["caveats"])
        self.assertEqual(self.admin["audit"]["status"], "needs_data")
        self.assertIn("ms-2024-source-request-matrix", self.admin["audit"]["why"])
        self.assertEqual(self.admin["cvr"]["status"], "needs_data")
        self.assertEqual(self.admin["incidents"]["status"], "needs_data")


if __name__ == "__main__":
    unittest.main()
