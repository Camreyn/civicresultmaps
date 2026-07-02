import csv
import json
import unittest
from pathlib import Path


class HawaiiCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def load_hi_csv(self, path):
        text = Path(path).read_text(encoding="utf-16")
        lines = text.splitlines(True)
        self.assertEqual(lines[0].strip(), "Format#1")
        return list(csv.DictReader(lines[1:]))

    def test_hawaii_config_tracks_candidate_official_sources_without_enabling_review(self):
        config = self.load_json("etl/state-configs/hi.json")
        sources = {source["id"]: source for source in config["sources"]}

        self.assertTrue(config["turnoutOnly"])
        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertEqual(config["expected"]["resultRows"], 0)
        self.assertEqual(config["expected"]["reviewRows"], 0)
        self.assertEqual(config["expected"]["turnoutRows"], 5)
        self.assertEqual(sources["hi-2024-general-summary"]["status"], "candidate")
        self.assertEqual(
            sources["hi-2024-general-precinct-detail"]["authority"],
            "Hawaii Office of Elections",
        )
        self.assertEqual(
            sources["hi-2024-data-coverage-inventory"]["localFile"],
            "data/hi-2024-data-coverage-inventory.json",
        )

    def test_hawaii_official_text_exports_have_expected_federal_totals(self):
        summary = self.load_hi_csv("data/hi-2024-general-summary.txt")
        precinct = self.load_hi_csv("data/hi-2024-general-precinct-detail.txt")

        president_summary = [row for row in summary if row["#Contest ID"] == "283"]
        senate_summary = [row for row in summary if row["#Contest ID"] == "100"]
        president_precinct = [row for row in precinct if row["Contest_id"] == "283"]
        senate_precinct = [row for row in precinct if row["Contest_id"] == "100"]

        self.assertEqual(sum(int(row["Total Votes"]) for row in president_summary), 516701)
        self.assertEqual(sum(int(row["Total Votes"]) for row in senate_summary), 501763)
        self.assertEqual(int(president_summary[0]["Registered Voters"]), 860868)
        self.assertEqual(len({row["precinct_splitId"] for row in president_precinct}), 497)
        self.assertEqual(len({row["precinct_splitId"] for row in senate_precinct}), 496)
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

    def test_hawaii_registries_are_aligned_for_source_discovery(self):
        inventory = self.load_json("data/hi-2024-data-coverage-inventory.json")
        tiers = self.load_json("data/source-acquisition-tiers.json")
        native_packages = self.load_json("data/native-import-source-packages.json")

        tier = next(
            row
            for row in tiers["states"]
            if row["state"] == "HI" and row["scope"] == "statewide"
        )
        queue_entry = next(
            row for row in native_packages["sourceDiscoveryQueue"] if row["state"] == "HI"
        )

        self.assertEqual(tier["tier"], "tier_1_official_export_database")
        self.assertIn("official precinct/split President rows", tier["availableFields"])
        self.assertIn("data/hi-2024-data-coverage-inventory.json", tier["parserStatus"])
        self.assertNotIn("HI", native_packages["completedNativeStates"])
        self.assertIn(
            "official_machine_readable_collected_not_loaded",
            queue_entry["currentStatus"],
        )
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

