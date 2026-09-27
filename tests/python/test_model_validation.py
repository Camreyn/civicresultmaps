import inspect
import math
import json
from pathlib import Path
import tempfile
import unittest

from civic_etl.model_validation import Prior, inspect_staging_readiness, posterior, posterior_draws, simulation_based_calibration


class ModelValidationTests(unittest.TestCase):
    def test_exact_synthetic_nig_posterior_and_invalid_priors(self):
        result = posterior([1.0, 3.0], Prior(mu0=0, kappa0=1, alpha0=2, beta0=.02))
        self.assertAlmostEqual(result["mu"], 4 / 3)
        self.assertAlmostEqual(result["beta"], .02 + 1 + 4 / 3)
        with self.assertRaises(ValueError): posterior([math.inf])
        with self.assertRaises(ValueError): posterior([0], Prior(alpha0=math.inf))

    def test_sbc_is_deterministic_and_checks_both_parameters_and_independent_draws(self):
        first = simulation_based_calibration(simulations=100, posterior_samples=100, seed=9)
        self.assertEqual(first, simulation_based_calibration(simulations=100, posterior_samples=100, seed=9))
        self.assertEqual(len(first["mu"]["ranks"]), 100)
        self.assertEqual(len(first["variance"]["ranks"]), 100)
        self.assertTrue(first["independentPosteriorDrawCheck"])
        self.assertFalse(first["electionForecastingSupported"])
        self.assertIn("not a pass/fail", first["purpose"])
        with self.assertRaises(ValueError): simulation_based_calibration(simulations=99, posterior_samples=100)

    def test_readiness_has_no_actual_outcome_fit_or_party_probability_surface(self):
        report = inspect_staging_readiness(["WI"])
        self.assertFalse(report["publicationEligible"])
        self.assertFalse(report["electionForecastingSupported"])
        self.assertNotIn("fit", inspect.signature(inspect_staging_readiness).parameters)
        serialized = str(report).lower()
        self.assertNotIn("demvotes", serialized)
        self.assertNotIn("repvotes", serialized)
        self.assertNotIn("probability", serialized)
        with self.assertRaises(ValueError): inspect_staging_readiness(["../"])

    def test_posterior_draws_reject_invalid_counts(self):
        fit = posterior([0.0])
        with self.assertRaises(ValueError): posterior_draws(fit, 0, __import__("random").Random(1))

    def test_readiness_fixture_absence_malformed_wrong_state_missing_total_and_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging = root / ".etl" / "staging"; staging.mkdir(parents=True)
            self.assertEqual(inspect_staging_readiness(["WI"], root)["states"]["WI"]["reason"], "fixed staging artifact unavailable")
            artifact = staging / "wi-2024-staging.json"
            artifact.write_text("{bad", encoding="utf-8")
            self.assertEqual(inspect_staging_readiness(["WI"], root)["states"]["WI"]["reason"], "fixed artifact is malformed JSON")
            artifact.write_text(json.dumps({"state": {"code": "MN"}, "election": {"year": 2024}, "native": {"resultRows": [], "historicalRows": []}}), encoding="utf-8")
            self.assertEqual(inspect_staging_readiness(["WI"], root)["states"]["WI"]["status"], "inconclusive")
            fixture = {"state": {"code": "WI"}, "election": {"year": 2024}, "native": {"resultRows": [{"jurisdictionTag": "county:55001", "sourceId": "fixture"}], "historicalRows": [{"jurisdictionTag": "county:55001", "electionYear": 2020, "sourceId": "history"}]}}
            artifact.write_text(json.dumps(fixture), encoding="utf-8")
            state = inspect_staging_readiness(["WI"], root)["states"]["WI"]
            self.assertEqual(state["counts"]["missingRecordedTotalVotes"], 1)
            self.assertEqual(state["historical"]["years"], [2020])
            self.assertEqual(state["historical"]["sourceIds"], ["history"])

    def test_readiness_rejects_linked_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); staging = root / ".etl" / "staging"; staging.mkdir(parents=True)
            external = root / "external.json"; external.write_text("{}", encoding="utf-8")
            artifact = staging / "wi-2024-staging.json"
            try:
                artifact.symlink_to(external)
            except OSError:
                self.skipTest("symlink creation unavailable on this Windows test host")
            result = inspect_staging_readiness(["WI"], root)["states"]["WI"]
            self.assertEqual(result["status"], "inconclusive")
            self.assertIn("link or junction", result["reason"])
