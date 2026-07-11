import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class MarylandCoverageInventoryTests(unittest.TestCase):
    def test_maryland_historical_baselines_load_into_native_staging(self):
        etl_config = load_config("etl/state-configs/md.json")
        report = validate_config(etl_config)
        artifact = build_staging_artifact(etl_config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeMarylandPrecinctCsv")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 48)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(sum(row["totalVotes"] for row in native["historicalRows"]), 5818477)

        baltimore_city_2016 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Baltimore City" and row["electionYear"] == 2016
        )
        self.assertEqual(baltimore_city_2016["demVotes"], 202673)
        self.assertEqual(baltimore_city_2016["repVotes"], 25205)
        self.assertEqual(baltimore_city_2016["sourceDocumentId"], "md-historical-presidential-baseline")

        baltimore_county_2016 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Baltimore County" and row["electionYear"] == 2016
        )
        self.assertEqual(baltimore_county_2016["demVotes"], 218412)
        self.assertEqual(baltimore_county_2016["repVotes"], 149477)

        anne_arundel_2020 = next(
            row
            for row in native["historicalRows"]
            if row["jurisdictionName"] == "Anne Arundel County" and row["electionYear"] == 2020
        )
        self.assertEqual(anne_arundel_2020["demVotes"], 172823)
        self.assertEqual(anne_arundel_2020["repVotes"], 127821)


if __name__ == "__main__":
    unittest.main()

