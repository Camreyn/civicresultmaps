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
        self.assertIn("ia-2024-turnout-vote-method-source-review", source_ids)
        source_review = next(source for source in config["sources"] if source["id"] == "ia-2024-turnout-vote-method-source-review")
        self.assertEqual(source_review["status"], "documented_exclusion")
        self.assertIn("candidate contest-vote method splits", source_review["confidence"])
        self.assertIn("ia-2024-official-precinct-shapefile-lead", source_ids)
        self.assertIn("ia-four-election-precinct-gis-reviewed-evidence", source_ids)
        self.assertIn("ia-2024-general-precinct-audit-lead", source_ids)
        self.assertIn("ia-official-historical-canvass-leads", source_ids)

        precinct_gis = next(
            source
            for source in config["sources"]
            if source["id"] == "ia-four-election-precinct-gis-reviewed-evidence"
        )
        self.assertEqual(precinct_gis["localFile"], "data/precinct-geometry/IA")
        self.assertIn("2012 remains blocked", precinct_gis["confidence"])

    def test_iowa_coverage_inventory_documents_remaining_official_leads(self):
        inventory = self.load_json("data/ia-2024-data-coverage-inventory.json")
        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}

        self.assertEqual(findings["ballotMethodFields"]["status"], "source_fields_confirmed_documented_exclusion")
        self.assertIn("candidate-by-method", findings["ballotMethodFields"]["feasibility"])
        self.assertIn("ia-2024-turnout-vote-method-source-review.json", findings["ballotMethodFields"]["localArtifactPath"])
        review_artifact = next(artifact for artifact in inventory["loadedArtifacts"] if artifact["id"] == "ia-2024-turnout-vote-method-source-review")
        self.assertEqual(review_artifact["expectedRowsOrTotals"]["activeTurnoutRows"], 1651)
        self.assertEqual(review_artifact["expectedRowsOrTotals"]["presidentCandidateVotesMinusTurnoutBallotsCast"], -8562)
        self.assertEqual(findings["precinctBoundaryGeometry"]["sourceUrl"], "https://sos.iowa.gov/shapefiles-county-precincts")
        self.assertEqual(findings["postElectionAudit"]["status"], "official_source_identified_not_normalized")
        self.assertIn("officialHistoricalReplacementLeads", findings)
        self.assertTrue(any(artifact["id"] == "ia-2024-equipment-context" for artifact in inventory["loadedArtifacts"]))

    def test_iowa_turnout_vote_method_review_keeps_current_turnout_active(self):
        report = self.load_json("data/ia-2024-turnout-vote-method-source-review.json")

        self.assertEqual(report["decision"], "keep_current_clarity_turnout_and_do_not_load_vote_method_rows")
        self.assertTrue(report["activeTurnoutMatchesConfig"])
        self.assertEqual(report["activeTurnout"], {"rows": 1651, "ballotsCast": 1672068, "registeredVoters": 1893715})
        self.assertEqual(report["officialClarityPresidentVoteTypeReview"]["presidentCandidateVotes"], 1663506)
        self.assertEqual(report["officialClarityPresidentVoteTypeReview"]["voteTypeTotals"], {"Election Day": 987176, "Absentee": 676330})
        self.assertTrue(report["officialClarityPresidentVoteTypeReview"]["voteTypeTotalsMatchCandidateVotes"])
        self.assertEqual(report["officialClarityPresidentVoteTypeReview"]["mismatchedChoiceRows"], [])
        self.assertEqual(report["officialClarityPresidentVoteTypeReview"]["deltaPresidentCandidateVotesVsActiveTurnoutBallotsCast"], -8562)
        self.assertEqual(report["enrCountySelectionRequirement"]["countyReports"], 99)
        self.assertIn("/Adair/122323/354568/reports/detailxml.zip", report["enrCountySelectionRequirement"]["sampleSourceUrl"])
        self.assertFalse(report["publicVoteMethodContract"]["iowaEacVoteMethodFileExists"])
        self.assertIn("candidate-by-method", report["publicVoteMethodContract"]["contractCaveat"])

    def test_iowa_2012_precinct_geometry_remains_explicitly_blocked(self):
        inventory = self.load_json("data/precinct-geometry-coverage-inventory-2012.json")
        iowa = next(row for row in inventory["states"] if row["state"] == "IA")

        self.assertEqual(iowa["disposition"], "blocked")
        self.assertEqual(iowa["geometry"]["featureCount"], 0)
        self.assertEqual(iowa["geometry"]["publicEligibleManifestCount"], 0)
        self.assertEqual(iowa["crosswalk"]["colorableResultUnits"], 1686)
        self.assertEqual(iowa["crosswalk"]["matchedResultUnits"], 0)
        self.assertEqual(iowa["crosswalk"]["nonGeographicResultUnits"], 1)
        self.assertIn("GitHub issue #223", iowa["nextAction"])

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
        self.assertEqual(ia_queue["availableArtifacts"]["precinctGeometryLead"]["localFile"], "data/precinct-geometry/IA")
        self.assertIn("4,994 reviewed one-to-one", ia_queue["parserNeeded"])
        self.assertIn("Iowa 2012", ia_queue["blocker"])


if __name__ == "__main__":
    unittest.main()
