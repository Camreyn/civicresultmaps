import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config

ROOT = Path(__file__).resolve().parents[2]


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


class ConnecticutCoverageInventoryTest(unittest.TestCase):
    def test_connecticut_coverage_inventory_documents_official_ems_leads(self):
        inventory = load_json("data/ct-2024-data-coverage-inventory.json")

        self.assertEqual(inventory["state"], "CT")
        self.assertEqual(inventory["reportingGrain"], "town")
        self.assertFalse(inventory["currentConfigStatus"]["turnoutOnly"])
        self.assertEqual(inventory["currentConfigStatus"]["reviewRows"], 169)

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
            findings["electionHistorySourceReview"]["status"],
            "official_result_cross_check_not_turnout_replacement",
        )
        self.assertIn(
            "does not replace EMS EV/VV turnout",
            findings["electionHistorySourceReview"]["blocker"],
        )
        self.assertEqual(
            findings["sameGrainComparisonContest"]["status"],
            "official_town_us_senate_loaded_with_cross_endorsement_caveat",
        )
        self.assertEqual(
            findings["stateNativeTurnout"]["status"],
            "official_town_turnout_loaded_warning_required",
        )
        self.assertEqual(
            findings["precinctWardAvailability"]["status"],
            "precinct_labels_available_vote_rows_not_confirmed",
        )
        self.assertEqual(
            findings["geometryAndCrosswalk"]["status"],
            "town_mcd_geometry_collected_crosswalk_needs_qa",
        )

    def test_connecticut_ems_parser_builds_town_review_and_turnout_rows(self):
        config = load_config("etl/state-configs/ct.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeConnecticutEmsTownJson")
        self.assertEqual(native["metrics"]["nativeResultRows"], 169)
        self.assertEqual(native["metrics"]["nativeResultTotalVotes"], 1759010)
        self.assertEqual(native["metrics"]["nativeHarrisVotes"], 992053)
        self.assertEqual(native["metrics"]["nativeTrumpVotes"], 736918)
        self.assertEqual(native["metrics"]["nativeOtherVotes"], 30039)
        self.assertEqual(native["metrics"]["nativeReviewRows"], 169)
        self.assertEqual(native["metrics"]["nativeComparisonRows"], 169)
        self.assertEqual(native["metrics"]["nativeComparisonDemVotes"], 1000695)
        self.assertEqual(native["metrics"]["nativeComparisonRepVotes"], 678256)
        self.assertEqual(native["metrics"]["nativeTurnoutRows"], 169)
        self.assertEqual(native["metrics"]["nativeBallotsCast"], 1788981)
        self.assertEqual(native["metrics"]["nativeRegisteredVoters"], 2348545)
        self.assertEqual(native["metrics"]["nativeTurnoutWarningRows"], 169)

        andover = next(row for row in native["reviewRows"] if row["localUnit"] == "Andover")
        self.assertEqual(andover["county"], "Tolland County")
        self.assertEqual(andover["harris"], 1032)
        self.assertEqual(andover["trump"], 1035)
        self.assertEqual(andover["comparisonDemVotes"], 1035)
        self.assertEqual(andover["comparisonRepVotes"], 985)
        self.assertEqual(andover["coverageMode"], "presidentVsSenate")

    def test_connecticut_request_matrix_and_registries_are_coherent(self):
        with (ROOT / "data/ct-2024-source-request-matrix.tsv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            rows = list(csv.DictReader(handle, delimiter="\t"))

        self.assertEqual(len(rows), 8)
        by_id = {row["request_id"]: row for row in rows}
        self.assertEqual(
            by_id["ct-ems-town-president-senate"]["status"],
            "official_json_collected_parser_loaded_with_reconciliation_caveat",
        )
        self.assertEqual(
            by_id["ct-sov-certified-pdf-reconciliation"]["status"],
            "certified_pdf_collected_reconciliation_needed",
        )
        self.assertIn("differ", by_id["ct-sov-certified-pdf-reconciliation"]["caveats"].lower())
        self.assertTrue(
            by_id["ct-town-geometry-crosswalk"]["expected_rows_or_totals"].startswith("Raw 174")
        )
        self.assertEqual(
            by_id["ct-election-history-source-review"]["status"],
            "official_result_cross_check_turnout_replacement_excluded",
        )
        self.assertIn(
            "no event 582 registered-voter denominator",
            by_id["ct-election-history-source-review"]["caveats"],
        )

        review = load_json("data/ct-2024-election-history-source-review.json")
        self.assertEqual(review["decision"]["status"], "exclude_as_turnout_replacement")
        self.assertEqual(review["event582PresidentReview"]["townCount"], 169)
        self.assertEqual(review["event582PresidentReview"]["totalVotesCastRow"], 1759010)
        self.assertEqual(review["event582VoterStatisticsReview"]["rows"], 0)
        self.assertEqual(
            review["emsTurnoutComparison"]["electionHistoryPresidentMinusEmsVotersChecked"],
            -29971,
        )

        tiers = load_json("data/source-acquisition-tiers.json")
        ct_tier = next(state for state in tiers["states"] if state["state"] == "CT")
        self.assertEqual(ct_tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertEqual(ct_tier["reportingGrain"], "town")
        self.assertIn("Statement of Vote", ct_tier["caveats"])
        self.assertIn("event 582 voterStats returns zero rows", ct_tier["caveats"])
        self.assertIn("native Connecticut EMS town parser", ct_tier["parserStatus"])
        self.assertIn("report-ct-election-history-source-review", ct_tier["parserStatus"])

        native = load_json("data/native-import-source-packages.json")
        self.assertIn("CT", native["completedNativeStates"])
        self.assertFalse(any(state["state"] == "CT" for state in native["sourceDiscoveryQueue"]))

        config = load_json("etl/state-configs/ct.json")
        self.assertTrue(config["capabilities"]["turnout"])
        self.assertTrue(config["capabilities"]["certifiedResults"])
        self.assertEqual(config["expected"]["reviewRows"], 169)
        self.assertEqual(config["expected"]["sources"], 7)
        self.assertIn("Election History source review", config["turnout"]["notes"])


if __name__ == "__main__":
    unittest.main()
