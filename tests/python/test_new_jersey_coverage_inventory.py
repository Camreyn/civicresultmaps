import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewJerseyCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nj-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        self.turnout_summary = json.loads(Path("data/nj-2024-turnout-reconciliation-summary.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/nj-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_active_new_jersey_config_loads_official_county_pdf_package(self):
        config = load_config("etl/state-configs/nj.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 21)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 21)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 4272725)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 2220713)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1968215)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 83797)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 21)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 4321921)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 6682699)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["nj-2024-general-president-county"]["status"], "loaded")
        self.assertEqual(sources["nj-2024-general-senate-county"]["parser"], "countyComparisonCsv")
        self.assertEqual(sources["nj-2024-official-turnout-county"]["parser"], "normalizedTurnoutCsv")
        self.assertEqual(sources["nj-2024-data-coverage-inventory"]["status"], "candidate")

    def test_inventory_records_official_pdf_package_turnout_delta_and_remaining_gaps(self):
        self.assertEqual(self.inventory["state"], "NJ")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-03")
        self.assertFalse(self.inventory["productionChecked"])

        current = self.inventory["currentEtLStatus"]
        self.assertEqual(current["activeParser"], "countyPresidentCsv+countyComparisonCsv+normalizedTurnoutCsv")
        self.assertEqual(current["expectedRows"]["resultRows"], 21)
        self.assertEqual(current["expectedRows"]["reviewRows"], 21)
        self.assertEqual(current["expectedRows"]["turnoutRows"], 21)

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedPresidentResults"]["status"], "loaded_official_statewide_pdf_county_rows")
        self.assertEqual(findings["certifiedPresidentResults"]["observedOfficialTotals"]["stateTotal"], 4272725)
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "loaded_official_statewide_pdf_county_rows")
        self.assertEqual(findings["sameGrainComparisonContest"]["preferredContest"], "U.S. Senate")
        self.assertEqual(findings["stateNativeTurnout"]["status"], "loaded_official_statewide_pdf_county_rows")
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["stateOfficialBallotsCast"], 4321921)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["officialMinusEacRegisteredVoters"], 52335)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "county_geometry_loaded_municipal_geometry_lead_identified_not_loaded")
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2020, 2016, 2012])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "official_audit_links_and_request_paths_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

        self.assertEqual(self.turnout_summary["officialDoeTotals"]["registeredVoters"], 6682699)
        self.assertEqual(self.turnout_summary["deltasDoeMinusEac"]["registeredVoters"], 52335)
        self.assertEqual(self.turnout_summary["deltasDoeMinusEac"]["ballotsCast"], 0)

    def test_registries_and_request_matrix_track_loaded_county_rows_and_remaining_municipal_work(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "NJ" and row["scope"] == "statewide")
        native_entry = next(row for row in native["states"] if row["state"] == "NJ")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "NJ" and row["year"] == 2024)
        admin_nj = next(row for row in admin["stateYearStatuses"] if row["state"] == "NJ" and row["electionYear"] == 2024)

        self.assertEqual(tier["tier"], "tier_6_official_pdf_hostile")
        self.assertIn("official statewide certified PDF", tier["exportFormats"])
        self.assertIn("NJ", native["completedNativeStates"])
        self.assertEqual(native_entry["expected"]["localReviewRows"], 21)
        self.assertEqual(native_entry["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. Senate")
        self.assertEqual(turnout_status["localFile"], "data/nj-2024-official-turnout-county.csv")
        self.assertEqual(turnout_status["coverage"]["registeredVoters"], 6682699)
        self.assertEqual(admin_nj["audit"]["status"], "candidate")
        self.assertEqual(admin_nj["audit"]["localArtifact"], "data/nj-2024-data-coverage-inventory.json")

        self.assertEqual(self.request_rows["nj-2024-certified-president-pdfs"]["status"], "statewide_pdf_loaded_municipal_parser_needed")
        self.assertEqual(self.request_rows["nj-2024-turnout-pdfs"]["status"], "statewide_pdf_loaded_municipal_turnout_parser_needed")
        self.assertEqual(self.request_rows["nj-2024-admin-cvr-incident-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
