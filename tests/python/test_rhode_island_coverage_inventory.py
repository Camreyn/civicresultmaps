import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config

ROOT = Path(__file__).resolve().parents[2]


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


class RhodeIslandCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = load_json("data/ri-2024-data-coverage-inventory.json")
        with (ROOT / "data/ri-2024-source-request-matrix.tsv").open(encoding="utf-8-sig", newline="") as handle:
            self.request_rows = {row["request_id"]: row for row in csv.DictReader(handle, delimiter="\t")}

    def test_active_ri_config_builds_native_rows_with_eac_turnout(self):
        config = load_config("etl/state-configs/ri.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(artifact["native"]["parser"], "nativeRhodeIslandBoeCsv")
        result_rows = artifact["native"]["resultRows"]
        county_rows = [row for row in result_rows if row["level"] == "county"]
        non_geographic_rows = [row for row in result_rows if row["level"] != "county"]
        self.assertEqual(len(result_rows), 7)
        self.assertEqual(len(county_rows), 5)
        self.assertEqual(len(non_geographic_rows), 2)
        self.assertEqual({row["jurisdictionName"] for row in county_rows}, {
            "Bristol County",
            "Kent County",
            "Newport County",
            "Providence County",
            "Washington County",
        })
        self.assertEqual({row["jurisdictionName"] for row in non_geographic_rows}, {
            "Federal Precincts",
            "Statewide Reconciliation Delta",
        })
        self.assertEqual(sum(row["totalVotes"] for row in county_rows), 511784)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 444)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 80)
        self.assertTrue(artifact["capabilities"]["map"])
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 7)
        self.assertEqual(artifact["native"]["metrics"]["nativeMapResultRows"], 5)
        self.assertEqual(artifact["native"]["metrics"]["nativeNonGeographicResultRows"], 2)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 513386)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 285156)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 214406)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 13824)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 39)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 522164)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 792075)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016])

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["ri-2024-boe-long-format-zip"]["status"], "loaded")
        self.assertEqual(sources["ri-2024-general-president-city-town"]["parser"], "countyPresidentCsv")
        self.assertEqual(sources["ri-2024-general-president-senate-review"]["parser"], "localComparisonCsv")
        self.assertEqual(sources["ri-2024-data-coverage-inventory"]["status"], "candidate")

    def test_inventory_records_loaded_boe_rows_and_remaining_blockers(self):
        self.assertEqual(self.inventory["state"], "RI")
        findings = self.inventory["officialSourceFindings"]
        self.assertIn("loaded", findings["certifiedResults"]["status"])
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["statewidePresidentTotal"], 513386)
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["statewideSenateTotal"], 491948)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["eacFallbackRows"], 39)
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2012, 2016])
        self.assertIn("2020", findings["historicalBaselines"]["blockers"][0])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "request_paths_documented_not_loaded")
        self.assertIn("not findings", self.inventory["remainingRisks"][-1])

    def test_request_matrix_tracks_remaining_ri_work(self):
        self.assertEqual(self.request_rows["ri-2024-certified-results-zip"]["status"], "loaded_with_reconciliation_caveat")
        self.assertEqual(self.request_rows["ri-2024-us-senate-review"]["status"], "loaded_with_zip_delta_caveat")
        self.assertEqual(self.request_rows["ri-2024-state-native-turnout"]["status"], "state_native_source_not_loaded")
        self.assertEqual(self.request_rows["ri-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
