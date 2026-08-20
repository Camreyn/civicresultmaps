import csv
import json
import subprocess
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config

ROOT = Path(__file__).resolve().parents[2]


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


class RhodeIslandCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = load_json("data/ri-2024-data-coverage-inventory.json")
        self.registration_reconciliation = load_json("data/ri-2024-11-sos-datahub-registration-reconciliation.json")
        self.promotion_reconciliation = load_json("data/ri-historical-promotion-reconciliation.json")
        self.source_tier = next(row for row in load_json("data/source-acquisition-tiers.json")["states"] if row["state"] == "RI")
        self.native_package = next(row for row in load_json("data/native-import-source-packages.json")["states"] if row["state"] == "RI")
        self.turnout_package = next(row for row in load_json("data/turnout-source-packages.json")["stateYearStatuses"] if row["state"] == "RI")
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
        self.assertEqual(len(result_rows), 6)
        self.assertEqual(len(county_rows), 5)
        self.assertEqual(len(non_geographic_rows), 1)
        self.assertEqual({row["jurisdictionName"] for row in county_rows}, {
            "Bristol County",
            "Kent County",
            "Newport County",
            "Providence County",
            "Washington County",
        })
        self.assertEqual({row["jurisdictionName"] for row in non_geographic_rows}, {
            "Federal Precincts",
        })
        self.assertEqual(sum(row["totalVotes"] for row in county_rows), 511816)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 444)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 18)
        self.assertTrue(artifact["capabilities"]["map"])
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 6)
        self.assertEqual(artifact["native"]["metrics"]["nativeMapResultRows"], 5)
        self.assertEqual(artifact["native"]["metrics"]["nativeNonGeographicResultRows"], 1)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 513386)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 285156)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 214406)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 13824)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 39)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 522164)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 792075)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        historical_rows = artifact["native"]["historicalRows"]
        self.assertEqual(sum(1 for row in historical_rows if row.get("jurisdictionTag")), 15)
        self.assertEqual(sum(1 for row in historical_rows if row["sourceLevel"] == "federal_precincts"), 3)

        sources = {source["id"]: source for source in artifact["sources"]}
        self.assertEqual(sources["ri-2024-boe-long-format-zip"]["status"], "loaded")
        self.assertEqual(sources["ri-2024-general-president-city-town"]["parser"], "countyPresidentCsv")
        self.assertEqual(sources["ri-2024-general-president-senate-review"]["parser"], "localComparisonCsv")
        self.assertEqual(sources["ri-historical-promotion-reconciliation"]["status"], "loaded")
        self.assertEqual(sources["ri-2024-11-sos-datahub-registration"]["status"], "loaded")
        self.assertEqual(sources["ri-2024-data-coverage-inventory"]["status"], "candidate")

    def test_inventory_records_loaded_boe_rows_and_remaining_blockers(self):
        self.assertEqual(self.inventory["state"], "RI")
        findings = self.inventory["officialSourceFindings"]
        self.assertIn("loaded", findings["certifiedResults"]["status"])
        self.assertEqual(findings["certifiedResults"]["observedOfficialTotals"]["statewidePresidentTotal"], 513386)
        self.assertEqual(findings["sameGrainComparisonContest"]["observedOfficialTotals"]["statewideSenateTotal"], 491948)
        self.assertEqual(findings["stateNativeTurnout"]["observedOfficialTotals"]["eacFallbackRows"], 39)
        self.assertEqual(findings["stateNativeTurnout"]["status"], "eac_fallback_active_sos_registration_denominator_lead_loaded")
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2012, 2016, 2020])
        self.assertEqual(findings["historicalBaselines"]["loadedRows"], 18)
        self.assertIn("Federal Precincts", findings["historicalBaselines"]["notes"])
        self.assertEqual(findings["historicalBaselines"]["blockers"], [])
        self.assertTrue(self.inventory["productionChecked"])
        self.assertEqual(findings["historicalBaselines"]["promotionAcceptance"]["status"], "accepted_for_coordinator_integration")
        self.assertFalse(findings["historicalBaselines"]["promotionAcceptance"]["promotionAuthorized"])
        self.assertEqual(findings["auditRecountCvrIncidentCorrectionLitigation"]["status"], "request_paths_documented_not_loaded")
        self.assertIn("not findings", self.inventory["remainingRisks"][-1])

    def test_sos_data_hub_registration_lead_is_pinned_and_does_not_replace_eac_turnout(self):
        completed = subprocess.run(
            ["node", "scripts/normalize-ri-registration-datahub.mjs", "--check"],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertIn("artifacts are current", completed.stdout)
        summary = self.registration_reconciliation
        self.assertEqual(summary["asOfDate"], "2024-11-01")
        self.assertEqual(summary["rawArtifact"]["bytes"], 813618)
        self.assertEqual(summary["rawArtifact"]["sha256"], "729050b4d504b3ebb01893d2996b80453e33aadef1ef9738de2ee55a789f2cc4")
        self.assertEqual(summary["output"]["rows"], 3838)
        self.assertEqual(summary["output"]["cityTowns"], 39)
        self.assertEqual(summary["output"]["totalsByStatus"], {"Active": 732308, "Inactive": 57201, "Pending": 3360})
        self.assertEqual(summary["output"]["total"], 792869)
        self.assertEqual(summary["eacComparison"]["eacRows"], 39)
        self.assertEqual(summary["eacComparison"]["delta"], 794)
        self.assertIn("does not replace active EAC turnout", summary["semantics"])
        self.assertIn("Rhode Island Department of State", self.inventory["officialSourceFindings"]["stateNativeTurnout"]["sourceAuthority"])
        self.assertIn("Rhode Island Department of State", self.native_package["authority"])
        self.assertIn("city_town_precinct_party_status", self.source_tier["reportingGrain"])
        lead = self.turnout_package["coverage"]["stateNativeLead"]
        self.assertEqual(lead["status"], "loaded_denominator_lead_not_active_turnout")
        self.assertEqual(lead["rows"], 3838)
        self.assertEqual(lead["allStatuses"], 792869)
        self.assertEqual(lead["minusEacRegistered"], 794)

    def test_historical_promotion_reconciliation_is_fail_closed_and_matches_staging(self):
        reconciliation = self.promotion_reconciliation
        self.assertEqual(reconciliation["decision"], "accepted")
        self.assertTrue(reconciliation["promotionSafe"])
        self.assertIn(reconciliation["liveProfile"], {
            "legacy_municipal_2012_2016_county_2020", "canonical_county_all_years",
        })
        self.assertEqual(reconciliation["acceptedReplacement"], {
            "prePromotionLiveProfile": "legacy_municipal_2012_2016_county_2020",
            "prePromotionLiveRows": 86,
            "canonicalStagedRows": 18,
            "acceptedRowReduction": 68,
            "prePromotionRowsByYear": {"2012": 40, "2016": 40, "2020": 6},
            "canonicalRowsByYear": {"2012": 6, "2016": 6, "2020": 6},
        })
        expected_current = (86, 68, 11) if reconciliation["liveProfile"].startswith("legacy_") else (18, 0, 15)
        self.assertEqual(reconciliation["summary"]["liveRows"], expected_current[0])
        self.assertEqual(reconciliation["summary"]["stagedRows"], 18)
        self.assertEqual(reconciliation["summary"]["rowReduction"], expected_current[1])
        self.assertEqual(reconciliation["summary"]["liveTaggedRows"], expected_current[2])
        self.assertEqual(reconciliation["summary"]["stagedTaggedRows"], 15)
        self.assertEqual(reconciliation["summary"]["statewideVoteDeltaAcrossAllYears"], {
            "demVotes": 0, "repVotes": 0, "otherVotes": 0, "totalVotes": 0,
        })
        self.assertEqual(len(reconciliation["displayPathChanges"]["years2012And2016"]["removedMunicipalityDisplayNames"]), 39)
        self.assertIn("promotion reconciliation JSON", self.source_tier["exportFormats"])
        self.assertIn("historicalPromotionReconciliation", self.native_package["artifacts"])
        self.assertIn("accepted_86_live_to_18_staged", self.native_package["validationStatus"]["historicalPromotionAcceptance"])
        self.assertEqual(reconciliation["canonicalFlipImpact"], [
            {"label": "2016-to-2020", "matchedCountyTags": 5, "flips": [
                {"county": "Kent County", "direction": "rep_to_dem", "tag": "county:44003"},
            ]},
            {"label": "2016-to-2024", "matchedCountyTags": 5, "flips": [
                {"county": "Kent County", "direction": "rep_to_dem", "tag": "county:44003"},
            ]},
            {"label": "2020-to-2024", "matchedCountyTags": 5, "flips": []},
        ])

        config = load_config("etl/state-configs/ri.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        historical_rows = artifact["native"]["historicalRows"]
        for year_report in reconciliation["years"]:
            year = year_report["year"]
            rows = [row for row in historical_rows if row["electionYear"] == year]
            self.assertEqual(len(rows), year_report["staged"]["rowCount"])
            self.assertEqual(year_report["difference"]["statewideTotals"], {
                "demVotes": 0, "repVotes": 0, "otherVotes": 0, "totalVotes": 0,
            })
            by_key = {row.get("jurisdictionTag") or "Federal Precincts": row for row in rows}
            for row_report in year_report["canonicalReconciliation"]:
                key = row_report["jurisdictionTag"] or "Federal Precincts"
                staged = by_key[key]
                self.assertEqual(row_report["delta"], {
                    "demVotes": 0, "repVotes": 0, "otherVotes": 0, "totalVotes": 0,
                })
                self.assertEqual(row_report["stagedTotals"], {
                    field: staged[field]
                    for field in ("demVotes", "repVotes", "otherVotes", "totalVotes")
                })

    def test_request_matrix_tracks_remaining_ri_work(self):
        self.assertEqual(self.request_rows["ri-2024-certified-results-zip"]["status"], "loaded_finalized_root_member")
        self.assertEqual(self.request_rows["ri-2024-us-senate-review"]["status"], "loaded_finalized_root_member")
        self.assertEqual(self.request_rows["ri-2024-state-native-turnout"]["status"], "registration_lead_loaded_eac_active")
        self.assertEqual(self.request_rows["ri-2024-admin-audit-cvr-records"]["status"], "needs_records_request_and_scope_review")


if __name__ == "__main__":
    unittest.main()
