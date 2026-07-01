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
        self.assertEqual(inventory["checkedAt"], "2026-07-01")
        turnout = next(
            item
            for item in inventory["loadedArtifacts"]
            if item["id"] == "ky-2024-state-turnout-and-registration-leads"
        )
        self.assertEqual(turnout["expectedCounts"]["countyTurnoutBallotsCast"], 2086320)
        self.assertEqual(turnout["expectedCounts"]["countyRegisteredVoters"], 3548136)
        self.assertTrue(any("unofficial" in note for note in turnout["caveats"]))
        self.assertTrue(any(gap["artifact"] == "precinct_boundary_geometry" for gap in inventory["gaps"]))


if __name__ == "__main__":
    unittest.main()
