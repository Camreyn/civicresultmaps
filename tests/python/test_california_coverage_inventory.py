import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class CaliforniaCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_california_pipeline_uses_official_sos_turnout_and_history(self):
        config = load_config("etl/state-configs/ca.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeCaliforniaCountyPresidentCsv")
        self.assertEqual(native["metrics"]["nativeResultRows"], 58)
        self.assertEqual(native["metrics"]["nativeReviewRows"], 58)
        self.assertEqual(native["metrics"]["nativeTurnoutRows"], 58)
        self.assertEqual(native["metrics"]["nativeBallotsCast"], 16140044)
        self.assertEqual(native["metrics"]["nativeRegisteredVoters"], 22595659)
        self.assertEqual(native["metrics"]["nativeTurnoutWarningRows"], 0)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 174)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertIn("U.S. Senate full-term", native["metrics"]["nativeReviewWarning"])

        sources = {source["id"]: source for source in artifact["sources"]}
        swdb = sources["ca-2024-swdb-precinct-source-review"]
        self.assertEqual(swdb["status"], "candidate")
        self.assertEqual(swdb["parser"], "scripts/report-ca-swdb-source-review.mjs")
        self.assertTrue(swdb["metadata"]["artifacts"][0]["exists"])

    def test_california_coverage_inventory_and_registries_match(self):
        inventory = self.load_json("data/ca-2024-data-coverage-inventory.json")
        loaded = {artifact["id"]: artifact for artifact in inventory["loadedArtifacts"]}
        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}

        self.assertEqual(loaded["ca-2024-general-voter-participation-sov"]["ballotsCast"], 16140044)
        self.assertEqual(loaded["ca-2024-general-voter-participation-sov"]["registeredVoters"], 22595659)
        self.assertEqual(findings["postElectionAudit"]["status"], "official_source_identified_not_normalized")
        self.assertEqual(findings["votingSystemsByCounty"]["sourceUrl"], "https://elections.cdn.sos.ca.gov/sov/2024-general/sov/13-vot-sys-by-counties.pdf")

        tiers = self.load_json("data/source-acquisition-tiers.json")
        ca_tier = next(row for row in tiers["states"] if row["state"] == "CA" and row["scope"] == "statewide")
        self.assertEqual(ca_tier["tier"], "tier_1_official_export_database")
        self.assertIn("official county voter participation and 15-day registered-voter denominator rows", ca_tier["availableFields"])

        turnout_packages = self.load_json("data/turnout-source-packages.json")
        ca_turnout = next(row for row in turnout_packages["loadedPackages"] if row["state"] == "CA")
        self.assertEqual(ca_turnout["expected"]["turnoutRows"], 58)
        self.assertEqual(ca_turnout["expected"]["ballotsCast"], 16140044)

        native_packages = self.load_json("data/native-import-source-packages.json")
        ca_native = next(row for row in native_packages["states"] if row["state"] == "CA")
        self.assertEqual(ca_native["expected"]["historicalBaselineRows"], 174)
        self.assertEqual(ca_native["artifacts"]["turnout"]["localFile"], "data/ca-2024-voter-participation-stats-by-county.csv")

        admin = self.load_json("data/admin-source-packages.json")
        ca_admin = next(row for row in admin["stateYearStatuses"] if row["state"] == "CA" and row["electionYear"] == 2024)
        self.assertEqual(ca_admin["audit"]["localArtifact"], "data/ca-2024-data-coverage-inventory.json")
        self.assertEqual(ca_admin["incidents"]["sourceUrl"], "https://www.sos.ca.gov/elections/recounts")

    def test_submitted_swdb_source_review_stays_supplemental(self):
        config = self.load_json("etl/state-configs/ca.json")
        sources = {source["id"]: source for source in config["sources"]}
        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertEqual(sources["ca-2024-swdb-precinct-source-review"]["status"], "candidate")
        self.assertIn("supplemental", sources["ca-2024-swdb-precinct-source-review"]["confidence"])

        inventory = self.load_json("data/ca-2024-data-coverage-inventory.json")
        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}
        self.assertEqual(
            findings["submittedSwdbPrecinctSourceReview"]["status"],
            "valid_supplemental_not_authoritative",
        )

        review = self.load_json("data/ca-2024-swdb-source-review.json")
        self.assertEqual(review["decision"]["status"], "valid_supplemental_not_authoritative")
        self.assertEqual(
            review["currentCaliforniaConfigReview"]["certifiedResults"]["sourceId"],
            "ca-2024-general-president-sov",
        )
        self.assertTrue(review["expectedRowsOrTotals"]["swdbRowsNotCollectedInThisReview"])
        self.assertIn("Madera", " ".join(review["sourcePageEvidence"]["dataNotes"]))


if __name__ == "__main__":
    unittest.main()
