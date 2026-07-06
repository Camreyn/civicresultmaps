import csv
import json
import unittest
from pathlib import Path


class IdahoTurnoutSourceTests(unittest.TestCase):
    def test_idaho_state_native_turnout_reconciles_to_summary(self):
        rows = list(csv.DictReader(Path("data/id-2024-general-turnout.csv").read_text(encoding="utf-8-sig").splitlines()))
        summary = json.loads(Path("data/id-2024-turnout-reconciliation-summary.json").read_text(encoding="utf-8"))

        self.assertEqual(len(rows), 44)
        self.assertEqual(sum(int(row["ballots_cast"]) for row in rows), 917469)
        self.assertEqual(sum(int(row["registered_voters"]) for row in rows), 1178750)
        self.assertEqual(sum(int(row["registration_at_cutoff"]) for row in rows), 1057735)
        self.assertEqual(sum(int(row["election_day_registrations"]) for row in rows), 121015)
        self.assertTrue(all(row["source_status"] == "loaded" for row in rows))
        self.assertTrue(all(row["warning_required"] == "false" for row in rows))
        self.assertEqual(summary["status"], "loaded_state_native_turnout_replaces_eac_fallback")
        self.assertEqual(summary["totals"]["rows"], 44)
        self.assertEqual(summary["eacBenchmarkComparison"]["ballotsCastDeltaSosMinusEac"], 0)
        self.assertEqual(summary["eacBenchmarkComparison"]["registeredVotersDeltaSosMinusEac"], 0)


if __name__ == "__main__":
    unittest.main()