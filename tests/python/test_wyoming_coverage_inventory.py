import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class WyomingCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/wy-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/wy-2024-source-request-matrix.tsv").open("r", encoding="utf-8-sig", newline="") as handle:
            self.request_rows = {row["request_id"]: row for row in csv.DictReader(handle, delimiter="\t")}

    def test_active_wyoming_config_loads_sos_results_review_eac_turnout_and_history(self):
        config = load_config("etl/state-configs/wy.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(artifact["native"]["parser"], "nativeWyomingSosGeneralZip")
        self.assertEqual(len(artifact["native"]["resultRows"]), 23)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 431)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 23)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 69)
        self.assertEqual(metrics["nativeResultTotalVotes"], 269048)
        self.assertEqual(metrics["nativeTrumpVotes"], 192633)
        self.assertEqual(metrics["nativeHarrisVotes"], 69527)
        self.assertEqual(metrics["nativeOtherVotes"], 6888)
        self.assertEqual(metrics["nativeComparisonRows"], 431)
        self.assertEqual(metrics["nativeComparisonContest"], "U.S. Senate")
        self.assertEqual(metrics["nativeReviewPresidentialVotes"], 269048)
        self.assertEqual(metrics["nativeReviewCertifiedVoteGap"], 0)
        self.assertEqual(metrics["nativeZeroPresidentialPrecinctRows"], 5)
        self.assertEqual(metrics["nativeBallotsCast"], 271123)
        self.assertEqual(metrics["nativeRegisteredVoters"], 296960)
        self.assertEqual(metrics["nativeHistoricalRows"], 69)
        self.assertEqual(metrics["nativeHistoricalYears"], [2012, 2016, 2020])

    def test_inventory_records_loaded_results_and_remaining_turnout_caveat(self):
        self.assertEqual(self.inventory["state"], "WY")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-03")
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_sos_zip_loaded")
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["presidentialTotalVotes"], 269048)
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "official_sos_precinct_pbp_us_senate_loaded")
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["loadedReviewRows"], 431)
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["zeroVotePrecinctRowsExcluded"], 5)
        self.assertEqual(findings["stateNativeTurnoutAndDenominator"]["observedOfficialTotals"]["officialMinusEacBallotsCast"], 0)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "county_geometry_loaded_precinct_crosswalk_needed")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_and_request_matrix_mark_wy_loaded_with_turnout_followup(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "WY" and row["scope"] == "statewide")
        native_package = next(row for row in native["states"] if row["state"] == "WY")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "WY" and row["year"] == 2024)

        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertIn("official SOS XLSX ZIP", tier["exportFormats"])
        self.assertIn("WY", native["completedNativeStates"])
        self.assertFalse(any(row["state"] == "WY" for row in native.get("sourceDiscoveryQueue", [])))
        self.assertEqual(native_package["expected"]["localReviewRows"], 431)
        self.assertEqual(native_package["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. Senate")
        self.assertIn("state-native registered-voter denominator", turnout_status["statusNote"])

        self.assertEqual(self.request_rows["wy-2024-certified-results-zip"]["status"], "loaded")
        self.assertEqual(self.request_rows["wy-2024-precinct-review"]["status"], "loaded")
        self.assertEqual(self.request_rows["wy-2024-state-native-registration-denominator"]["status"], "needed_data")
        self.assertEqual(self.request_rows["wy-2024-precinct-geometry"]["status"], "needed_data")


if __name__ == "__main__":
    unittest.main()
