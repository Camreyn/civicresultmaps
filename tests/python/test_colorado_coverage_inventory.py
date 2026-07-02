import json
import unittest
from pathlib import Path

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class ColoradoCoverageInventoryTests(unittest.TestCase):
    def load_json(self, path):
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))

    def test_colorado_config_remains_turnout_only_with_inventory_provenance(self):
        config = load_config("etl/state-configs/co.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(config.expected.sources, len(config.sources))
        self.assertEqual(config.expected.result_rows, 0)
        self.assertEqual(config.expected.review_rows, 0)
        self.assertEqual(artifact["native"]["parser"], "nativeEacTurnoutCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 64)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 3240754)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 4583280)

        sources = {source["id"]: source for source in artifact["sources"]}
        inventory_source = sources["co-2024-data-coverage-inventory"]
        self.assertEqual(inventory_source["status"], "candidate")
        self.assertTrue(all(item["exists"] for item in inventory_source["metadata"]["artifacts"]))

    def test_colorado_inventory_and_registries_classify_official_source_path(self):
        inventory = self.load_json("data/co-2024-data-coverage-inventory.json")
        confirmed = {artifact["id"]: artifact for artifact in inventory["confirmedArtifacts"]}
        findings = {finding["topic"]: finding for finding in inventory["sourceFindings"]}

        self.assertEqual(inventory["status"], "official_clarity_endpoint_confirmed_inventory_only")
        self.assertEqual(confirmed["co-2024-clarity-detailxml-endpoint"]["expectedRowsOrTotals"]["presidentialTotalVotes"], 3192745)
        self.assertEqual(confirmed["co-2024-regent-at-large-comparison-lead"]["expectedRowsOrTotals"]["contestTotalVotes"], 2930776)
        self.assertEqual(findings["sameGrainComparisonContest"]["status"], "official_county_same_grain_lead_confirmed_not_loaded")
        self.assertEqual(findings["stateNativeTurnout"]["status"], "official_turnout_lead_confirmed_not_replacing_eac")

        tiers = self.load_json("data/source-acquisition-tiers.json")
        co_tier = next(row for row in tiers["states"] if row["state"] == "CO" and row["scope"] == "statewide")
        self.assertEqual(co_tier["tier"], "tier_2_official_dashboard_endpoint")
        self.assertIn("official Clarity detail XML ZIP endpoint", co_tier["exportFormats"])
        self.assertIn("same-grain county CU Regent at-large comparison lead from the same endpoint", co_tier["availableFields"])

        native_packages = self.load_json("data/native-import-source-packages.json")
        self.assertNotIn("CO", native_packages["completedNativeStates"])
        co_queue = next(row for row in native_packages["sourceDiscoveryQueue"] if row["state"] == "CO")
        self.assertEqual(co_queue["requestMatrixArtifact"], "data/co-2024-source-request-matrix.tsv")
        self.assertIn("Regent", co_queue["preferredComparisonContest"])


if __name__ == "__main__":
    unittest.main()
