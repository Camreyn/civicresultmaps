from pathlib import Path
import csv
import unittest

from civic_etl.pipeline import build_staging_artifact, load_config, validate_config


class NewJerseyHistoricalPipelineTests(unittest.TestCase):
    def test_new_jersey_2016_2020_historical_rows_are_loaded(self):
        rows = list(csv.DictReader(Path("data/nj-2020-historical-presidential-baseline.csv").read_text(encoding="utf-8").splitlines()))
        self.assertEqual(len(rows), 21)
        self.assertEqual({row["election_year"] for row in rows}, {"2020"})
        self.assertEqual(len({row["jurisdiction_tag"] for row in rows}), 21)
        self.assertEqual(rows[0]["jurisdiction_tag"], "county:34001")

        config = load_config("etl/state-configs/nj.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 42)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2016, 2020])
        self.assertEqual(len(native["historicalRows"]), 42)
        self.assertIn("jurisdictionTag county flip joins", native["metrics"]["nativeHistoricalWarning"])

        atlantic = next(row for row in native["historicalRows"] if row["electionYear"] == 2020 and row["jurisdictionName"] == "Atlantic County")
        self.assertEqual(atlantic["sourceLevel"], "county")
        self.assertEqual(atlantic["demVotes"], 73808)
        self.assertEqual(atlantic["repVotes"], 64438)
        self.assertEqual(atlantic["otherVotes"], 1785)
        self.assertEqual(atlantic["totalVotes"], 140031)

        rows_2020 = [row for row in native["historicalRows"] if row["electionYear"] == 2020]
        self.assertEqual(sum(row["demVotes"] for row in rows_2020), 2608400)
        self.assertEqual(sum(row["repVotes"] for row in rows_2020), 1883313)
        self.assertEqual(sum(row["otherVotes"] for row in rows_2020), 57744)
        self.assertEqual(sum(row["totalVotes"] for row in rows_2020), 4549457)


if __name__ == "__main__":
    unittest.main()
