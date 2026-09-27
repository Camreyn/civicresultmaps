"""Synthetic-only statistical implementation QA and historical-data readiness.

This module never fits, predicts, scores, ranks, or estimates an election
outcome.  Its statistical checks use wholly synthetic nonpolitical normal data.
Its staging inspection reports only structural/provenance readiness counts.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import argparse
import json
from math import isfinite, sqrt
import os
from pathlib import Path
from random import Random
import stat
from statistics import mean
from typing import Any, Iterable

MODEL_VERSION = "0.2.0-synthetic-qa"
SAFE_JSON_INTEGER = 2**53 - 1
MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
MODEL_SPECIFICATION = {
    "dataReadiness": "structural/provenance only; never outcome fitting",
    "inferenceQa": "synthetic normal-inverse-gamma parameter recovery and SBC",
    "prohibited": ["election forecasts", "outcome probabilities", "party/candidate scoring", "actual-result fitting"],
}


@dataclass(frozen=True)
class Prior:
    name: str = "synthetic-baseline"
    mu0: float = 0.0
    kappa0: float = 1.0
    alpha0: float = 2.0
    beta0: float = 1.0


def _validate_prior(prior: Prior) -> None:
    if not all(isfinite(value) for value in (prior.mu0, prior.kappa0, prior.alpha0, prior.beta0)) or min(prior.kappa0, prior.alpha0, prior.beta0) <= 0:
        raise ValueError("prior must be finite with positive kappa0, alpha0, and beta0")


def posterior(samples: Iterable[float], prior: Prior = Prior()) -> dict[str, float]:
    """Exact NIG posterior, restricted to caller-provided synthetic samples."""
    _validate_prior(prior)
    observations = list(samples)
    if not observations or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) for value in observations):
        raise ValueError("posterior requires finite numeric synthetic observations")
    count = len(observations)
    average = mean(observations)
    kappa = prior.kappa0 + count
    alpha = prior.alpha0 + count / 2
    beta = prior.beta0 + .5 * sum((value - average) ** 2 for value in observations) + prior.kappa0 * count * (average - prior.mu0) ** 2 / (2 * kappa)
    return {"count": count, "mu": (prior.kappa0 * prior.mu0 + count * average) / kappa, "kappa": kappa, "alpha": alpha, "beta": beta}


def posterior_draws(summary: dict[str, float], draws: int, rng: Random) -> list[tuple[float, float]]:
    if not isinstance(draws, int) or isinstance(draws, bool) or draws < 1:
        raise ValueError("draws must be a positive integer")
    result = []
    for _ in range(draws):
        sigma2 = summary["beta"] / rng.gammavariate(summary["alpha"], 1.0)
        result.append((rng.normalvariate(summary["mu"], sqrt(sigma2 / summary["kappa"])), sigma2))
    return result


def simulation_based_calibration(*, simulations: int = 100, posterior_samples: int = 100, seed: int = 20260908, prior: Prior = Prior()) -> dict[str, Any]:
    """Synthetic SBC diagnostics for both NIG parameters; intentionally no pass/fail."""
    _validate_prior(prior)
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 2_147_483_647:
        raise ValueError("seed must be a bounded integer")
    if simulations < 100 or posterior_samples < 100:
        raise ValueError("SBC requires at least 100 simulations and posterior samples")
    rng = Random(seed)
    mu_ranks, variance_ranks = [], []
    independent_draw_pairs = []
    for _ in range(simulations):
        true_variance = prior.beta0 / rng.gammavariate(prior.alpha0, 1.0)
        true_mu = rng.normalvariate(prior.mu0, sqrt(true_variance / prior.kappa0))
        fit = posterior([rng.normalvariate(true_mu, sqrt(true_variance)) for _ in range(12)], prior)
        draws = posterior_draws(fit, posterior_samples, rng)
        mu_ranks.append(sum(value < true_mu for value, _ in draws))
        variance_ranks.append(sum(value < true_variance for _, value in draws))
        independent_draw_pairs.append(draws[0] != draws[1])
    expected_per_bin = simulations / (posterior_samples + 1)
    def diagnostic(ranks: list[int]) -> dict[str, Any]:
        return {"ranks": ranks, "meanRank": mean(ranks), "expectedMeanRank": posterior_samples / 2, "maxBinDeviation": max(abs(ranks.count(rank) - expected_per_bin) for rank in range(posterior_samples + 1))}
    return {"experimental": True, "publicationEligible": False, "electionForecastingSupported": False, "purpose": "synthetic inference-algorithm diagnostics only; not a pass/fail or real-world statistical readiness certification", "seed": seed, "simulations": simulations, "posteriorSamples": posterior_samples, "mu": diagnostic(mu_ranks), "variance": diagnostic(variance_ranks), "independentPosteriorDrawCheck": all(independent_draw_pairs)}


def _canonical_registry() -> dict[str, str]:
    path = Path(__file__).resolve().parents[1] / "data" / "canonical-jurisdictions.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {str(item["jurisdictionTag"]): str(item["state"]).upper() for item in payload.get("jurisdictions", [])}


def _safe_total(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= SAFE_JSON_INTEGER


def _is_link_or_junction(path: Path) -> bool:
    return path.is_symlink() or getattr(os.path, "isjunction", lambda _: False)(path)


def _read_fixed_artifact(repo_root: Path, state: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Read once from the fixed location, rejecting links and changing files."""
    relative = Path(".etl") / "staging" / f"{state.lower()}-2024-staging.json"
    try:
        root = repo_root.resolve(strict=True)
        candidate = repo_root / relative
        for part in [repo_root, repo_root / ".etl", repo_root / ".etl" / "staging", candidate]:
            if _is_link_or_junction(part):
                return None, {"status": "inconclusive", "reason": "fixed artifact path contains a link or junction"}
        before = candidate.stat()
        if not stat.S_ISREG(before.st_mode):
            return None, {"status": "inconclusive", "reason": "fixed artifact is not a regular file"}
        if before.st_size > MAX_ARTIFACT_BYTES:
            return None, {"status": "inconclusive", "reason": "fixed artifact exceeds the 20 MiB readiness limit"}
        resolved = candidate.resolve(strict=True)
        if os.path.commonpath((str(root), str(resolved))) != str(root):
            return None, {"status": "inconclusive", "reason": "fixed artifact resolves outside the repository"}
        bytes_value = candidate.read_bytes()
        after = candidate.stat()
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            return None, {"status": "inconclusive", "reason": "fixed artifact changed while being inspected"}
        try:
            payload = json.loads(bytes_value.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None, {"status": "inconclusive", "reason": "fixed artifact is malformed JSON"}
        if not isinstance(payload, dict):
            return None, {"status": "inconclusive", "reason": "fixed artifact root is not an object"}
        return payload, {"artifactSha256": sha256(bytes_value).hexdigest(), "artifactBytes": len(bytes_value), "status": "read"}
    except (FileNotFoundError, NotADirectoryError):
        return None, {"status": "inconclusive", "reason": "fixed staging artifact unavailable"}
    except OSError:
        return None, {"status": "inconclusive", "reason": "fixed staging artifact could not be safely read"}


def inspect_staging_readiness(states: Iterable[str], repo_root: Path | None = None) -> dict[str, Any]:
    """Read fixed staging locations without inspecting candidate/party components."""
    root = repo_root or Path(__file__).resolve().parents[1]
    registry = _canonical_registry()
    supported_states = set(registry.values())
    report_states: dict[str, Any] = {}
    for state in sorted({str(state).upper() for state in states}):
        if len(state) != 2 or not state.isalpha() or state not in supported_states:
            raise ValueError("states must be canonical two-letter registry state codes")
        payload, identity = _read_fixed_artifact(root, state)
        if payload is None:
            report_states[state] = identity
            continue
        state_block, election, native = payload.get("state"), payload.get("election"), payload.get("native")
        if not isinstance(state_block, dict) or str(state_block.get("code", "")).upper() != state or not isinstance(election, dict) or election.get("year") != 2024 or not isinstance(native, dict):
            report_states[state] = {**identity, "status": "inconclusive", "reason": "fixed artifact has an unexpected state, election year, or structure"}
            continue
        rows, historical_rows = native.get("resultRows"), native.get("historicalRows")
        if not isinstance(rows, list) or not isinstance(historical_rows, list) or not all(isinstance(row, dict) for row in rows + historical_rows):
            report_states[state] = {**identity, "status": "inconclusive", "reason": "fixed artifact row collections are malformed"}
            continue
        counts = {"rows": len(rows), "canonicalGeography": 0, "unknownGeography": 0, "stateTagMismatch": 0, "validRecordedTotalVotes": 0, "missingRecordedTotalVotes": 0, "invalidRecordedTotalVotes": 0}
        historical = {"rows": len(historical_rows), "years": sorted({row.get("electionYear") for row in historical_rows if isinstance(row.get("electionYear"), int) and not isinstance(row.get("electionYear"), bool)}), "canonicalGeography": 0, "unknownGeography": 0, "stateTagMismatch": 0, "sourceIds": []}
        source_ids: set[str] = set()
        for row in rows:
            tag = row.get("jurisdictionTag")
            if isinstance(tag, str) and tag in registry:
                counts["canonicalGeography"] += 1
                if registry[tag] != state: counts["stateTagMismatch"] += 1
            else: counts["unknownGeography"] += 1
            if "totalVotes" not in row: counts["missingRecordedTotalVotes"] += 1
            elif _safe_total(row.get("totalVotes")): counts["validRecordedTotalVotes"] += 1
            else: counts["invalidRecordedTotalVotes"] += 1
            if row.get("sourceId"): source_ids.add(str(row["sourceId"]))
        historical_source_ids: set[str] = set()
        for row in historical_rows:
            tag = row.get("jurisdictionTag")
            if isinstance(tag, str) and tag in registry:
                historical["canonicalGeography"] += 1
                if registry[tag] != state: historical["stateTagMismatch"] += 1
            else: historical["unknownGeography"] += 1
            if row.get("sourceId"): historical_source_ids.add(str(row["sourceId"]))
        historical["sourceIds"] = sorted(historical_source_ids)
        report_states[state] = {**identity, "status": "readiness_counts_only", "counts": counts, "historical": historical, "sourceIds": sorted(source_ids), "sourceDigestVerification": "unverified unless a separately reviewed artifact digest is supplied; no certification claim"}
    implementation = Path(__file__).read_bytes()
    spec = json.dumps(MODEL_SPECIFICATION, sort_keys=True, separators=(",", ":")).encode()
    return {"experimental": True, "publicationEligible": False, "electionForecastingSupported": False, "modelVersion": MODEL_VERSION, "implementationSha256": sha256(implementation).hexdigest(), "modelSpecificationSha256": sha256(spec + b"\0" + implementation).hexdigest(), "states": report_states}


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthetic-only model QA and staging readiness")
    parser.add_argument("--states", required=True)
    parser.add_argument("--seed", type=int, default=20260908)
    args = parser.parse_args()
    states = [value for value in args.states.split(",") if value]
    print(json.dumps({"syntheticQa": simulation_based_calibration(seed=args.seed), "dataReadiness": inspect_staging_readiness(states)}, sort_keys=True))


if __name__ == "__main__":
    main()
