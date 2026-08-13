import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config

ROOT = Path(__file__).resolve().parents[2]


def load_json(relative_path: str):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


class MaineCoverageInventoryTest(unittest.TestCase):
    def test_maine_config_loads_native_president_senate_rows_with_caveats(self):
        config = load_config(ROOT / "etl/state-configs/me.json")
        report = validate_config(config)
        self.assertTrue(report.passed, report.errors)

        artifact = build_staging_artifact(config, report)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.raw["expected"]["sources"], len(config.sources))
        self.assertEqual(artifact["native"]["parser"], "nativeMaineSosCountyTownXlsx")
        self.assertEqual(len(artifact["native"]["resultRows"]), 17)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 512)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 497)
        self.assertEqual(len(artifact["native"].get("historicalRows", [])), 34)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 509)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewCertifiedVoteGap"], 6569)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 497)
        self.assertIn("State UOCAVA", {row["jurisdictionName"] for row in artifact["native"]["resultRows"]})

        vote_share_only = {(row["county"], row["localUnit"]) for row in artifact["native"]["reviewRows"] if row["coverageMode"] == "voteShareOnly"}
        self.assertEqual(vote_share_only, {
            ("Penobscot County", "Medway/Twps"),
            ("Washington County", "Day Block Twp"),
            ("Washington County", "Wesley"),
        })

        coverage_sources = [source for source in config.raw["sources"] if source["id"] == "me-2024-data-coverage-inventory"]
        self.assertTrue(coverage_sources)
        self.assertEqual(coverage_sources[0]["status"], "candidate")
        self.assertEqual(coverage_sources[0]["localFile"], "data/me-2024-data-coverage-inventory.json")

    def test_maine_coverage_inventory_documents_official_source_leads_and_caveats(self):
        inventory = load_json("data/me-2024-data-coverage-inventory.json")

        self.assertEqual(inventory["state"], "ME")
        self.assertEqual(inventory["checkedAt"], "2026-08-13")
        self.assertIs(inventory["productionChecked"], False)
        self.assertEqual(inventory["repoDrift"][0]["path"], "docs/developer/index.md")
        self.assertEqual(inventory["officialSourceFindings"]["certifiedResults"]["status"], "official_excel_loaded")
        self.assertEqual(inventory["officialSourceFindings"]["sameGrainComparisonContest"]["preferredContest"], "U.S. Senate")
        self.assertEqual(inventory["officialSourceFindings"]["rankedChoiceAndCastVoteRecords"]["status"], "official_cd2_rcv_cvr_leads_identified_not_loaded")
        self.assertEqual(inventory["officialSourceFindings"]["stateNativeTurnout"]["status"], "official_registration_denominator_artifacts_collected_not_loaded")
        self.assertEqual(inventory["officialSourceFindings"]["auditRecountCvrIncidentCorrectionLitigation"]["status"], "source_paths_documented_rows_not_loaded")
        self.assertEqual(inventory["officialSourceFindings"]["historicalBaselines"]["status"], "official_2016_2020_loaded_2012_xls_parsed_for_gis_only")
        self.assertEqual(inventory["sourceAcquisitionDecision"]["tier"], "tier_1_official_export_database")
        self.assertTrue(any("not evidence of fraud or misconduct" in risk for risk in inventory["remainingRisks"]))

    def test_maine_registry_entries_point_to_inventory_and_discovery_queue(self):
        source_tiers = load_json("data/source-acquisition-tiers.json")
        me_tier = next(row for row in source_tiers["states"] if row["state"] == "ME")
        self.assertEqual(me_tier["tier"], "tier_1_official_export_database")
        self.assertIn("official Excel workbooks", me_tier["exportFormats"])
        self.assertIn("nativeMaineSosCountyTownXlsx", me_tier["parserStatus"])

        native_packages = load_json("data/native-import-source-packages.json")
        self.assertIn("ME", native_packages["completedNativeStates"])
        self.assertNotIn("ME", {row["state"] for row in native_packages["sourceDiscoveryQueue"]})
        me_package = next(row for row in native_packages["states"] if row["state"] == "ME")
        self.assertEqual(me_package["expected"]["localReviewRows"], 512)
        self.assertEqual(me_package["expected"]["comparisonRows"], 509)
        self.assertEqual(me_package["artifacts"]["localReportingGeometry"]["level"], "local_reporting_unit")

        for year, filename, features, public_eligible in [
            (2012, "data/precinct-geometry-coverage-inventory-2012.json", 507, 0),
            (2016, "data/precinct-geometry-coverage-inventory-2016.json", 532, 0),
            (2020, "data/precinct-geometry-coverage-inventory-2020.json", 516, 0),
            (2024, "data/precinct-geometry-coverage-inventory.json", 494, 0),
        ]:
            coverage = load_json(filename)
            maine = next(row for row in coverage["states"] if row["state"] == "ME")
            self.assertEqual(maine["electionId"][:4], str(year))
            self.assertEqual(maine["geometry"]["levels"], ["local_reporting_unit"])
            self.assertEqual(maine["geometry"]["featureCount"], features)
            self.assertEqual(maine["geometry"]["publicEligibleManifestCount"], public_eligible)

        turnout_packages = load_json("data/turnout-source-packages.json")
        me_turnout = next(row for row in turnout_packages["stateYearStatuses"] if row["state"] == "ME")
        self.assertEqual(me_turnout["status"], "loaded")
        self.assertEqual(me_turnout["expectedTurnoutRows"], 497)
        self.assertIn("data/me-2024-data-coverage-inventory.json", me_turnout["nextAction"])
        self.assertEqual(me_turnout["stateNativeLeads"][0]["artifactStatus"], "collected_denominator_leads_not_loaded")

        admin_packages = load_json("data/admin-source-packages.json")
        me_admin = next(row for row in admin_packages["stateYearStatuses"] if row["state"] == "ME")
        self.assertEqual(me_admin["audit"]["sourceInventory"], "data/me-2024-data-coverage-inventory.json")
        self.assertEqual(me_admin["cvr"]["requestMatrixArtifact"], "data/me-2024-source-request-matrix.tsv")

    def test_maine_request_matrix_is_tab_delimited_with_required_artifacts(self):
        matrix_path = ROOT / "data/me-2024-source-request-matrix.tsv"
        with matrix_path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle, delimiter="\t"))

        request_ids = {row["request_id"] for row in rows}
        self.assertTrue({
            "me-2024-president-senate-municipal-excel",
            "me-2024-state-native-registration-denominator",
            "me-historical-2012-2016-2020-official-baselines",
            "me-2024-admin-audit-cvr-recount-records",
        }.issubset(request_ids))
        self.assertTrue(all(row["source_authority"] for row in rows))
        self.assertTrue(all(row["parser_or_normalization_path"] for row in rows))


if __name__ == "__main__":
    unittest.main()
