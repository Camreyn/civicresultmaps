from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pipeline import build_staging_artifact, load_config, validate_config, write_staging_artifact


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="civic-etl")
    subcommands = parser.add_subparsers(dest="command", required=True)

    validate_parser = subcommands.add_parser("validate")
    validate_parser.add_argument("--config", required=True)

    validate_all_parser = subcommands.add_parser("validate-all")
    validate_all_parser.add_argument("--config-dir", required=True)
    validate_all_parser.add_argument("--out")

    import_parser = subcommands.add_parser("import")
    import_parser.add_argument("--config", required=True)
    import_parser.add_argument("--out", required=True)

    args = parser.parse_args(argv)

    if args.command == "validate-all":
        config_paths = sorted(Path(args.config_dir).glob("*.json"))
        if not config_paths:
            print(json.dumps({"passed": False, "errors": [f"no config files found in {args.config_dir}"]}, indent=2), file=sys.stderr)
            return 1

        summaries = []
        errors = []
        for config_path in config_paths:
            config = load_config(config_path)
            report = validate_config(config)
            if not report.passed:
                errors.append({"config": str(config_path), "errors": report.errors})
                summaries.append({"config": str(config_path), "state": config.code, "passed": False})
                continue

            try:
                artifact = build_staging_artifact(config, report)
            except Exception as error:
                errors.append({"config": str(config_path), "errors": [str(error)]})
                summaries.append({"config": str(config_path), "state": config.code, "passed": False})
                continue

            if "native" not in artifact:
                errors.append({"config": str(config_path), "errors": ["config did not produce a native staging payload"]})
                summaries.append({"config": str(config_path), "state": config.code, "passed": False})
                continue

            artifact_path = str(write_staging_artifact(artifact, args.out)) if args.out else None
            summaries.append(
                {
                    "config": str(config_path),
                    "state": config.code,
                    "passed": True,
                    "artifact": artifact_path,
                    "metrics": artifact["native"].get("metrics", {}),
                }
            )

        result = {"passed": not errors, "checked": len(config_paths), "errors": errors, "summary": summaries}
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0 if not errors else 1

    config = load_config(args.config)
    report = validate_config(config)

    if args.command == "validate":
        print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
        return 0 if report.passed else 1

    if args.command == "import":
        if not report.passed:
            print(json.dumps(report.to_dict(), indent=2, sort_keys=True), file=sys.stderr)
            return 1

        artifact = build_staging_artifact(config, report)
        path = write_staging_artifact(artifact, args.out)
        print(str(path))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
