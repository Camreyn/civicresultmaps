import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthDakotaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/sd-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        self.evidence = json.loads(Path("data/sd-2024-official-results-archive-evidence.json").read_text(encoding="utf-8-sig"))
        with Path("data/sd-2024-source-request-matrix.tsv").open("r", encoding="utf-8-sig", newline="") as handle:
            self.request_rows = {row["requestId"]: row for row in csv.DictReader(handle, delimiter="\t")}

    def test_active_south_dakota_config_loads_caveated_county_staging_rows(self):
        config = load_config("etl/state-configs/sd.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        metrics = artifact["native"]["metrics"]

        self.assertTrue(report.passed)
        self.assertFalse(config.raw.get("turnoutOnly", False))
        self.assertEqual(artifact["native"]["parser"], "nativeCountyPresidentCsv")
        self.assertEqual(len(artifact["native"]["resultRows"]), 66)
        self.assertEqual(len(artifact["native"]["reviewRows"]), 66)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 66)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 198)
        self.assertEqual(metrics["nativeResultTotalVotes"], 428922)
        self.assertEqual(metrics["nativeTrumpVotes"], 272081)
        self.assertEqual(metrics["nativeHarrisVotes"], 146859)
        self.assertEqual(metrics["nativeOtherVotes"], 9982)
        self.assertEqual(metrics["nativeComparisonRows"], 66)
        self.assertEqual(metrics["nativeComparisonContest"], "United States Representative")
        self.assertEqual(metrics["nativeBallotsCast"], 435739)
        self.assertEqual(metrics["nativeRegisteredVoters"], 690306)

    def test_inventory_records_official_archive_lead_and_remaining_blocker(self):
        self.assertEqual(self.inventory["state"], "SD")
        self.assertEqual(self.inventory["checkedAt"], "2026-07-03")
        self.assertEqual(self.inventory["currentConfigStatus"]["completionDecision"], "remain_in_source_discovery_queue")
        self.assertEqual(self.inventory["currentConfigStatus"]["resultRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["reviewRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["turnoutRows"], 66)

        artifact_ids = {artifact["id"] for artifact in self.inventory["loadedArtifacts"]}
        self.assertIn("sd-2024-official-results-archive-evidence", artifact_ids)
        self.assertIn("ElectionID 684", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("reconcil", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("2026 Primary Election", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertEqual(self.inventory["officialSourceProbe"]["archiveProbe"]["checkedAt"], "2026-07-03")
        self.assertIn("ElectionID 684", self.inventory["officialSourceProbe"]["archiveProbe"]["result"])
        self.assertIn("do not reconcile", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertIn("secondary staging coverage", " ".join(self.inventory["displayCaveats"]))
        self.assertIn("not precinct-level scatter plots", " ".join(self.inventory["displayCaveats"]))

    def test_official_archive_evidence_retains_ids_counts_and_reconciliation_caveat(self):
        self.assertEqual(self.evidence["sourceAuthority"], "South Dakota Secretary of State")
        self.assertEqual(self.evidence["archiveEvidence"]["electionID"], 684)
        self.assertEqual(self.evidence["archiveEvidence"]["candidateListRaceIDs"]["presidentialElectors"], 19833)
        self.assertEqual(self.evidence["archiveEvidence"]["candidateListRaceIDs"]["usRepresentative"], 19835)
        self.assertEqual(self.evidence["archiveEvidence"]["mapDataRaceIDs"]["presidentialElectors"], [12665])
        self.assertEqual(self.evidence["archiveEvidence"]["mapDataRaceIDs"]["usRepresentative"], [11954])

        president = self.evidence["officialArchiveSummaries"]["presidentialElectors"]
        house = self.evidence["officialArchiveSummaries"]["usRepresentative"]
        turnout = self.evidence["officialArchiveSummaries"]["turnoutLead"]
        self.assertEqual(president["rowCount"], 264)
        self.assertEqual(president["countyCount"], 66)
        self.assertEqual(president["totalVotes"], 428728)
        self.assertEqual(house["rowCount"], 132)
        self.assertEqual(house["countyCount"], 66)
        self.assertEqual(house["totalVotes"], 421264)
        self.assertEqual(turnout["rowCount"], 66)
        self.assertEqual(turnout["ballotsCast"], 436478)
        self.assertEqual(turnout["registeredVoters"], 625192)
        self.assertEqual(self.evidence["reconciliation"]["presidentialCertifiedMinusArchive"], 194)
        self.assertEqual(self.evidence["reconciliation"]["usHouseCertifiedMinusArchive"], 184)
        self.assertIn("does_not_reconcile", self.evidence["reconciliation"]["status"])

    def test_registries_keep_sd_in_source_discovery_until_certified_artifact_is_retained(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "SD" and row["scope"] == "statewide")
        discovery = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "SD")

        self.assertEqual(tier["confidence"], "partial_secondary_staging")
        self.assertIn("ElectionID 684", tier["parserStatus"])
        self.assertNotIn("SD", native["completedNativeStates"])
        self.assertEqual(discovery["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertIn("officialArchiveEvidence", discovery["availableArtifacts"])
        self.assertEqual(discovery["expected"]["localReviewRows"], 66)
        self.assertEqual(self.request_rows["sd-official-2024-canvass"]["priority"], "P0")
        self.assertIn("official 2024 General Election Canvass", self.request_rows["sd-official-2024-canvass"]["sourceNeed"])
        self.assertIn("ElectionID 684", self.request_rows["sd-official-2024-canvass"]["neededArtifact"])
        self.assertIn("RaceIDs 12665/11954", self.request_rows["sd-official-2024-canvass"]["caveat"])
        self.assertEqual(self.request_rows["sd-state-native-turnout"]["priority"], "P1")
        self.assertIn("GetVoterTurnoutArchive", self.request_rows["sd-state-native-turnout"]["knownUrlOrLead"])


if __name__ == "__main__":
    unittest.main()
