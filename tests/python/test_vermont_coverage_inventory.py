import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class VermontCoverageInventoryTest(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/vt-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/vt-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = list(csv.DictReader(handle, delimiter="\t"))
        self.requests = {row["request_id"]: row for row in self.request_rows}

    def test_active_vermont_config_loads_reconciled_static_json(self):
        config = load_config("etl/state-configs/vt.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]
        metrics = native["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(native["parser"], "nativeVermontStaticElectionJson")
        self.assertEqual(len(native["resultRows"]), 14)
        self.assertEqual(len(native["reviewRows"]), 283)
        self.assertEqual(len(native["turnoutRows"]), 247)
        self.assertTrue(config.raw["capabilities"]["certifiedResults"])
        self.assertTrue(config.raw["capabilities"]["reviewGraphs"])
        self.assertTrue(config.raw["capabilities"]["map"])
        self.assertTrue(config.raw["capabilities"]["turnout"])
        self.assertTrue(config.raw["capabilities"]["historicalBaseline"])
        self.assertEqual(len(native["historicalRows"]), 14)

        self.assertEqual(metrics["nativeHarrisVotes"], 235791)
        self.assertEqual(metrics["nativeTrumpVotes"], 119395)
        self.assertEqual(metrics["nativeOtherVotes"], 14236)
        self.assertEqual(metrics["nativeResultTotalVotes"], 369422)
        self.assertEqual(metrics["nativeCanvassPresidentTotalVotesCounted"], 372885)
        self.assertEqual(metrics["nativeCanvassPresidentBlankVotes"], 3195)
        self.assertEqual(metrics["nativeCanvassPresidentOvervotes"], 268)
        self.assertEqual(metrics["nativeComparisonDemVotes"], 229429)
        self.assertEqual(metrics["nativeComparisonRepVotes"], 116512)
        self.assertEqual(metrics["nativeCanvassSenateTotalVotesCounted"], 372885)
        self.assertEqual(metrics["nativeExcludedStatewideSummaryRows"], 2)
        self.assertEqual(metrics["nativeTurnoutParser"], "eacTurnoutCsv")
        self.assertEqual(metrics["nativeTurnoutWarningRows"], 247)
        self.assertEqual(metrics["nativeHistoricalRows"], 14)
        self.assertEqual(metrics["nativeHistoricalYears"], [2020])
        addison_2020 = next(row for row in native["historicalRows"] if row["jurisdictionName"] == "Addison County")
        self.assertEqual(addison_2020["jurisdictionTag"], "county:50001")
        self.assertEqual(addison_2020["demVotes"], 14967)
        self.assertEqual(addison_2020["repVotes"], 6292)
        self.assertEqual(addison_2020["otherVotes"], 763)

    def test_inventory_records_resolved_result_blocker_and_remaining_turnout_gap(self):
        self.assertEqual(self.inventory["state"], "VT")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-09")
        self.assertFalse(self.inventory["productionChecked"])
        self.assertFalse(self.inventory["currentEtLStatus"]["turnoutOnly"])
        self.assertEqual(self.inventory["currentEtLStatus"]["expectedRows"]["resultRows"], 14)
        self.assertEqual(self.inventory["currentEtLStatus"]["expectedRows"]["reviewRows"], 283)
        self.assertEqual(self.inventory["currentEtLStatus"]["expectedRows"]["historicalBaselineRows"], 14)
        self.assertEqual(self.inventory["repoDrift"], [])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "loaded_reconciled_static_json")
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "loaded_reconciled_static_json")
        self.assertIn("STATE WIDE", findings["sameGrainComparisonContest"]["notes"])
        self.assertEqual(findings["stateNativeTurnout"]["status"], "official_turnout_pdf_and_json_identified_not_loaded")
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialJsonTotals"]["townRows"], 247)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialJsonTotals"]["registeredVoters"], 517051)
        self.assertEqual(findings["stateNativeTurnout"]["observedCanvassRegisteredVoters"], 522600)
        self.assertEqual(findings["stateNativeTurnout"]["activeFallbackTotals"]["ballotsCast"], 361604)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "county_geometry_loaded_town_reporting_geometry_missing")
        self.assertEqual(findings["historicalBaselines"]["status"], "loaded_official_2020_county_aggregate_2016_2012_pending")
        self.assertEqual(findings["historicalBaselines"]["expectedRows"], 14)
        self.assertEqual(findings["historicalBaselines"]["reconciliation"]["candidateVotes"], 367428)
        self.assertIn("county:<GEOID>", findings["historicalBaselines"]["jurisdictionTagMode"])

    def test_registries_mark_vermont_native_results_loaded(self):
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))
        admin = json.loads(Path("data/admin-source-packages.json").read_text(encoding="utf-8-sig"))

        package = next(row for row in native["states"] if row["state"] == "VT")
        tier = next(row for row in tiers["states"] if row["state"] == "VT")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "VT" and row["year"] == 2024)
        admin_status = next(row for row in admin["stateYearStatuses"] if row["state"] == "VT" and row["electionYear"] == 2024)

        self.assertIn("VT", native["completedNativeStates"])
        self.assertFalse(any(row["state"] == "VT" for row in native.get("sourceDiscoveryQueue", [])))
        self.assertEqual(package["nativeReadiness"], "complete_county_map_town_district_review_eac_turnout_2020_historical_context")
        self.assertEqual(package["expected"]["localReviewRows"], 283)
        self.assertEqual(package["expected"]["historicalBaselineRows"], 14)
        self.assertIn("historicalBaseline", package["artifacts"])
        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertIn("official SOS static JSON", tier["exportFormats"])
        self.assertIn("Vermont SOS 2024 General Election Voter Turnout", turnout_status["nextAction"])
        self.assertEqual(admin_status["audit"]["status"], "candidate")
        self.assertEqual(admin_status["incidents"]["requestMatrixArtifact"], "data/vt-2024-source-request-matrix.tsv")

    def test_request_matrix_tracks_resolved_and_remaining_vermont_asks(self):
        self.assertEqual(self.inventory["requestMatrixArtifact"], "data/vt-2024-source-request-matrix.tsv")
        self.assertEqual(len(self.request_rows), 7)
        self.assertEqual(self.requests["vt-2024-certified-president-canvass"]["status"], "loaded_reconciled_static_json")
        self.assertIn("372885", self.requests["vt-2024-certified-president-canvass"]["expected_rows_or_totals"])
        self.assertEqual(self.requests["vt-2024-same-grain-us-senate"]["status"], "loaded_reconciled_static_json")
        self.assertIn("283 town/reporting-district rows", self.requests["vt-2024-same-grain-us-senate"]["expected_rows_or_totals"])
        self.assertEqual(self.requests["vt-2024-state-native-turnout"]["status"], "official_pdf_json_identified_not_loaded")
        self.assertEqual(self.requests["vt-2024-historical-baselines"]["status"], "loaded_2020_official_county_aggregate_2016_2012_pending")
        self.assertIn("county:<GEOID>", self.requests["vt-2024-historical-baselines"]["expected_rows_or_totals"])
        self.assertIn("522600", self.requests["vt-2024-state-native-turnout"]["confidence_notes"])
        self.assertIn("evidence of fraud or misconduct", self.requests["vt-2024-audit-recount-cvr-incident-records"]["caveats"])


if __name__ == "__main__":
    unittest.main()
