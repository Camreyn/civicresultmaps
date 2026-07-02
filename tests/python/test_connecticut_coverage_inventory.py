import csv
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


class ConnecticutCoverageInventoryTest(unittest.TestCase):
    def test_connecticut_coverage_inventory_documents_official_ems_leads(self):
        inventory = load_json("data/ct-2024-data-coverage-inventory.json")

        self.assertEqual(inventory["state"], "CT")
        self.assertEqual(inventory["reportingGrain"], "town")
        self.assertTrue(inventory["currentConfigStatus"]["turnoutOnly"])
        self.assertEqual(inventory["currentConfigStatus"]["reviewRows"], 0)

        ems = inventory["emsPublicReporting"]
        self.assertEqual(ems["electionId"], "91")
        self.assertEqual(ems["version"], "80741")
        self.assertEqual(ems["expectedCounts"]["towns"], 169)
        self.assertEqual(ems["expectedCounts"]["pollingPlaces"], 759)
        self.assertEqual(ems["reportingStatistics"]["registeredVotersReported"], 2348545)
        self.assertEqual(ems["reportingStatistics"]["votersCheckedReported"], 1788981)
        self.assertEqual(ems["presidentOffice"]["statewideTotalVotes"], 1759010)
        self.assertEqual(ems["comparisonOffice"]["statewideTotalVotes"], 1708259)
        self.assertIn("reconcile", ems["reconciliationCaveat"].lower())

        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}
        self.assertEqual(
            findings["sameGrainComparisonContest"]["status"],
            "official_town_us_senate_available_not_loaded",
        )
        self.assertEqual(
            findings["stateNativeTurnout"]["status"],
            "official_town_turnout_registration_lead_not_loaded",
        )
        self.assertEqual(
            findings["precinctWardAvailability"]["status"],
            "precinct_labels_available_vote_rows_not_confirmed",
        )
        self.assertEqual(
            findings["geometryAndCrosswalk"]["status"],
            "county_geometry_loaded_town_geometry_lead_precinct_geometry_missing",
        )

    def test_connecticut_request_matrix_and_registries_are_coherent(self):
        with (ROOT / "data/ct-2024-source-request-matrix.tsv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            rows = list(csv.DictReader(handle, delimiter="\t"))

        self.assertEqual(len(rows), 7)
        by_id = {row["request_id"]: row for row in rows}
        self.assertEqual(
            by_id["ct-ems-town-president-senate"]["status"],
            "official_json_identified_parser_not_loaded",
        )
        self.assertEqual(
            by_id["ct-sov-certified-pdf-reconciliation"]["status"],
            "certified_pdf_identified_reconciliation_needed",
        )
        self.assertIn("differ", by_id["ct-sov-certified-pdf-reconciliation"]["caveats"].lower())
        self.assertTrue(
            by_id["ct-town-geometry-crosswalk"]["expected_rows_or_totals"].startswith("Expected 169")
        )

        tiers = load_json("data/source-acquisition-tiers.json")
        ct_tier = next(state for state in tiers["states"] if state["state"] == "CT")
        self.assertEqual(ct_tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertEqual(ct_tier["reportingGrain"], "town")
        self.assertIn("Statement of Vote", ct_tier["caveats"])
        self.assertIn("data/ct-2024-data-coverage-inventory.json", ct_tier["parserStatus"])

        native = load_json("data/native-import-source-packages.json")
        self.assertNotIn("CT", native["completedNativeStates"])
        ct_queue = next(state for state in native["sourceDiscoveryQueue"] if state["state"] == "CT")
        self.assertEqual(ct_queue["requestMatrixArtifact"], "data/ct-2024-source-request-matrix.tsv")
        self.assertIn("turnout-only EAC fallback", ct_queue["blocker"])

        config = load_json("etl/state-configs/ct.json")
        self.assertTrue(config["capabilities"]["turnout"])
        self.assertFalse(config["capabilities"]["certifiedResults"])
        self.assertEqual(config["expected"]["reviewRows"], 0)


if __name__ == "__main__":
    unittest.main()