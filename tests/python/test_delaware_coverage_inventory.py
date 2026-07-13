import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class DelawareCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/de-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        matrix_text = Path("data/de-2024-source-request-matrix.tsv").read_text(encoding="utf-8-sig")
        lines = matrix_text.strip().splitlines()
        header = lines[0].split("\t")
        self.request_rows = {dict(zip(header, line.split("\t")))["request_id"]: dict(zip(header, line.split("\t"))) for line in lines[1:]}

    def test_active_delaware_config_loads_official_report_review_and_eac_turnout(self):
        config = load_config("etl/state-configs/de.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(len(artifact["native"]["resultRows"]), 3)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 529)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 3)

        metrics = artifact["native"]["metrics"]
        self.assertEqual(metrics["nativeResultTotalVotes"], 511697)
        self.assertEqual(metrics["nativeTrumpVotes"], 214351)
        self.assertEqual(metrics["nativeHarrisVotes"], 289758)
        self.assertEqual(metrics["nativeOtherVotes"], 7588)
        self.assertEqual(metrics["nativeComparisonRows"], 529)
        self.assertEqual(metrics["nativeBallotsCast"], 514367)
        self.assertEqual(metrics["nativeRegisteredVoters"], 788441)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["de-2024-official-results-report"]["status"], "loaded")
        self.assertEqual(sources["de-2024-agp-turnout-reconciliation"]["status"], "candidate")

    def test_inventory_records_loaded_sources_and_turnout_caveats(self):
        self.assertEqual(self.inventory["state"], "DE")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-12")
        self.assertFalse(self.inventory["productionChecked"])
        self.assertFalse(self.inventory["currentEtLStatus"]["turnoutOnly"])
        self.assertEqual(self.inventory["currentEtLStatus"]["expectedRows"]["reviewRows"], 529)

        self.assertEqual(self.inventory["currentEtLStatus"]["expectedRows"]["historicalBaselineRows"], 6)
        findings = self.inventory["officialSourceFindings"]
        self.assertEqual(findings["certifiedResults"]["status"], "official_report_loaded_county_parser_active")
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "official_election_district_senate_review_loaded")
        self.assertEqual(findings["stateNativeTurnout"]["status"], "official_state_native_turnout_lead_reconciled_not_loaded")
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["ageGroupPartyReportRegisteredVoters"], 788864)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["eacFallbackRegisteredVoters"], 788441)
        self.assertEqual(findings["geometryAndCrosswalk"]["status"], "official_election_district_geometry_lead_identified_not_loaded")
        self.assertEqual(findings["historicalBaselines"]["status"], "loaded_official_2016_2020_county_2012_pending")
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2016, 2020])
        self.assertEqual(findings["historicalBaselines"]["targetYears"], [2016, 2020, 2012])
        self.assertIn("not evidence of fraud or misconduct", self.inventory["remainingRisks"][-1])

    def test_registries_request_matrix_and_agp_reconciliation(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))
        turnout = json.loads(Path("data/turnout-source-packages.json").read_text(encoding="utf-8-sig"))
        reconciliation = json.loads(Path("data/de-2024-agp-turnout-reconciliation-summary.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "DE" and row["scope"] == "statewide")
        turnout_status = next(row for row in turnout["stateYearStatuses"] if row["state"] == "DE" and row["year"] == 2024)

        self.assertEqual(tier["tier"], "tier_5_digital_inconsistent")
        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertIn("DE", native["completedNativeStates"])
        self.assertFalse(any(row["state"] == "DE" for row in native["sourceDiscoveryQueue"]))
        native_de = next(row for row in native["states"] if row["state"] == "DE")
        self.assertEqual(native_de["expected"]["localReviewRows"], 529)
        self.assertEqual(native_de["expected"]["historicalBaselineRows"], 6)
        self.assertIn("AGP", turnout_status["nextAction"])

        self.assertEqual(self.request_rows["de-2024-certified-results-export"]["status"], "loaded_native_parser_active")
        self.assertEqual(self.request_rows["de-2024-comparison-results-export"]["status"], "loaded_native_review_active")
        self.assertEqual(self.request_rows["de-2024-turnout-agp-normalizer"]["status"], "reconciled_not_loaded_as_turnout")
        self.assertEqual(self.request_rows["de-2024-historical-baselines"]["status"], "loaded_2016_2020_official_county_2012_pending")
        self.assertEqual(self.request_rows["de-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")

        totals = reconciliation["totals"]
        self.assertEqual(totals["agp_election_district_rows"], 537)
        self.assertEqual(totals["agp_registered_voters"], 788864)
        self.assertEqual(totals["agp_voted"], 518086)
        self.assertEqual(totals["agp_voted_minus_eac_ballots_cast"], 3719)
        self.assertEqual(reconciliation["activeTurnoutDecision"], "keep_eac_fallback_active_pending_agp_semantics_review")


if __name__ == "__main__":
    unittest.main()
