import csv
import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class SouthDakotaCoverageInventoryTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads(Path("data/sd-2024-data-coverage-inventory.json").read_text(encoding="utf-8-sig"))
        self.evidence = json.loads(Path("data/sd-2024-official-results-archive-evidence.json").read_text(encoding="utf-8-sig"))
        self.request_packet = json.loads(Path("data/sd-2024-official-source-request-packet.json").read_text(encoding="utf-8-sig"))
        self.canvass = json.loads(Path("data/sd-2024-general-canvass-reconciliation.json").read_text(encoding="utf-8-sig"))
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
        self.assertEqual(config.raw["expected"]["sources"], len(config.raw["sources"]))
        self.assertIn("sd-2024-official-source-request-packet", {source["id"] for source in config.raw["sources"]})
        self.assertIn("sd-2024-general-canvass-certificate", {source["id"] for source in config.raw["sources"]})

    def test_certified_canvass_pdf_exactly_validates_current_county_rows(self):
        self.assertEqual(self.canvass["pdf"]["bytes"], 801624)
        self.assertEqual(self.canvass["pdf"]["sha256"], "a9be018609c45e97c5b9b9c41d7f53dffc9c3390746486c115739e6d6d072c9c")
        self.assertEqual(self.canvass["president"], {"rows": 66, "totals": [146859, 272081, 9982]})
        self.assertEqual(self.canvass["usHouse"], {"rows": 66, "totals": [117818, 303630]})

    def test_inventory_records_official_archive_lead_and_remaining_blocker(self):
        self.assertEqual(self.inventory["state"], "SD")
        self.assertEqual(self.inventory["checkedAt"], "2026-08-19")
        self.assertEqual(self.inventory["currentConfigStatus"]["completionDecision"], "remain_in_source_discovery_queue")
        self.assertEqual(self.inventory["currentConfigStatus"]["resultRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["reviewRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["turnoutRows"], 66)

        artifact_ids = {artifact["id"] for artifact in self.inventory["loadedArtifacts"]}
        self.assertIn("sd-2024-official-results-archive-evidence", artifact_ids)
        self.assertIn("sd-2024-official-source-request-packet", artifact_ids)
        self.assertIn("sd-2024-general-canvass-certificate", artifact_ids)
        self.assertIn("ElectionID 684", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("Statewide Results.xlsx", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertIn("exactly validates", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("2026 Primary Election", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertEqual(self.inventory["officialSourceProbe"]["archiveProbe"]["checkedAt"], "2026-07-04")
        self.assertEqual(self.inventory["officialSourceProbe"]["wave25PublicRecheck"]["checkedAt"], "2026-07-04")
        self.assertIn("located the official certificate", self.inventory["officialSourceProbe"]["wave25PublicRecheck"]["result"])
        self.assertIn("anti-bot bypass", self.inventory["officialSourceProbe"]["wave25PublicRecheck"]["method"])
        self.assertEqual(
            self.inventory["officialSourceProbe"]["turnoutLeadDecision"]["status"],
            "retain_as_denominator_timing_lead_only",
        )
        self.assertEqual(self.inventory["officialSourceProbe"]["turnoutLeadDecision"]["officialArchiveLead"]["ballotsCast"], 436478)
        self.assertIn("ElectionID 684", self.inventory["officialSourceProbe"]["archiveProbe"]["result"])
        self.assertIn("statewide XLSX export", self.inventory["officialSourceProbe"]["archiveProbe"]["result"])
        self.assertIn("exactly reconciles", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertIn("post-election audit page", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertEqual(self.inventory["requestPacketArtifact"], "data/sd-2024-official-source-request-packet.json")
        self.assertIn("exactly validated", " ".join(self.inventory["displayCaveats"]))
        self.assertIn("not precinct-level scatter plots", " ".join(self.inventory["displayCaveats"]))

    def test_official_archive_evidence_retains_ids_counts_and_reconciliation_caveat(self):
        self.assertEqual(self.evidence["sourceAuthority"], "South Dakota Secretary of State")
        self.assertEqual(self.evidence["retainedOfficialExportArtifactPath"], "data/sd-2024-general-statewide-results.xlsx")
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
        self.assertEqual(self.evidence["turnoutLeadDecision"]["status"], "retain_as_denominator_timing_lead_only")
        self.assertEqual(self.evidence["turnoutLeadDecision"]["activeFallback"]["ballotsCast"], 435739)
        self.assertEqual(self.evidence["turnoutLeadDecision"]["officialArchiveLead"]["voters"], 625192)
        self.assertIn("65,114 below", self.evidence["turnoutLeadDecision"]["reason"])
        self.assertIn("No public certified", self.evidence["wave25PublicRecheck"]["result"])
        statewide_export = self.evidence["officialArchiveSummaries"]["statewideExport"]
        self.assertEqual(statewide_export["localArtifactPath"], "data/sd-2024-general-statewide-results.xlsx")
        self.assertIn("Statewide Results.xlsx", statewide_export["contentDisposition"])
        self.assertEqual(statewide_export["presidentialElectors"]["rowCount"], 66)
        self.assertEqual(statewide_export["presidentialElectors"]["totalVotes"], 428728)
        self.assertEqual(statewide_export["usRepresentative"]["rowCount"], 66)
        self.assertEqual(statewide_export["usRepresentative"]["totalVotes"], 421264)
        self.assertIn("Unofficial", statewide_export["presidentialElectors"]["title"])
        self.assertEqual(self.evidence["reconciliation"]["presidentialCertifiedMinusArchive"], 194)
        self.assertEqual(self.evidence["reconciliation"]["usHouseCertifiedMinusArchive"], 184)
        self.assertEqual(self.evidence["reconciliation"]["presidentialCertifiedMinusStatewideExport"], 194)
        self.assertEqual(self.evidence["reconciliation"]["usHouseCertifiedMinusStatewideExport"], 184)
        self.assertIn("do_not_reconcile", self.evidence["reconciliation"]["status"])
        self.assertIn("official, certified results", self.evidence["officialResultsAvailabilityNote"])
        audit = self.evidence["postElectionAuditSummary"]
        self.assertEqual(audit["rowCount"], 66)
        self.assertEqual(audit["linkedCertificateCount"], 83)
        self.assertEqual(audit["discrepancySummaryCount"], 14)
        self.assertTrue(all(probe["status"] == 404 for probe in self.evidence["canvassUrlProbes"]))

    def test_registries_keep_sd_in_source_discovery_after_certified_artifact_reconciliation(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "SD" and row["scope"] == "statewide")
        discovery = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "SD")

        self.assertEqual(tier["confidence"], "partial_secondary_staging")
        self.assertIn("ElectionID 684", tier["parserStatus"])
        self.assertNotIn("SD", native["completedNativeStates"])
        self.assertEqual(discovery["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertIn("officialArchiveEvidence", discovery["availableArtifacts"])
        self.assertIn("officialStatewideExport", discovery["availableArtifacts"])
        self.assertIn("officialCertifiedCanvass", discovery["availableArtifacts"])
        self.assertIn("officialSourceRequestPacket", discovery["availableArtifacts"])
        self.assertEqual(discovery["requestPacketArtifact"], "data/sd-2024-official-source-request-packet.json")
        self.assertEqual(discovery["expected"]["localReviewRows"], 66)
        self.assertEqual(self.request_rows["sd-official-2024-canvass"]["priority"], "resolved")
        self.assertIn("Official 2024 General Election Canvass", self.request_rows["sd-official-2024-canvass"]["sourceNeed"])
        self.assertIn("2024GeneralElectionCanvassWithCert.pdf", self.request_rows["sd-official-2024-canvass"]["knownUrlOrLead"])
        self.assertIn("428,922", self.request_rows["sd-official-2024-canvass"]["expectedRowsOrTotals"])
        self.assertIn("not a direct source replacement", self.request_rows["sd-official-2024-canvass"]["caveat"])
        self.assertEqual(self.request_rows["sd-state-native-turnout"]["priority"], "P1")
        self.assertIn("GetVoterTurnoutArchive", self.request_rows["sd-state-native-turnout"]["knownUrlOrLead"])
        self.assertIn("field definitions/timing", self.request_rows["sd-state-native-turnout"]["neededArtifact"])
        self.assertIn("739 above EAC", self.request_rows["sd-state-native-turnout"]["caveat"])

    def test_wave24_request_packet_summarizes_official_followup_paths(self):
        self.assertEqual(self.request_packet["status"], "official_certified_reconciliation_request_packet")
        self.assertIn("194 President votes", self.request_packet["blocker"])
        self.assertEqual(self.request_packet["officialPostElectionAuditContext"]["rowCount"], 66)
        self.assertEqual(self.request_packet["officialPostElectionAuditContext"]["linkedCertificateCount"], 83)
        self.assertEqual(self.request_packet["officialPostElectionAuditContext"]["discrepancySummaryCount"], 14)
        self.assertTrue(all(probe["status"] == 404 for probe in self.request_packet["canvassUrlProbes"]))
        self.assertTrue(any(target.get("requestPath", "").startswith("https://www.sd.gov/") for target in self.request_packet["requestTargets"]))
        self.assertEqual(self.request_packet["wave25PublicRecheck"]["checkedAt"], "2026-07-04")
        self.assertEqual(self.request_packet["turnoutLeadDecision"]["status"], "retain_as_denominator_timing_lead_only")
        self.assertIn("turnout_denominator_timing", self.request_packet["requestedFields"][-1])


if __name__ == "__main__":
    unittest.main()
