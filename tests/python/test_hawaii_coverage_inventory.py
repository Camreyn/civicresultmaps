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
        self.assertEqual(len(native["resultRows"]), 5)
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
        self.assertEqual(metrics["nativeHawaiiKalawaoPrecinct"], "13-09")
        self.assertEqual(metrics["nativeHawaiiKalawaoPrecinctSplitIds"], ["487", "78"])
        self.assertEqual(metrics["nativeHawaiiKalawaoTotalVotes"], 18)
        self.assertEqual(metrics["nativeHawaiiKalawaoHarrisVotes"], 15)
        self.assertEqual(metrics["nativeHawaiiKalawaoTrumpVotes"], 3)
        self.assertEqual(metrics["nativeHawaiiKalawaoOtherVotes"], 0)

        kalawao = next(row for row in native["resultRows"] if row["jurisdictionName"] == "Kalawao County")
        self.assertEqual(kalawao["jurisdictionCode"], "005")
        self.assertEqual(kalawao["votes"], {"Trump": 3, "Harris": 15, "Other": 0})
        self.assertEqual(kalawao["totalVotes"], 18)
        maui = next(row for row in native["resultRows"] if row["jurisdictionName"] == "Maui County")
        self.assertEqual(maui["votes"], {"Trump": 22618, "Harris": 38890, "Other": 1367})
        self.assertEqual(maui["totalVotes"], 62875)

        kalawao_review = [row for row in native["reviewRows"] if row["county"] == "Kalawao County"]
        self.assertEqual(len(kalawao_review), 2)
        self.assertEqual({row["localUnit"] for row in kalawao_review}, {"13-09 [78]", "13-09 VSC [487]"})
        self.assertEqual(sum(row["totalVotes"] for row in kalawao_review), 18)
        self.assertEqual(sum(row["harris"] for row in kalawao_review), 15)
        self.assertEqual(sum(row["trump"] for row in kalawao_review), 3)

        historical = native["historicalRows"]
        self.assertEqual(len(historical), 10)
        expected_historical = {
            2016: {
                "Hawaii County": ("county:15001", 41259, 17501, 6107, 64867),
                "Honolulu County": ("county:15003", 175696, 90326, 19768, 285790),
                "Kalawao County": ("county:15005", 14, 1, 5, 20),
                "Kauai County": ("county:15007", 16456, 7574, 2305, 26335),
                "Maui County": ("county:15009", 33466, 13445, 5014, 51925),
            },
            2020: {
                "Hawaii County": ("county:15001", 58731, 26897, 2186, 87814),
                "Honolulu County": ("county:15003", 238869, 136259, 6986, 382114),
                "Kalawao County": ("county:15005", 23, 1, 0, 24),
                "Kauai County": ("county:15007", 21225, 11582, 690, 33497),
                "Maui County": ("county:15009", 47282, 22125, 1613, 71020),
            },
        }
        for year, expected_counties in expected_historical.items():
            year_rows = [row for row in historical if row["electionYear"] == year]
            self.assertEqual(len(year_rows), 5)
            for county, (tag, dem, rep, other, total) in expected_counties.items():
                row = next(item for item in year_rows if item["jurisdictionName"] == county)
                self.assertEqual(row["jurisdictionTag"], tag)
                self.assertEqual(
                    (row["demVotes"], row["repVotes"], row["otherVotes"], row["totalVotes"]),
                    (dem, rep, other, total),
                )

        historical_ranges = config.raw["historicalBaselines"]["districtRangesByYear"]
        for year in ("2016", "2020"):
            self.assertEqual(historical_ranges[year]["01-07"], "Hawaii County")
            self.assertEqual(historical_ranges[year]["08-13"], "Maui County except precinct 13-09")
            self.assertEqual(historical_ranges[year]["13-09"], "Kalawao County")
            self.assertEqual(historical_ranges[year]["14-16"], "Kauai County")
            self.assertEqual(historical_ranges[year]["17-51"], "Honolulu County")

        self.assertEqual(sources["hi-2024-general-summary"]["status"], "loaded")
        self.assertEqual(sources["hi-2024-general-precinct-detail"]["status"], "loaded")
        self.assertEqual(sources["hi-2024-general-turnout"]["status"], "loaded")
        self.assertEqual(sources["hi-2024-eac-turnout"]["status"], "candidate")
        self.assertEqual(sources["hi-2024-data-coverage-inventory"]["status"], "candidate")

    def test_hawaii_kalawao_reconciliation_fails_closed(self):
        config = load_config("etl/state-configs/hi.json")
        report = validate_config(config)
        config.raw["certifiedResults"]["kalawaoPrecinct"]["expected"]["total"] = 19

        with self.assertRaisesRegex(ValueError, "Hawaii Kalawao precinct reconciliation failed"):
            build_staging_artifact(config, report)

    def test_hawaii_official_text_exports_have_expected_federal_totals(self):
        summary = self.load_hi_csv("data/hi-2024-general-summary.txt")
        precinct = self.load_hi_csv("data/hi-2024-general-precinct-detail.txt")

        president_summary = [row for row in summary if row["#Contest ID"] == "283"]
        senate_summary = [row for row in summary if row["#Contest ID"] == "100"]
        president_precinct = [row for row in precinct if row["Contest_id"] == "283"]
        senate_precinct = [row for row in precinct if row["Contest_id"] == "100"]
        kalawao_president = [
            row for row in president_precinct if row['#"Precinct_Name"'] == "13-09"
        ]
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
        self.assertEqual({row["precinct_splitId"] for row in kalawao_president}, {"78", "487"})
        self.assertEqual(
            sum(int(row["Mail votes"]) + int(row["In-Person votes"]) for row in kalawao_president),
            18,
        )
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
