import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NorthDakotaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/nd-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        with Path("data/nd-2024-source-request-matrix.tsv").open("r", encoding="utf-8-sig", newline="") as handle:
            self.request_rows = {row["request_id"]: row for row in csv.DictReader(handle, delimiter="\t")}

    def test_active_north_dakota_config_loads_sos_results_review_and_eac_turnout(self):
        config = load_config("etl/state-configs/nd.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(artifact["native"]["parser"], "nativeCountyPresidentCsv")
        self.assertEqual(len(artifact["native"]["resultRows"]), 53)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 383)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 53)
        self.assertEqual(metrics["nativeResultTotalVotes"], 368155)
        self.assertEqual(metrics["nativeTrumpVotes"], 246505)
        self.assertEqual(metrics["nativeHarrisVotes"], 112327)
        self.assertEqual(metrics["nativeOtherVotes"], 9323)
        self.assertEqual(metrics["nativeComparisonRows"], 383)
        self.assertEqual(metrics["nativeComparisonContest"], "U.S. Senate")
        self.assertEqual(metrics["nativeBallotsCast"], 371974)
        self.assertEqual(metrics["nativeRegisteredVoters"], 0)
        self.assertEqual(metrics["nativeTurnoutWarningRows"], 53)

    def test_inventory_records_loaded_results_and_remaining_turnout_caveat(self):
        self.assertEqual(self.inventory["state"], "ND")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-03")
        self.assertFalse(self.inventory["productionChecked"])

        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_resultsajax_endpoint_loaded")
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["presidentialTotalVotes"], 368155)
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "official_resultsajax_us_senate_precinct_review_loaded")
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["loadedReviewRows"], 383)
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["zeroVotePrecinctKeysExcluded"], 2)
        self.assertEqual(findings["stateNativeTurnoutAndDenominator"]["observedOfficialTotals"]["officialMinusEacBallotsCast"], 1)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "county_geometry_loaded_precinct_crosswalk_needed")
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_and_request_matrix_mark_nd_loaded_with_turnout_followup(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "ND" and row["scope"] == "statewide")
        native_package = next(row for row in native["states"] if row["state"] == "ND")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "ND" and row["year"] == 2024)

        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertIn("official ResultsAjax JSON endpoint", tier["exportFormats"])
        self.assertIn("ND", native["completedNativeStates"])
        self.assertFalse(any(row["state"] == "ND" for row in native["sourceDiscoveryQueue"]))
        self.assertEqual(native_package["expected"]["localReviewRows"], 383)
        self.assertEqual(native_package["artifacts"]["localReviewRows"]["comparisonContest"], "U.S. Senate")
        self.assertIn("eligible-voter denominator lead needs reconciliation", turnout_status["statusNote"])

        self.assertEqual(self.request_rows["nd-2024-certified-results-export"]["status"], "loaded_official_resultsajax_endpoint")
        self.assertEqual(self.request_rows["nd-2024-comparison-results-export"]["status"], "loaded_official_resultsajax_endpoint")
        self.assertEqual(self.request_rows["nd-2024-county-geometry"]["status"], "loaded")
        self.assertEqual(self.request_rows["nd-2024-eligible-voter-turnout"]["status"], "state_native_eligible_voter_lead_not_loaded")


if __name__ == "__main__":
    unittest.main()
