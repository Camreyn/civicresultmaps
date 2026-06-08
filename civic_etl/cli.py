from __future__ import annotations

import argparse
import json
import sys

from .pipeline import build_staging_artifact, load_config, validate_config, write_staging_artifact


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="civic-etl")
    subcommands = parser.add_subparsers(dest="command", required=True)

    validate_parser = subcommands.add_parser("validate")
    validate_parser.add_argument("--config", required=True)

    import_parser = subcommands.add_parser("import")
    import_parser.add_argument("--config", required=True)
    import_parser.add_argument("--out", required=True)

    args = parser.parse_args(argv)
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
