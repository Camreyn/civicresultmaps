import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewYorkHistoricalPipelineTests(unittest.TestCase):
    def test_new_york_official_pdf_history_builds_county_rows(self):
        config = load_config("etl/state-configs/ny.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeNewYorkCountyPresidentCsv")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 186)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 186)
        self.assertIn("official NYSBOE general-election PDFs", native["metrics"]["nativeHistoricalWarning"])
        self.assertIn("Image-only, president-only, unsupported, or unreviewed counties", native["metrics"]["nativeReviewWarning"])

        albany_2012 = next(
            row
            for row in native["historicalRows"]
            if row["electionYear"] == 2012 and row["jurisdictionName"] == "Albany County"
        )
        self.assertEqual(albany_2012["sourceLevel"], "county")
        self.assertEqual(albany_2012["demVotes"], 87556)
        self.assertEqual(albany_2012["repVotes"], 45064)
        self.assertEqual(albany_2012["otherVotes"], 3908)
        self.assertEqual(albany_2012["totalVotes"], 136528)

        rows_2020 = [row for row in native["historicalRows"] if row["electionYear"] == 2020]
        self.assertEqual(sum(row["demVotes"] for row in rows_2020), 5244886)
        self.assertEqual(sum(row["repVotes"] for row in rows_2020), 3251997)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2020), 116870)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2020), 8613753)


if __name__ == "__main__":
    unittest.main()
