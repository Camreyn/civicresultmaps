import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class HawaiiCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def load_hi_csv(self, path):
        text = Path(path).read_text(encoding="utf-16")
        lines = text.splitlines(True)
        self.assertEqual(lines[0].strip(), "Format#1")
        return list(csv.DictReader(lines[1:]))

    def test_hawaii_config_loads_official_text_results_and_review_rows(self):
        config = load_config("etl/state-configs/hi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]
        metrics = native["metrics"]
        sources = {source["id"]: source for source in artifact["sources"]}

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(native["parser"], "nativeHawaiiOfficeText")
        self.assertEqual(len(native["resultRows"]), 4)
        self.assertEqual(len(native["reviewRows"]), 467)
        self.assertEqual(len(native["turnoutRows"]), 4)
        self.assertEqual(metrics["nativeTurnoutRows"], 4)
        self.assertEqual(metrics["nativeBallotsCast"], 522236)
        self.assertEqual(metrics["nativeRegisteredVoters"], 860868)
        self.assertEqual(metrics["nativeTurnoutWarningRows"], 0)
        self.assertEqual(metrics["nativeResultTotalVotes"], 516701)
        self.assertEqual(metrics["nativeHarrisVotes"], 313044)
        self.assertEqual(metrics["nativeTrumpVotes"], 193661)
        self.assertEqual(metrics["nativeOtherVotes"], 9996)
        self.assertEqual(metrics["nativeReviewCertifiedVoteGap"], 0)
        self.assertEqual(metrics["nativeReviewPresidentialVotes"], 516701)
        self.assertEqual(metrics["nativeComparisonRows"], 467)
        self.assertEqual(metrics["nativeHawaiiNonGeographicPresidentKeysExcluded"], 3)
        self.assertEqual(metrics["nativeHawaiiNonGeographicSenateKeysExcluded"], 2)
        self.assertEqual(metrics["nativeHawaiiZeroVoteNumberedPresidentKeysSkipped"], 27)
        self.assertEqual(metrics["nativeHawaiiMissingComparisonRows"], 0)
        self.assertEqual(sources["hi-2024-general-summary"]["status"], "loaded")
        self.assertEqual(sources["hi-2024-general-precinct-detail"]["status"], "loaded")
        self.assertEqual(sources["hi-2024-general-turnout"]["status"], "loaded")
        self.assertEqual(sources["hi-2024-eac-turnout"]["status"], "candidate")
        self.assertEqual(sources["hi-2024-data-coverage-inventory"]["status"], "candidate")

    def test_hawaii_official_text_exports_have_expected_federal_totals(self):
        summary = self.load_hi_csv("data/hi-2024-general-summary.txt")
        precinct = self.load_hi_csv("data/hi-2024-general-precinct-detail.txt")

        president_summary = [row for row in summary if row["#Contest ID"] == "283"]
        senate_summary = [row for row in summary if row["#Contest ID"] == "100"]
        president_precinct = [row for row in precinct if row["Contest_id"] == "283"]
        senate_precinct = [row for row in precinct if row["Contest_id"] == "100"]
        numbered_president_ids = {
            row["precinct_splitId"]
            for row in president_precinct
            if row['#"Precinct_Name"'][:2].isdigit()
            and sum(int(candidate["Mail votes"]) + int(candidate["In-Person votes"]) for candidate in president_precinct if candidate["precinct_splitId"] == row["precinct_splitId"]) > 0
        }

        self.assertEqual(sum(int(row["Total Votes"]) for row in president_summary), 516701)
        self.assertEqual(sum(int(row["Total Votes"]) for row in senate_summary), 501763)
        self.assertEqual(int(president_summary[0]["Registered Voters"]), 860868)
        self.assertEqual(len({row["precinct_splitId"] for row in president_precinct}), 497)
        self.assertEqual(len({row["precinct_splitId"] for row in senate_precinct}), 496)
        self.assertEqual(len(numbered_president_ids), 467)
        self.assertEqual(
            sum(
                int(row["Mail votes"]) + int(row["In-Person votes"])
                for row in president_precinct
            ),
            516701,
        )
        self.assertEqual(
            sum(
                int(row["Mail votes"]) + int(row["In-Person votes"])
                for row in senate_precinct
            ),
            501763,
        )

    def test_hawaii_official_turnout_rows_replace_eac_fallback(self):
        turnout_rows = list(csv.DictReader(Path("data/hi-2024-general-turnout.csv").read_text(encoding="utf-8-sig").splitlines()))
        summary = self.load_json("data/hi-2024-turnout-reconciliation-summary.json")

        self.assertEqual(len(turnout_rows), 4)
        self.assertEqual(sum(int(row["registered_voters"]) for row in turnout_rows), 860868)
        self.assertEqual(sum(int(row["ballots_cast"]) for row in turnout_rows), 522236)
        self.assertEqual(summary["officialRows"]["countyRegisteredVoters"], 860868)
        self.assertEqual(summary["officialRows"]["countyBallotsCast"], 522236)
        self.assertEqual(summary["eacBenchmark"]["registeredVotersDeltaOfficialMinusEac"], -465)
        self.assertEqual(summary["eacBenchmark"]["ballotsCastDeltaOfficialMinusEac"], 0)
        self.assertIn("no separate Kalawao row", summary["eacBenchmark"]["kalawaoRowStatus"])

    def test_hawaii_registries_are_aligned_for_loaded_native_coverage(self):
        inventory = self.load_json("data/hi-2024-data-coverage-inventory.json")
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")

        tier = next(
            row
            for row in tiers["states"]
            if row["state"] == "HI" and row["scope"] == "statewide"
        )
        native_hi = next(row for row in native_packages["states"] if row["state"] == "HI")

        self.assertEqual(tier["tier"], "tier_1_official_export_database")
        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertTrue(any("official precinct/split President rows" in value for value in tier["availableFields"]))
        self.assertIn("nativeHawaiiOfficeText", tier["parserStatus"])
        self.assertIn("HI", native_packages["completedNativeStates"])
        self.assertFalse(any(row["state"] == "HI" for row in native_packages.get("sourceDiscoveryQueue", [])))
        self.assertEqual(native_hi["expected"]["localReviewRows"], 467)
        self.assertEqual(
            inventory["sourceFindings"]["sameGrainComparisonContest"]["preferredContest"],
            "U.S. Senate",
        )
        self.assertIn(
            "not claims of fraud or misconduct",
            inventory["displayApiCaveats"]["advisoryUse"],
        )


if __name__ == "__main__":
    unittest.main()
