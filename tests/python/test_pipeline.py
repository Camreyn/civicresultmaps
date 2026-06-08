import unittest
from pathlib import Path

from civic_etl.pipeline import (
    build_staging_artifact,
    load_config,
    validate_config,
    write_staging_artifact,
)


class PipelineTests(unittest.TestCase):
    def test_wisconsin_config_validates(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)

        self.assertTrue(report.passed)
        self.assertEqual(report.metrics["state"], "WI")
        self.assertEqual(report.metrics["expectedJurisdictions"], 72)

    def test_staging_artifact_blocks_production_write(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertEqual(artifact["promotion"]["status"], "staged")
        self.assertTrue(artifact["promotion"]["requiresHumanReview"])
        self.assertFalse(artifact["promotion"]["productionWriteAllowed"])

    def test_write_staging_artifact(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        tmp = Path(".etl-test")
        tmp.mkdir(exist_ok=True)
        path = write_staging_artifact(artifact, tmp)
        try:
            self.assertEqual(Path(path).name, "wi-2024-staging.json")
            self.assertIn('"productionWriteAllowed": false', Path(path).read_text())
        finally:
            path.unlink(missing_ok=True)
            tmp.rmdir()


if __name__ == "__main__":
    unittest.main()
