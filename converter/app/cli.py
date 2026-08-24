"""Local entry point for driving one conversion by hand.

    python -m app.cli convert samples/bracket.step out/bracket.glb

Used during the OCCT spike, before the worker loop exists.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.pipeline import convert


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    convert_cmd = sub.add_parser("convert", help="convert one file to .glb")
    convert_cmd.add_argument("source", type=Path)
    convert_cmd.add_argument("output", type=Path)

    args = parser.parse_args(argv)

    if args.command == "convert":
        args.output.parent.mkdir(parents=True, exist_ok=True)
        result = convert(args.source, args.output)
        print(json.dumps(result.metadata.model_dump(), indent=2))
        print(
            f"wrote {result.glb_path} "
            f"({result.triangle_count} triangles, deflection {result.deflection})"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
