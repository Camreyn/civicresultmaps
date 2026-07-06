import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class KentuckyCoverageInventoryTests(unittest.TestCase):
    def test_kentucky_candidate_turnout_sources_are_staged_with_artifacts(self):
        config = load_config("etl/state-configs/ky.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 120)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 2086090)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 3548136)

        sources = {source["id"]: source for source in artifact["sources"]}
        for source_id in [
            "ky-2024-state-turnout-pdf-lead",
            "ky-2024-general-registration-pdf-lead",
            "ky-2024-turnout-registration-reconciliation",
            "ky-2024-turnout-source-review",
            "ky-2024-data-coverage-inventory",
        ]:
            self.assertIn(source_id, sources)
            self.assertEqual(sources[source_id]["status"], "candidate")
            self.assertTrue(
                all(item["exists"] for item in sources[source_id]["metadata"]["artifacts"]),
                source_id,
            )

    def test_kentucky_coverage_inventory_records_turnout_reconciliation_need(self):
        inventory = json.loads(Path("data/ky-2024-data-coverage-inventory.json").read_text())

        self.assertEqual(inventory["state"], "KY")
        self.assertEqual(inventory["checkedAt"], "2026-07-06")
        turnout = next(
            item
            for item in inventory["loadedArtifacts"]
            if item["id"] == "ky-2024-state-turnout-and-registration-leads"
        )
        self.assertEqual(turnout["expectedCounts"]["countyTurnoutBallotsCast"], 2086320)
        self.assertEqual(turnout["expectedCounts"]["countyRegisteredVoters"], 3548136)
        self.assertEqual(turnout["expectedCounts"]["reconciliationRows"], 120)
        self.assertEqual(turnout["expectedCounts"]["stateBoardMinusEacBallotsCastDelta"], 230)
        self.assertEqual(turnout["expectedCounts"]["stateBoardMinusEacRegisteredVotersDelta"], 0)
        self.assertTrue(any("unofficial" in note for note in turnout["caveats"]))
        self.assertTrue(any(gap["artifact"] == "precinct_boundary_geometry" for gap in inventory["gaps"]))

    def test_kentucky_wave2_turnout_source_review_keeps_eac_active(self):
        review = json.loads(Path("data/ky-2024-turnout-source-review.json").read_text())
        inventory = json.loads(Path("data/ky-2024-data-coverage-inventory.json").read_text())

        self.assertEqual(review["decision"], "keep_eac_fallback")
        self.assertEqual(review["confidence"], "reviewed_not_valid_turnout_replacement")
        self.assertEqual(review["countyResultDownloads"]["recapPdfCount"], 120)
        self.assertEqual(review["countyResultDownloads"]["recapTextCount"], 120)
        self.assertFalse(review["countyResultDownloads"]["canReplaceEacFallbackTurnout"])
        self.assertEqual(review["turnoutRegistrationPdfReconciliation"]["ballotsCastStateBoardMinusEac"], 230)
        self.assertEqual(review["eacFallbackTotals"]["ballotsCast"], 2086090)
        self.assertTrue(any("unofficial" in caveat for caveat in review["caveats"]))

        source_review = next(
            item
            for item in inventory["loadedArtifacts"]
            if item["id"] == "ky-2024-turnout-source-review"
        )
        self.assertEqual(source_review["confidence"], "reviewed_not_valid_turnout_replacement")
        self.assertEqual(source_review["expectedCounts"]["stateBoardMinusEacBallotsCastDelta"], 230)

    def test_kentucky_turnout_reconciliation_summary_keeps_eac_active(self):
        summary = json.loads(Path("data/ky-2024-turnout-registration-reconciliation-summary.json").read_text())
        csv_rows = Path("data/ky-2024-turnout-registration-reconciliation.csv").read_text().strip().splitlines()

        self.assertEqual(summary["rowCount"], 120)
        self.assertEqual(len(csv_rows) - 1, 120)
        self.assertEqual(summary["stateBoardTurnoutTotals"]["numberVoting"], 2086320)
        self.assertEqual(summary["eacTotals"]["ballotsCast"], 2086090)
        self.assertEqual(summary["deltas"]["ballotsCastStateBoardMinusEac"], 230)
        self.assertEqual(summary["deltas"]["registeredVotersStateBoardMinusEac"], 0)
        self.assertIn("Keep EAC fallback turnout active", summary["activeTurnoutDecision"])


if __name__ == "__main__":
    unittest.main()
