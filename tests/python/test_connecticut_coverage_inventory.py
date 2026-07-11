import csv
import hashlib
import json
import subprocess
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
        self.assertEqual(inventory["reportingGrain"], "town_source_to_current_planning_region_result_aggregate")
        self.assertFalse(inventory["currentConfigStatus"]["turnoutOnly"])
        self.assertEqual(inventory["currentConfigStatus"]["resultRows"], 9)
        self.assertEqual(inventory["currentConfigStatus"]["reviewRows"], 169)
        self.assertEqual(inventory["currentConfigStatus"]["historicalRows"], 18)

        ems = inventory["emsPublicReporting"]
        self.assertEqual(ems["electionId"], "91")
        self.assertEqual(ems["version"], "80741")
        self.assertEqual(ems["expectedCounts"]["towns"], 169)
        self.assertEqual(ems["expectedCounts"]["pollingPlaces"], 759)
        self.assertEqual(ems["reportingStatistics"]["registeredVotersReported"], 2348545)
        self.assertEqual(ems["reportingStatistics"]["votersCheckedReported"], 1788981)
        self.assertEqual(ems["presidentOffice"]["statewideTotalVotes"], 1759010)
        self.assertEqual(ems["comparisonOffice"]["statewideTotalVotes"], 1708259)
        self.assertIn("265", ems["reconciliationCaveat"])
        self.assertEqual(inventory["statementOfVoteReconciliation"]["status"], "complete_certified_town_rows_active")

        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}
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
            "official_exact_town_to_current_planning_region_crosswalk_loaded",
        )
        self.assertEqual(
            findings["certifiedPresidentResults"]["status"],
            "official_certified_sov_town_rows_loaded_current_planning_region_aggregate_reconciled",
        )
        self.assertEqual(
            findings["historicalBaselines"]["status"],
            "official_2016_2020_loaded_current_planning_region_2012_missing",
        )
        self.assertEqual(findings["historicalBaselines"]["loadedYears"], [2016, 2020])

    def test_connecticut_ems_parser_builds_planning_region_results_and_town_context(self):
        config = load_config("etl/state-configs/ct.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeConnecticutEmsTownJson")
        metrics = native["metrics"]
        self.assertEqual(metrics["nativeResultRows"], 9)
        self.assertEqual(metrics["nativeTownResultRows"], 169)
        self.assertEqual(metrics["nativePlanningRegionCrosswalkRows"], 169)
        self.assertEqual(metrics["nativeResultTotalVotes"], 1759275)
        self.assertEqual(metrics["nativeHarrisVotes"], 992197)
        self.assertEqual(metrics["nativeTrumpVotes"], 737024)
        self.assertEqual(metrics["nativeOtherVotes"], 30054)
        self.assertEqual(metrics["nativeStatementOfVoteTownRows"], 169)
        self.assertEqual(metrics["nativeEmsPresidentTotalVotes"], 1759010)
        self.assertEqual(metrics["nativeStatementOfVoteAdjustmentVotes"], 265)
        self.assertEqual(
            metrics["nativePresidentSourceId"],
            "ct-2024-statement-of-vote-president-town",
        )
        self.assertEqual(
            metrics["nativeComparisonSourceId"],
            "ct-2024-ems-election-91-version-80741",
        )
        self.assertEqual(metrics["nativeReviewRows"], 169)
        self.assertEqual(metrics["nativeComparisonRows"], 169)
        self.assertEqual(metrics["nativeComparisonDemVotes"], 1000695)
        self.assertEqual(metrics["nativeComparisonRepVotes"], 678256)
        self.assertEqual(metrics["nativeTurnoutRows"], 169)
        self.assertEqual(metrics["nativeBallotsCast"], 1788981)
        self.assertEqual(metrics["nativeRegisteredVoters"], 2348545)
        self.assertEqual(metrics["nativeTurnoutWarningRows"], 169)
        self.assertEqual(metrics["nativeHistoricalRows"], 18)
        self.assertEqual(metrics["nativeHistoricalYears"], [2016, 2020])

        expected_tags = {f"county:09{code}" for code in range(110, 200, 10)}
        self.assertEqual({row["jurisdictionTag"] for row in native["resultRows"]}, expected_tags)
        self.assertTrue(all(row["level"] == "county" for row in native["resultRows"]))
        capitol = next(row for row in native["resultRows"] if row["jurisdictionTag"] == "county:09110")
        self.assertEqual(capitol["jurisdictionName"], "Capitol Planning Region")
        self.assertEqual(capitol["votes"], {"Trump": 181083, "Harris": 285161, "Other": 8313})
        self.assertEqual(capitol["totalVotes"], 474557)
        self.assertEqual(capitol["sourceId"], "ct-2024-statement-of-vote-president-town")

        andover = next(row for row in native["reviewRows"] if row["localUnit"] == "Andover")
        self.assertEqual(andover["county"], "Capitol Planning Region")
        self.assertEqual(andover["harris"], 1032)
        self.assertEqual(andover["trump"], 1035)
        self.assertEqual(andover["comparisonDemVotes"], 1035)
        self.assertEqual(andover["comparisonRepVotes"], 985)
        self.assertEqual(andover["coverageMode"], "presidentVsSenate")
        self.assertEqual(andover["sourceId"], "ct-2024-statement-of-vote-president-town")
        self.assertEqual(
            andover["comparisonSourceId"],
            "ct-2024-ems-election-91-version-80741",
        )

        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 3468777)
        capitol_2020 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2020 and row["jurisdictionTag"] == "county:09110"
        )
        self.assertEqual(capitol_2020["jurisdictionName"], "Capitol Planning Region")
        self.assertEqual(capitol_2020["demVotes"], 308252)
        self.assertEqual(capitol_2020["repVotes"], 175869)
        self.assertEqual(capitol_2020["otherVotes"], 8034)
        self.assertEqual(capitol_2020["totalVotes"], 492155)

    def test_connecticut_statement_of_vote_normalizer_is_exact_and_reproducible(self):
        csv_path = ROOT / "data/ct-2024-statement-of-vote-president-town.csv"
        summary_path = ROOT / "data/ct-2024-statement-of-vote-president-reconciliation.json"
        before = hashlib.sha256(csv_path.read_bytes()).hexdigest()

        subprocess.run(
            ["node", "scripts/normalize-ct-2024-statement-of-vote.mjs"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertEqual(hashlib.sha256(csv_path.read_bytes()).hexdigest(), before)
        with csv_path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 169)
        self.assertEqual(len({row["town_id"] for row in rows}), 169)
        self.assertEqual(len({row["town_name"] for row in rows}), 169)
        self.assertEqual(
            {row["jurisdiction_tag"] for row in rows},
            {f"county:09{code}" for code in range(110, 200, 10)},
        )

        ticket_totals = {
            field: sum(int(row[field]) for row in rows)
            for field in [
                "harris_and_walz",
                "trump_and_vance",
                "stein_and_ware",
                "oliver_and_ter_maat",
                "kennedy_jr_and_shanahan",
                "ayyadurai_and_ellis",
                "de_la_cruz_and_garcia",
                "fox_and_mcvay",
                "mcneil_and_mcneil",
                "potus_and_kennedy",
                "sonski_and_onak",
                "west_and_abdullah",
            ]
        }
        self.assertEqual(
            ticket_totals,
            {
                "harris_and_walz": 992197,
                "trump_and_vance": 737024,
                "stein_and_ware": 14286,
                "oliver_and_ter_maat": 6731,
                "kennedy_jr_and_shanahan": 8452,
                "ayyadurai_and_ellis": 21,
                "de_la_cruz_and_garcia": 267,
                "fox_and_mcvay": 4,
                "mcneil_and_mcneil": 0,
                "potus_and_kennedy": 2,
                "sonski_and_onak": 162,
                "west_and_abdullah": 129,
            },
        )
        self.assertEqual(sum(int(row["other_votes"]) for row in rows), 30054)
        self.assertEqual(sum(int(row["total_votes"]) for row in rows), 1759275)

        summary = load_json("data/ct-2024-statement-of-vote-president-reconciliation.json")
        self.assertEqual(
            summary["sourceFiles"]["statementOfVotePdf"]["sha256"],
            "1043dc18895adcff95e227e136eb19ef1c65f2a452a4dc97105fb4738cf3751c",
        )
        self.assertEqual(summary["sourceFiles"]["statementOfVotePdf"]["pages"], 170)
        self.assertEqual(summary["statewideReconciliation"]["difference"]["total"], 265)
        self.assertEqual(summary["townReconciliation"]["changedTownRows"], 4)
        self.assertEqual(
            {row["townName"] for row in summary["townReconciliation"]["differences"]},
            {"Colchester", "Mansfield", "Southbury", "Waterford"},
        )
        self.assertEqual(len(summary["planningRegionReconciliation"]), 9)
        northwest = next(
            row
            for row in summary["planningRegionReconciliation"]
            if row["jurisdictionTag"] == "county:09160"
        )
        self.assertEqual(northwest["sov"], northwest["ems"])
        self.assertEqual(northwest["sov"]["harris"], 31137)
        self.assertEqual(northwest["sov"]["trump"], 31944)
        self.assertTrue(summary["promotionSafety"]["resultRowsReady"])
        self.assertEqual(summary["promotionSafety"]["remainingResultBlockers"], [])

    def test_connecticut_crosswalk_is_exact_and_complete(self):
        with (ROOT / "data/ct-current-planning-region-crosswalk.csv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            rows = list(csv.DictReader(handle))

        self.assertEqual(len(rows), 169)
        self.assertEqual(len({row["ems_town_id"] for row in rows}), 169)
        self.assertTrue(all(row["ems_town_name"] == row["census_basename"] for row in rows))
        self.assertEqual({row["jurisdiction_tag"] for row in rows}, {f"county:09{code}" for code in range(110, 200, 10)})
        region_counts = {}
        for row in rows:
            region_counts[row["planning_region_geoid"]] = region_counts.get(row["planning_region_geoid"], 0) + 1
        self.assertEqual(
            region_counts,
            {"09110": 38, "09120": 6, "09130": 17, "09140": 19, "09150": 16, "09160": 21, "09170": 15, "09180": 19, "09190": 18},
        )

        town_features = [
            feature["properties"]
            for feature in load_json("data/ct-town-mcds.geojson")["features"]
            if str(feature["properties"]["COUSUB"]) != "00000"
        ]
        region_features = {
            feature["properties"]["GEOID"]: feature["properties"]
            for feature in load_json("data/ct-counties.geojson")["features"]
        }
        self.assertEqual(len(town_features), 169)
        self.assertEqual(len(region_features), 9)
        towns_by_basename = {feature["BASENAME"]: feature for feature in town_features}
        self.assertEqual(len(towns_by_basename), 169)

        for row in rows:
            town = towns_by_basename[row["ems_town_name"]]
            self.assertEqual(row["census_town_name"], town["NAME"])
            self.assertEqual(row["census_basename"], town["BASENAME"])
            self.assertEqual(row["census_cousub_geoid"], town["GEOID"])
            self.assertEqual(row["census_cousub_code"], town["COUSUB"])
            self.assertEqual(row["census_county_code"], town["COUNTY"])
            expected_geoid = f"09{town['COUNTY']}"
            self.assertEqual(row["planning_region_geoid"], expected_geoid)
            self.assertEqual(row["planning_region_name"], region_features[expected_geoid]["NAME"])
            self.assertEqual(row["jurisdiction_tag"], f"county:{expected_geoid}")

        summary = load_json("data/ct-historical-presidential-baseline-summary.json")
        by_year = {contest["year"]: contest for contest in summary["contests"]}
        self.assertEqual(by_year[2016]["totals"]["totalVotes"], 1644920)
        self.assertEqual(by_year[2020]["totals"]["totalVotes"], 1823857)
        self.assertEqual(by_year[2024]["totals"]["totalVotes"], 1759010)

    def test_connecticut_request_matrix_and_registries_are_coherent(self):
        with (ROOT / "data/ct-2024-source-request-matrix.tsv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            rows = list(csv.DictReader(handle, delimiter="\t"))

        self.assertEqual(len(rows), 7)
        by_id = {row["request_id"]: row for row in rows}
        self.assertEqual(
            by_id["ct-ems-town-president-senate"]["status"],
            "certified_sov_president_with_ems_senate_loaded",
        )
        self.assertEqual(
            by_id["ct-sov-certified-pdf-reconciliation"]["status"],
            "certified_pdf_reconciled_169_town_rows_loaded",
        )
        self.assertIn("265", by_id["ct-sov-certified-pdf-reconciliation"]["caveats"])
        self.assertEqual(
            by_id["ct-town-geometry-crosswalk"]["status"],
            "official_geometry_crosswalk_loaded",
        )
        self.assertIn("18 tagged historical rows", by_id["ct-historical-2012-2016-2020"]["expected_rows_or_totals"])
        self.assertIn("2012", by_id["ct-historical-2012-2016-2020"]["caveats"])

        tiers = load_json("data/source-acquisition-tiers.json")
        ct_tier = next(state for state in tiers["states"] if state["state"] == "CT")
        self.assertEqual(ct_tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertEqual(ct_tier["reportingGrain"], "certified_sov_current_planning_region_results_with_town_review_turnout")
        self.assertIn("265 more President votes", ct_tier["caveats"])
        self.assertIn("certified SOV town President", ct_tier["parserStatus"])

        native = load_json("data/native-import-source-packages.json")
        self.assertIn("CT", native["completedNativeStates"])
        self.assertFalse(any(state["state"] == "CT" for state in native["sourceDiscoveryQueue"]))

        config = load_json("etl/state-configs/ct.json")
        self.assertTrue(config["capabilities"]["turnout"])
        self.assertTrue(config["capabilities"]["certifiedResults"])
        self.assertTrue(config["capabilities"]["map"])
        self.assertTrue(config["capabilities"]["historicalBaseline"])
        self.assertEqual(config["expected"]["sources"], len(config["sources"]))
        self.assertEqual(config["expected"]["resultRows"], 9)
        self.assertEqual(config["expected"]["reviewRows"], 169)
        self.assertEqual(config["expected"]["historicalBaselineRows"], 18)
        self.assertEqual(
            config["certifiedResults"]["statementOfVoteTownSourceId"],
            "ct-2024-statement-of-vote-president-town",
        )
        self.assertEqual(config["expected"]["stateTotal"], 1759275)


if __name__ == "__main__":
    unittest.main()
