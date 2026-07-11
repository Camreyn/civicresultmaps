import csv
import hashlib
import json
from pathlib import Path
import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class IllinoisHistoricalBaselineTests(unittest.TestCase):
    def setUp(self):
        with Path("data/il-historical-presidential-baseline.csv").open(encoding="utf-8-sig", newline="") as handle:
            self.rows = list(csv.DictReader(handle))

    def test_candidate_totals_by_county_are_complete_and_reconciled(self):
        self.assertEqual(len(self.rows), 204)
        geometry = json.loads(Path("data/il-counties.geojson").read_text(encoding="utf-8"))
        expected_tags = {f"county:{feature['properties']['GEOID']}" for feature in geometry["features"]}
        self.assertEqual(len(expected_tags), 102)

        expected = {
            2016: {"dem": 3090729, "rep": 2146015, "other": 299680, "total": 5536424},
            2020: {"dem": 3471915, "rep": 2446891, "other": 114938, "total": 6033744},
        }
        for year, totals in expected.items():
            rows = [row for row in self.rows if int(row["election_year"]) == year]
            self.assertEqual(len(rows), 102)
            self.assertEqual({row["jurisdiction_tag"] for row in rows}, expected_tags)
            self.assertEqual(len({row["jurisdiction_tag"] for row in rows}), 102)
            self.assertEqual(sum(int(row["dem_votes"]) for row in rows), totals["dem"])
            self.assertEqual(sum(int(row["rep_votes"]) for row in rows), totals["rep"])
            self.assertEqual(sum(int(row["other_votes"]) for row in rows), totals["other"])
            self.assertEqual(sum(int(row["total_votes"]) for row in rows), totals["total"])

        adams_2016 = next(
            row for row in self.rows
            if row["election_year"] == "2016" and row["jurisdiction_name"] == "Adams County"
        )
        self.assertEqual(adams_2016["jurisdiction_tag"], "county:17001")
        self.assertEqual(int(adams_2016["dem_votes"]), 7676)
        self.assertEqual(int(adams_2016["rep_votes"]), 22790)
        self.assertEqual(int(adams_2016["other_votes"]), 1481)

    def test_summary_preserves_discovery_hashes_and_candidate_reconciliation(self):
        summary = json.loads(Path("data/il-historical-presidential-baseline-summary.json").read_text(encoding="utf-8"))
        self.assertEqual(
            summary["discoveryPageUrl"],
            "https://www.elections.il.gov/ElectionOperations/DownloadVoteTotals.aspx",
        )
        self.assertEqual(summary["output"]["rowsPerYear"], {"2016": 102, "2020": 102})
        self.assertEqual(summary["countyReference"]["authority"], "U.S. Census Bureau")
        self.assertEqual(summary["countyReference"]["localFile"], "data/il-counties.geojson")
        self.assertEqual(summary["countyReference"]["featureCount"], 102)
        self.assertEqual(
            summary["countyReference"]["sha256"],
            "d56a4c5aaf531549ad4d346aadc6e345feaa335d2f1342843447d1438db499c8",
        )
        by_year = {source["year"]: source for source in summary["sources"]}
        self.assertEqual(by_year[2016]["sha256"], "b8fb06bb7318581c82f7bb9c0d54763c59554ff5443088eb9b9780573d46d63b")
        self.assertEqual(by_year[2020]["sha256"], "91ac8c0a006b5d723619ee4acaa5ce3e410c16c682aaa037be943344f8de2620")
        self.assertEqual(by_year[2016]["sourceCandidateRows"], 2923)
        self.assertEqual(by_year[2020]["sourceCandidateRows"], 1361)
        for source in by_year.values():
            self.assertEqual(source["sourceCountyCount"], 102)
            self.assertEqual(sum(candidate["votes"] for candidate in source["candidateTotals"]), source["totals"]["total"])

        script = Path("scripts/collect-il-historical-presidential-baseline.mjs").read_text(encoding="utf-8")
        self.assertIn("DownloadVoteTotals.aspx", script)
        self.assertIn("--refresh", script)
        self.assertNotIn("?ID=", script)

    def test_illinois_staging_loads_canonical_historical_rows(self):
        config = load_config("etl/state-configs/il.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 204)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 204)
        self.assertTrue(all(row["jurisdictionTag"].startswith("county:17") for row in native["historicalRows"]))
        self.assertIn("Candidate Totals by County", native["metrics"]["nativeHistoricalWarning"])


    def test_pre_promotion_reconciliation_pins_exact_live_and_staged_rows(self):
        reconciliation = json.loads(
            Path("data/il-historical-promotion-reconciliation.json").read_text(encoding="utf-8")
        )
        self.assertEqual(reconciliation["status"], "accepted_pre_promotion_snapshot")
        self.assertEqual(
            reconciliation["sources"]["liveHistorical"]["url"],
            "https://www.civicresultmaps.org/api/historical-baselines?state=IL&limit=5000",
        )
        self.assertFalse(reconciliation["acceptance"]["promotionAuthorizedByThisArtifact"])

        def tuple_hash(rows, fields):
            tuples = sorted(
                [
                    row[fields[0]],
                    int(row[fields[1]]),
                    int(row[fields[2]]),
                    int(row[fields[3]]),
                    int(row[fields[4]]),
                ]
                for row in rows
            )
            payload = json.dumps(tuples, separators=(",", ":"), ensure_ascii=False).encode()
            return hashlib.sha256(payload).hexdigest()

        live_rows = reconciliation["liveHistorical"]["rows"]
        self.assertEqual(reconciliation["liveHistorical"]["yearCounts"], {"2020": 102})
        self.assertEqual(len(live_rows), 102)
        self.assertEqual(len({row["jurisdictionTag"] for row in live_rows}), 102)
        live_hash = tuple_hash(
            live_rows,
            ["jurisdictionTag", "demVotes", "repVotes", "otherVotes", "totalVotes"],
        )
        self.assertEqual(live_hash, "0b309481c5cdfd626819009e2b73eeda96189abf099a548e08178b1fcc23b3d6")
        self.assertEqual(reconciliation["liveHistorical"]["tupleSha256"], live_hash)

        staged_hashes = {}
        for year in (2016, 2020):
            rows = [row for row in self.rows if row["election_year"] == str(year)]
            staged_hashes[year] = tuple_hash(
                rows,
                ["jurisdiction_tag", "dem_votes", "rep_votes", "other_votes", "total_votes"],
            )
        self.assertEqual(staged_hashes, {
            2016: "77607330cf1cce8285172b71b3e9ec0653170b05feca4c18f49a91c87188b514",
            2020: "66a25f4644b1804e2b3b144f87703259b38af1ca3a082e632732845f926428c2",
        })
        self.assertEqual(reconciliation["stagedHistorical"]["tupleSha256"], {
            "2016": staged_hashes[2016],
            "2020": staged_hashes[2020],
        })

        live_by_tag = {row["jurisdictionTag"]: row for row in live_rows}
        staged_by_tag = {
            row["jurisdiction_tag"]: row
            for row in self.rows
            if row["election_year"] == "2020"
        }
        self.assertEqual(set(live_by_tag), set(staged_by_tag))
        unchanged = []
        different = []
        for tag, live in live_by_tag.items():
            staged = staged_by_tag[tag]
            live_tuple = tuple(live[key] for key in ("demVotes", "repVotes", "otherVotes", "totalVotes"))
            staged_tuple = tuple(int(staged[key]) for key in ("dem_votes", "rep_votes", "other_votes", "total_votes"))
            (unchanged if live_tuple == staged_tuple else different).append(tag)
        self.assertEqual(len(different), 100)
        self.assertEqual(sorted(unchanged), ["county:17001", "county:17069"])
        self.assertEqual(reconciliation["comparison2020"]["fieldChangeCounts"], {
            "dem": 6,
            "rep": 6,
            "other": 100,
            "total": 100,
        })
        self.assertEqual(reconciliation["comparison2020"]["stagedMinusLive"], {
            "dem": 1020260,
            "rep": 227894,
            "other": 9257,
            "total": 1257411,
        })
        self.assertEqual(
            [row["jurisdictionTag"] for row in reconciliation["comparison2020"]["winnerChanges"]],
            ["county:17113", "county:17201"],
        )
        self.assertEqual(reconciliation["comparison2024"]["liveRawRows"], 108)
        self.assertEqual(reconciliation["comparison2024"]["liveAggregatedTags"], 102)
        self.assertEqual(reconciliation["comparison2024"]["stagedRows"], 102)
        self.assertEqual(reconciliation["comparison2024"]["mismatchedVoteTuples"], 0)
        self.assertEqual(
            reconciliation["flipEffects"]["staged2020ToStaged2024"],
            {"redToBlue": 0, "blueToRed": 0, "rows": []},
        )
        self.assertEqual(reconciliation["advisoryIndicatorReview"]["live"]["indicatorRows"], 99)
        self.assertEqual(reconciliation["advisoryIndicatorReview"]["staged"], {
            "reviewRows": 6655,
            "indicatorRows": 90,
            "uniqueFlaggedJurisdictions": 60,
            "flaggedAreas": 60,
            "byType": {"vote_share_pattern": 57, "average_down_ballot_difference": 33},
        })


if __name__ == "__main__":
    unittest.main()
