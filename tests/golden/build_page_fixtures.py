"""Regenerate the synthetic page fixtures under ``tests/golden/images/pages``.

Run this only when a page anchor template or probe layout changes on purpose,
then regenerate ``expectations.json`` with ``generate_expectations.py``.

Usage::

    python -m tests.golden.build_page_fixtures
    python -m tests.golden.build_page_fixtures --check
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tests.golden.page_fixtures import fixture_specs, write_fixture  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / 'tests' / 'golden' / 'images' / 'pages'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Build synthetic page fixtures')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        '--check',
        action='store_true',
        help='compare in-memory fixtures with files; do not write',
    )
    args = parser.parse_args(argv)

    import cv2
    import numpy as np

    from tests.golden.page_fixtures import build_fixture

    specs = fixture_specs()
    if args.check:
        problems: list[str] = []
        for spec in specs:
            path = args.out / spec.filename
            if not path.exists():
                problems.append(f'{path}: missing')
                continue
            existing = cv2.imread(str(path), cv2.IMREAD_COLOR)
            expected = cv2.cvtColor(build_fixture(spec), cv2.COLOR_RGB2BGR)
            if existing is None:
                problems.append(f'{path}: cannot decode')
            elif not np.array_equal(existing, expected):
                problems.append(f'{path}: differs from generator')
        if problems:
            print('fixture check FAILED')
            for problem in problems:
                print(f'  {problem}')
            return 1
        print(f'fixture check OK: {len(specs)} files')
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    for spec in specs:
        path = write_fixture(spec, args.out)
        print(f'wrote {path.relative_to(ROOT)}')
    print(f'{len(specs)} synthetic page fixtures -> {args.out}')
    print('note: these are anchor fixtures, not real game screenshots')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
