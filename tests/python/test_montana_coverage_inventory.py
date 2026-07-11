import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class MontanaCoverageInventoryTests(unittest.TestCase):
    def test_montana_historical_baselines_load_into_native_staging(self):
        etl_config = load_config("etl/state-configs/mt.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 112)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 1098166)

        lewis_and_clark_2016 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Lewis and Clark County" and row["electionYear"] == 2016
        )
        self.assertEqual(lewis_and_clark_2016["demVotes"], 14478)
        self.assertEqual(lewis_and_clark_2016["repVotes"], 16895)
        self.assertEqual(lewis_and_clark_2016["sourceDocumentId"], "mt-historical-presidential-baseline")

        gallatin_2020 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Gallatin County" and row["electionYear"] == 2020
        )
        self.assertEqual(gallatin_2020["demVotes"], 37044)
        self.assertEqual(gallatin_2020["repVotes"], 31696)


if __name__ == "__main__":
    unittest.main()
