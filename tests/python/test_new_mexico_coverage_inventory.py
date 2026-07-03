import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewMexicoCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nm-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/nm-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_active_new_mexico_config_loads_official_sos_native_rows(self):
        config = load_config("etl/state-configs/nm.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(artifact["native"]["parser"], "nativeNewMexicoSosMapDataJson")
        self.assertEqual(len(artifact["native"]["resultRows"]), 33)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 2165)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 33)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 66)
        self.assertEqual(metrics["nativeResultTotalVotes"], 923403)
        self.assertEqual(metrics["nativeHarrisVotes"], 478802)
        self.assertEqual(metrics["nativeTrumpVotes"], 423391)
        self.assertEqual(metrics["nativeOtherVotes"], 21210)
        self.assertEqual(metrics["nativePresidentPrecinctKeys"], 2169)
        self.assertEqual(metrics["nativeReviewZeroVoteUnitsSkipped"], 4)
        self.assertEqual(metrics["nativeReviewCertifiedVoteGap"], 7)
        self.assertEqual(metrics["nativeComparisonRows"], 2165)
        self.assertEqual(metrics["nativeComparisonVotes"], 903304)
        self.assertEqual(metrics["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(metrics["nativeBallotsCast"], 927923)
        self.assertEqual(metrics["nativeRegisteredVoters"], 1415984)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["nm-2024-president-county-mapdata"]["status"], "loaded")
        self.assertEqual(sources["nm-2024-senate-precinct-mapdata"]["status"], "loaded")
        self.assertEqual(sources["nm-2024-data-coverage-inventory"]["status"], "candidate")

    def test_inventory_records_loaded_sources_and_remaining_caveats(self):
        self.assertEqual(self.inventory["status"], "official_sos_result_review_api_loaded_with_turnout_caveat")
        self.assertIn("docs/developer/index.md", self.inventory["repoDrift"][0])
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_sos_county_api_loaded")
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["presidentialTotalVotes"], 923403)
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "official_sos_precinct_api_loaded")
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["precinctComparisonRows"], 2165)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["ballotsCastDeltaOfficialMinusEac"], 367)
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2020, 2016])
        self.assertEqual(findings["historicalBaselines"]["status"], "official_2020_2016_sos_county_api_loaded_2012_blocked")
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "request_paths_documented_not_loaded")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][0])

    def test_registries_and_request_matrix_mark_nm_loaded_with_caveats(self):
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native = self.load_json("data/native-import-source-packages.json")
        turnout = self.load_json("data/turnout-source-packages.json")
        admin = self.load_json("data/admin-source-packages.json")

        tier = next(row for row in tiers["states"] if row["state"] == "NM" and row["scope"] == "statewide")
        native_package = next(row for row in native["states"] if row["state"] == "NM")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "NM" and row["year"] == 2024)
        admin_status = next(row for row in admin["stateYearStatuses"] if row["state"] == "NM" and row["electionYear"] == 2024)

        self.assertEqual(tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertEqual(tier["confidence"], "loaded_with_caveats")
        self.assertIn("official SOS mapdata API JSON", tier["exportFormats"])
        self.assertIn("NM", native["completedNativeStates"])
        self.assertFalse(any(row["state"] == "NM" for row in native["sourceDiscoveryQueue"]))
        self.assertEqual(native_package["expected"]["localReviewRows"], 2165)
        self.assertEqual(native_package["artifacts"]["localReviewRows"]["comparisonContest"], "United States Senator")
        self.assertEqual(turnout_status["coverage"]["stateNativeBallotsCastDelta"], 367)
        self.assertEqual(admin_status["audit"]["status"], "candidate")
        self.assertEqual(admin_status["cvr"]["status"], "candidate")
        self.assertEqual(admin_status["incidents"]["status"], "candidate")

        self.assertEqual(self.request_rows["nm-2024-certified-results-export"]["status"], "loaded_from_official_sos_api")
        self.assertEqual(self.request_rows["nm-2024-senate-comparison-export"]["status"], "loaded_same_grain_api_with_caveats")
        self.assertEqual(self.request_rows["nm-2024-turnout-details"]["status"], "state_native_source_lead_not_loaded")
        self.assertEqual(self.request_rows["nm-2024-historical-baselines"]["status"], "partial_2020_2016_loaded_2012_blocked")
        self.assertEqual(self.request_rows["nm-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
