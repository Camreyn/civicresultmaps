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
        self.local_review = json.loads(Path("data/sd-2024-precinct-review-reconciliation.json").read_text(encoding="utf-8-sig"))
        self.turnout_semantics = json.loads(Path("data/sd-2024-turnout-semantics.json").read_text(encoding="utf-8-sig"))
        self.official_turnout = json.loads(Path("data/sd-2024-official-turnout-reconciliation.json").read_text(encoding="utf-8-sig"))
        self.historical = json.loads(Path("data/sd-historical-presidential-baseline-summary.json").read_text(encoding="utf-8-sig"))
        self.local_canvass_audit = json.loads(
            Path("data/sd-2024-certified-local-canvass-publication-audit.json").read_text(encoding="utf-8-sig")
        )
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
        self.assertEqual(len(artifact["native"]["reviewRows"]), 691)
        self.assertEqual(len(artifact["native"]["turnoutRows"]), 66)
        self.assertEqual(len(artifact["native"]["historicalRows"]), 198)
        self.assertEqual(
            {row["sourceId"] for row in artifact["native"]["historicalRows"]},
            {"sd-historical-presidential-official-county"},
        )
        historical_2012_oglala = next(
            row
            for row in artifact["native"]["historicalRows"]
            if row["electionYear"] == 2012 and row["jurisdictionName"] == "Oglala Lakota County"
        )
        self.assertEqual(historical_2012_oglala["sourceDisplayName"], "Shannon County")
        self.assertEqual(metrics["nativeResultTotalVotes"], 428922)
        self.assertEqual(metrics["nativeTrumpVotes"], 272081)
        self.assertEqual(metrics["nativeHarrisVotes"], 146859)
        self.assertEqual(metrics["nativeOtherVotes"], 9982)
        self.assertEqual(metrics["nativeComparisonRows"], 691)
        self.assertEqual(metrics["nativeComparisonContest"], "United States Representative")
        self.assertEqual(metrics["nativeBallotsCast"], 436478)
        self.assertEqual(metrics["nativeRegisteredVoters"], 624175)
        self.assertEqual(config.raw["expected"]["sources"], len(config.raw["sources"]))
        self.assertIn("sd-2024-official-source-request-packet", {source["id"] for source in config.raw["sources"]})
        self.assertIn("sd-2024-general-canvass-certificate", {source["id"] for source in config.raw["sources"]})
        self.assertIn("sd-2024-official-active-voter-turnout", {source["id"] for source in config.raw["sources"]})
        self.assertIn("sd-historical-presidential-official-county", {source["id"] for source in config.raw["sources"]})
        self.assertEqual(config.raw["turnout"]["denominatorType"], "activeVoters")
        self.assertEqual(config.raw["historicalBaselines"]["sourceId"], "sd-historical-presidential-official-county")

    def test_certified_canvass_pdf_exactly_validates_current_county_rows(self):
        self.assertEqual(self.canvass["pdf"]["bytes"], 801624)
        self.assertEqual(self.canvass["pdf"]["sha256"], "a9be018609c45e97c5b9b9c41d7f53dffc9c3390746486c115739e6d6d072c9c")
        self.assertEqual(self.canvass["president"], {"rows": 66, "totals": [146859, 272081, 9982]})
        self.assertEqual(self.canvass["usHouse"], {"rows": 66, "totals": [117818, 303630]})

    def test_official_local_review_and_active_voter_turnout_are_fail_closed(self):
        units = self.local_review["reportingUnits"]
        self.assertEqual(units["rows"], 691)
        self.assertEqual(units["counties"], 66)
        self.assertEqual(units["fourDigitGeographicCandidates"], 632)
        self.assertEqual(units["cPrefixedAdministrativeUnits"], 59)
        self.assertEqual(units["cPrefixedAbsenteeUnits"], 9)
        self.assertEqual(self.local_review["officialEnrTotals"]["president"]["total"], 428728)
        self.assertEqual(self.local_review["officialEnrTotals"]["usHouse"]["total"], 421264)
        self.assertEqual(self.local_review["reconciliation"]["presidentCertifiedMinusEnr"], 194)
        self.assertEqual(self.local_review["reconciliation"]["usHouseCertifiedMinusEnr"], 184)
        self.assertEqual(self.local_review["activationDecision"]["geometry"], "not_activated")
        self.assertEqual(
            self.local_review["normalizedArtifact"]["sha256"],
            "848cfac8b9b5eb5be6cada942b0ee8b5eb25fe17cf8bae0cfa8aee9c1d6c9046",
        )

        table = self.official_turnout["sourceTable"]
        self.assertEqual(table["rowCount"], 66)
        self.assertEqual(table["denominatorType"], "activeVoters")
        self.assertEqual(table["activeVoters"], 624175)
        self.assertEqual(table["ballotsCast"], 436478)
        self.assertEqual(table["registrationSemanticsEvidence"]["inactiveVoters"], 63901)
        self.assertEqual(table["registrationSemanticsEvidence"]["totalActiveVoters"], 624175)
        self.assertEqual(self.official_turnout["electionId684Comparison"]["summary"]["exactBallotsCastRows"], 66)
        self.assertEqual(self.official_turnout["electionId684Comparison"]["summary"]["enrVotersMinusOfficialActive"], 1017)
        self.assertEqual(self.official_turnout["activeSourceDecision"]["decision"], "activate_official_active_voter_turnout")
        self.assertEqual(
            self.official_turnout["pdf"]["sha256"],
            "4e424a7b53972963b81e49a3fef63e8e66e37bdb00431d894b3a55da041887d0",
        )

    def test_inventory_records_official_local_review_turnout_and_remaining_blocker(self):
        self.assertEqual(self.inventory["state"], "SD")
        self.assertEqual(self.inventory["checkedAt"], "2026-08-24")
        self.assertEqual(self.inventory["currentConfigStatus"]["completionDecision"], "remain_in_source_discovery_queue")
        self.assertEqual(self.inventory["currentConfigStatus"]["resultRows"], 66)
        self.assertEqual(self.inventory["currentConfigStatus"]["reviewRows"], 691)
        self.assertEqual(self.inventory["currentConfigStatus"]["turnoutRows"], 66)

        artifact_ids = {artifact["id"] for artifact in self.inventory["loadedArtifacts"]}
        self.assertIn("sd-2024-official-results-archive-evidence", artifact_ids)
        self.assertIn("sd-2024-official-source-request-packet", artifact_ids)
        self.assertIn("sd-2024-general-canvass-certificate", artifact_ids)
        self.assertIn("sd-2024-official-precinct-enr-review", artifact_ids)
        self.assertIn("sd-2024-official-active-voter-turnout", artifact_ids)
        self.assertIn("sd-2024-certified-local-canvass-publication-audit", artifact_ids)
        self.assertIn("sd-historical-presidential-official-county", artifact_ids)
        self.assertIn("Buffalo and Stanley", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("authoritative result-unit identity crosswalk", self.inventory["officialSourceProbe"]["blocker"])
        self.assertIn("Statewide Results.xlsx", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertIn("2026 Primary Election", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertEqual(self.inventory["officialSourceProbe"]["archiveProbe"]["checkedAt"], "2026-07-04")
        self.assertEqual(self.inventory["officialSourceProbe"]["wave25PublicRecheck"]["checkedAt"], "2026-07-04")
        self.assertIn("located the official certificate", self.inventory["officialSourceProbe"]["wave25PublicRecheck"]["result"])
        self.assertIn("anti-bot bypass", self.inventory["officialSourceProbe"]["wave25PublicRecheck"]["method"])
        self.assertEqual(
            self.inventory["officialSourceProbe"]["turnoutLeadDecision"]["status"],
            "official_active_voter_table_activated",
        )
        self.assertEqual(self.inventory["officialSourceProbe"]["turnoutLeadDecision"]["activeOfficialSource"]["activeVoters"], 624175)
        self.assertEqual(self.inventory["officialSourceProbe"]["turnoutLeadDecision"]["officialArchiveComparison"]["ballotsCast"], 436478)
        self.assertIn("ElectionID 684", self.inventory["officialSourceProbe"]["archiveProbe"]["result"])
        self.assertIn("691 reporting-unit keys", self.inventory["officialSourceProbe"]["archiveProbe"]["result"])
        self.assertIn("exactly reconciles", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        self.assertIn("post-election audit page", " ".join(self.inventory["officialSourceProbe"]["observedOfficialCapabilities"]))
        canvass_audit = self.inventory["officialSourceProbe"]["certifiedLocalCanvassPublicationAudit"]
        self.assertEqual(canvass_audit["distinctCountiesPresent"], 64)
        self.assertEqual(canvass_audit["missingCounties"], ["Buffalo", "Stanley"])
        self.assertEqual(canvass_audit["duplicatedCounties"], ["Brule"])
        self.assertEqual(canvass_audit["decision"], "fail_closed_no_certified_local_activation")
        self.assertEqual(self.inventory["requestPacketArtifact"], "data/sd-2024-official-source-request-packet.json")
        self.assertIn("exactly validated", " ".join(self.inventory["displayCaveats"]))
        self.assertIn("691 official-source", " ".join(self.inventory["displayCaveats"]))

    def test_official_historical_baseline_is_hash_pinned_and_reconciled(self):
        self.assertEqual(self.historical["sourceAuthority"], "South Dakota Secretary of State")
        self.assertEqual(self.historical["sourceId"], "sd-historical-presidential-official-county")
        self.assertEqual(self.historical["normalizedArtifact"]["rowCount"], 198)
        self.assertEqual(self.historical["normalizedArtifact"]["years"], [2012, 2016, 2020])
        by_year = {source["year"]: source for source in self.historical["sources"]}
        self.assertEqual(by_year[2012]["pdf"]["sha256"], "cd1b353d116b18c24a06c686be793e9310091339e1e1635e934d542cbf816a8b")
        self.assertEqual(by_year[2016]["pdf"]["sha256"], "e9b841ce1b5fd109dc9bead72a3748c6bf9075b08199595d5dc7201d89c3040f")
        self.assertEqual(by_year[2020]["pdf"]["sha256"], "34ad25189dd9fb4d6a83d30486a97502ef0a26cfcd09ec1f01f9e5895f2d5d22")
        self.assertEqual(by_year[2012]["totals"], {"rows": 66, "dem": 145039, "rep": 210610, "other": 8166, "total": 363815})
        self.assertEqual(by_year[2016]["totals"], {"rows": 66, "dem": 117458, "rep": 227721, "other": 24914, "total": 370093})
        self.assertEqual(by_year[2020]["totals"], {"rows": 66, "dem": 150471, "rep": 261043, "other": 11095, "total": 422609})
        self.assertIn("Shannon County", self.historical["caveat"])

    def test_certified_local_publication_audit_is_fail_closed(self):
        coverage = self.local_canvass_audit["coverage"]
        self.assertEqual(coverage["publishedBundleCount"], 4)
        self.assertEqual(coverage["certificateRecords"], 65)
        self.assertEqual(coverage["distinctCountiesPresent"], 64)
        self.assertEqual(coverage["missingCounties"], ["Buffalo", "Stanley"])
        self.assertEqual(coverage["duplicatedCounties"], ["Brule"])
        self.assertEqual(
            [bundle["sha256"] for bundle in self.local_canvass_audit["bundles"]],
            [
                "432c68f2d62031c9692af6f7c5fc22bc0f57c36211805ed8afe6898056203759",
                "5bfec72afec250e3f6ee61469288a18320c905b60d5f0acd3a44a847d845f2bf",
                "6dfd44263ae01edd2af256083545e7579b3c2b2a12fc441cbffb4ca1d9abd42a",
                "df59610614bb65ecff19caa1d3afb1330cc47dfe229d7b5ffef75f86268726d6",
            ],
        )
        polling = self.local_canvass_audit["pollingLocationEvidence"]
        self.assertEqual(polling["sha256"], "622cb1dd85feac493d1fb8ba78cf486244bf261cc209d44cfc187fb50cf27667")
        self.assertEqual(polling["geometryFieldsObserved"], [])
        self.assertEqual(polling["stableResultOrFeatureIdTermsObserved"], [])
        self.assertEqual(
            self.local_canvass_audit["decision"],
            "fail_closed_no_certified_local_or_geometry_activation",
        )

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
        self.assertEqual(turnout["votersFieldTotal"], 625192)
        self.assertEqual(self.evidence["turnoutLeadDecision"]["status"], "official_active_voter_table_activated")
        self.assertEqual(self.evidence["turnoutLeadDecision"]["activeOfficialSource"]["activeVoters"], 624175)
        self.assertEqual(self.evidence["turnoutLeadDecision"]["eacFallbackProvenance"]["ballotsCast"], 435739)
        self.assertEqual(self.evidence["turnoutLeadDecision"]["officialArchiveComparison"]["voters"], 625192)
        self.assertIn("exactly match", self.evidence["turnoutLeadDecision"]["reason"])
        self.assertIn("subsequently found", self.evidence["wave25PublicRecheck"]["result"])
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
        self.assertIn("lower_than_certified", self.evidence["reconciliation"]["status"])
        self.assertIn("official, certified results", self.evidence["officialResultsAvailabilityNote"])
        audit = self.evidence["postElectionAuditSummary"]
        self.assertEqual(audit["rowCount"], 66)
        self.assertEqual(audit["linkedCertificateCount"], 83)
        self.assertEqual(audit["discrepancySummaryCount"], 14)
        audit_collection = self.evidence["postElectionAuditCollectionDecision"]
        self.assertEqual(audit_collection["liveParsedRowCount"], 0)
        self.assertEqual(audit_collection["retainedRowCount"], 66)
        self.assertEqual(audit_collection["liveUniqueCountyCount"], 0)
        self.assertEqual(audit_collection["retainedUniqueCountyCount"], 66)
        self.assertFalse(audit_collection["countySetMatches"])
        self.assertEqual(audit_collection["retainedLinkedCertificateCount"], 83)
        self.assertEqual(audit_collection["retainedDiscrepancySummaryCount"], 14)
        self.assertTrue(audit_collection["usedRetainedContext"])
        self.assertTrue(all(probe["status"] == 404 for probe in self.evidence["canvassUrlProbes"]))

    def test_registries_keep_sd_in_source_discovery_after_certified_artifact_reconciliation(self):
        tiers = json.loads(Path("data/source-acquisition-tiers.json").read_text(encoding="utf-8-sig"))
        native = json.loads(Path("data/native-import-source-packages.json").read_text(encoding="utf-8-sig"))

        tier = next(row for row in tiers["states"] if row["state"] == "SD" and row["scope"] == "statewide")
        discovery = next(row for row in native["sourceDiscoveryQueue"] if row["state"] == "SD")

        self.assertEqual(tier["confidence"], "loaded_with_caveat")
        self.assertIn("691", tier["parserStatus"])
        self.assertIn("normalizedTurnoutCsv", tier["parserStatus"])
        self.assertIn("normalize_sd_historical_presidential_baseline.py", tier["parserStatus"])
        self.assertNotIn("SD", native["completedNativeStates"])
        self.assertEqual(discovery["completionDecision"]["decision"], "remain_in_source_discovery_queue")
        self.assertIn("officialArchiveEvidence", discovery["availableArtifacts"])
        self.assertIn("officialStatewideExport", discovery["availableArtifacts"])
        self.assertIn("officialCertifiedCanvass", discovery["availableArtifacts"])
        self.assertIn("officialSourceRequestPacket", discovery["availableArtifacts"])
        self.assertIn("localReviewRows", discovery["availableArtifacts"])
        self.assertIn("historicalBaseline", discovery["availableArtifacts"])
        self.assertIn("certifiedLocalPublicationAudit", discovery["availableArtifacts"])
        self.assertEqual(discovery["requestPacketArtifact"], "data/sd-2024-official-source-request-packet.json")
        self.assertEqual(discovery["expected"]["localReviewRows"], 691)
        self.assertEqual(discovery["expected"]["turnoutBallotsCast"], 436478)
        self.assertEqual(discovery["expected"]["turnoutActiveVoters"], 624175)
        self.assertEqual(self.request_rows["sd-official-2024-canvass"]["priority"], "resolved")
        self.assertIn("Official 2024 General Election Canvass", self.request_rows["sd-official-2024-canvass"]["sourceNeed"])
        self.assertIn("2024GeneralElectionCanvassWithCert.pdf", self.request_rows["sd-official-2024-canvass"]["knownUrlOrLead"])
        self.assertIn("428,922", self.request_rows["sd-official-2024-canvass"]["expectedRowsOrTotals"])
        self.assertIn("not a direct source replacement", self.request_rows["sd-official-2024-canvass"]["caveat"])
        self.assertEqual(self.request_rows["sd-state-native-turnout"]["priority"], "resolved")
        self.assertIn("ElectionReturns2024.pdf", self.request_rows["sd-state-native-turnout"]["knownUrlOrLead"])
        self.assertIn("624,175 active voters", self.request_rows["sd-state-native-turnout"]["expectedRowsOrTotals"])
        self.assertIn("not all registered voters", self.request_rows["sd-state-native-turnout"]["caveat"])
        self.assertIn("691 shared reporting-unit rows", self.request_rows["sd-precinct-results-geometry"]["expectedRowsOrTotals"])
        self.assertIn("Buffalo and Stanley", self.request_rows["sd-precinct-results-geometry"]["sourceNeed"])
        self.assertEqual(self.request_rows["sd-official-historical-baselines"]["priority"], "resolved")
        self.assertIn("normalize_sd_historical_presidential_baseline.py", self.request_rows["sd-official-historical-baselines"]["parserOrNormalizationPath"])
        self.assertIn("363,815", self.request_rows["sd-official-historical-baselines"]["expectedRowsOrTotals"])

    def test_request_packet_summarizes_remaining_official_followup_paths(self):
        self.assertEqual(self.request_packet["status"], "remaining_certified_local_identity_and_geometry_request_packet")
        self.assertIn("194 President votes", self.request_packet["blocker"])
        self.assertIn("Buffalo and Stanley", self.request_packet["blocker"])
        self.assertEqual(self.request_packet["officialPostElectionAuditContext"]["rowCount"], 66)
        self.assertEqual(self.request_packet["officialPostElectionAuditContext"]["linkedCertificateCount"], 83)
        self.assertEqual(self.request_packet["officialPostElectionAuditContext"]["discrepancySummaryCount"], 14)
        self.assertTrue(self.request_packet["postElectionAuditCollectionDecision"]["usedRetainedContext"])
        self.assertTrue(all(probe["status"] == 404 for probe in self.request_packet["canvassUrlProbes"]))
        self.assertTrue(any(target.get("requestPath", "").startswith("https://www.sd.gov/") for target in self.request_packet["requestTargets"]))
        self.assertEqual(self.request_packet["wave25PublicRecheck"]["checkedAt"], "2026-07-04")
        self.assertEqual(self.request_packet["turnoutLeadDecision"]["status"], "official_active_voter_table_activated")
        self.assertIn("geometry_or_crosswalk_identifier", self.request_packet["requestedFields"])
        canvass_audit = self.request_packet["certifiedLocalCanvassPublicationAudit"]
        self.assertEqual(len(canvass_audit["bundles"]), 4)
        self.assertEqual(canvass_audit["coverage"]["distinctCountiesPresent"], 64)
        self.assertEqual(canvass_audit["coverage"]["missingCounties"], ["Buffalo", "Stanley"])
        self.assertEqual(canvass_audit["coverage"]["duplicatedCounties"], ["Brule"])


if __name__ == "__main__":
    unittest.main()
