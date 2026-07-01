import json
import unittest
from pathlib import Path


class IowaCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8"))

    def test_iowa_config_records_wave9_candidate_source_leads(self):
        config = self.load_json("etl/state-configs/ia.json")
        source_ids = {source["id"] for source in config["sources"]}

        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertIn("ia-2024-clarity-vote-type-method-lead", source_ids)
        self.assertIn("ia-2024-official-precinct-shapefile-lead", source_ids)
        self.assertIn("ia-2024-general-precinct-audit-lead", source_ids)
        self.assertIn("ia-official-historical-canvass-leads", source_ids)

    def test_iowa_coverage_inventory_documents_remaining_official_leads(self):
        inventory = self.load_json("data/ia-2024-data-coverage-inventory.json")
        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}

        self.assertEqual(findings["ballotMethodFields"]["status"], "source_fields_confirmed_not_normalized")
        self.assertIn("candidate-by-method", findings["ballotMethodFields"]["feasibility"])
        self.assertEqual(findings["precinctBoundaryGeometry"]["sourceUrl"], "https://sos.iowa.gov/shapefiles-county-precincts")
        self.assertEqual(findings["postElectionAudit"]["status"], "official_source_identified_not_normalized")
        self.assertIn("officialHistoricalReplacementLeads", findings)
        self.assertTrue(any(artifact["id"] == "ia-2024-equipment-context" for artifact in inventory["loadedArtifacts"]))

    def test_iowa_admin_and_queue_registries_match_inventory_leads(self):
        admin_registry = self.load_json("data/admin-source-packages.json")
        ia_admin = next(
            row
            for row in admin_registry["stateYearStatuses"]
            if row["state"] == "IA" and row["electionYear"] == 2024
        )
        self.assertEqual(ia_admin["audit"]["sourceUrl"], "https://sos.iowa.gov/sites/default/files/2025-02/2024PrecinctAudits.png")
        self.assertEqual(ia_admin["cvr"]["status"], "needs_data")
        self.assertEqual(ia_admin["incidents"]["status"], "candidate")

        tiers = self.load_json("data/source-acquisition-tiers.json")
        ia_tier = next(row for row in tiers["states"] if row["state"] == "IA" and row["scope"] == "statewide")
        self.assertIn("https://sos.iowa.gov/shapefiles-county-precincts", ia_tier["sourceUrls"])
        self.assertIn("official 2024 county precinct-audit source lead", ia_tier["availableFields"])

        native_packages = self.load_json("data/native-import-source-packages.json")
        ia_queue = next(row for row in native_packages["sourceDiscoveryQueue"] if row["state"] == "IA")
        self.assertIn("availableArtifacts", ia_queue)
        self.assertEqual(ia_queue["availableArtifacts"]["auditLead"]["sourceUrl"], "https://sos.iowa.gov/sites/default/files/2025-02/2024PrecinctAudits.png")
        self.assertEqual(ia_queue["availableArtifacts"]["precinctGeometryLead"]["sourceUrl"], "https://sos.iowa.gov/shapefiles-county-precincts")


if __name__ == "__main__":
    unittest.main()
