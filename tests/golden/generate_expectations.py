"""Regenerate ``tests/golden/expectations.json`` from the current recognisers.

Usage::

    python -m tests.golden.generate_expectations
    python -m tests.golden.generate_expectations --tolerance 0.002

The generated file is a *baseline snapshot*, not a specification.  Review every
diff before committing it: a changed page or a large score drop is a regression
until proven otherwise.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / 'tests' / 'golden'
DEFAULT_IMAGES = GOLDEN / 'images'
DEFAULT_OUT = GOLDEN / 'expectations.json'
SCHEMA_VERSION = 1


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 6)


def _source_info(rel: str, fixture_map: dict[str, object]) -> tuple[str, str, str | None]:
    """Return ``(source, origin, fixture_template)`` for a relative image path."""

    name = Path(rel).name
    if rel.startswith('pages/'):
        spec = fixture_map.get(name)
        if spec is None:
            return 'synthetic', f'fixture:{name}', None
        template = getattr(spec, 'template', None)
        if template:
            return 'synthetic', f'autowsgr:data/images/{template}', template
        return 'synthetic', 'autowsgr:page-signature/CHOOSE_SHIP', None
    if rel.startswith('real/nav_error/'):
        return 'real_nav_error', f'logs/images/{name}', None
    if rel.startswith('real/expedition/'):
        return 'real_expedition', f'logs/2026-10-29_02-09-36/images/{name}', None
    if rel.startswith('real/login/'):
        return 'real_login', f'logs/2026-10-29_10-29-27/images/{name}', None
    if rel.startswith('real/session/'):
        session = Path(rel).parts[2]
        return 'real_session', f'logs/{session}/images/{name}', None
    return 'unknown', rel, None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Regenerate golden expectations')
    parser.add_argument('--images', type=Path, default=DEFAULT_IMAGES)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--tolerance', type=float, default=0.002)
    args = parser.parse_args(argv)

    import cv2
    import numpy
    from loguru import logger

    logger.remove()
    logger.add(sys.stderr, level='ERROR')

    import autowsgr
    import autowsgr.ui  # noqa: F401 - registers page checkers
    from autowsgr.combat.recognizer import CombatRecognizer
    from autowsgr.combat.state import CombatPhase
    from autowsgr.ui.page import dump_page_scores, get_current_page, get_registered_pages

    from tests.golden.page_fixtures import fixture_specs

    fixture_map = {spec.filename: spec for spec in fixture_specs()}
    paths = sorted(args.images.rglob('*.png'))
    if not paths:
        print(f'no PNG files under {args.images}', file=sys.stderr)
        return 2

    started = time.time()
    images: dict[str, dict[str, object]] = {}
    for index, path in enumerate(paths, 1):
        rel = path.relative_to(args.images).as_posix()
        image = cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)
        page = get_current_page(image)
        rows = dump_page_scores(image)
        if page is not None:
            row = next((r for r in rows if r[0] == page), None)
        else:
            row = rows[0] if rows else None
        if row is None:
            row = (None, 0.0, False, None)
        top = rows[0] if rows else row
        phase = CombatRecognizer.identify_current(image, list(CombatPhase))
        source, origin, fixture_template = _source_info(rel, fixture_map)
        images[rel] = {
            'source': source,
            'origin': origin,
            'fixture_template': fixture_template,
            'expected_page': page,
            'expected_score': _round(row[1]),
            'expected_threshold': _round(row[3]),
            'expected_matched': bool(page is not None and row[2]),
            'top_page': top[0],
            'top_score': _round(top[1]),
            'top_threshold': _round(top[3]),
            'top_matched': bool(top[2]),
            'combat_phase': phase.name if phase is not None else None,
            'shape': list(image.shape),
        }
        if index % 10 == 0:
            print(f'  recognised {index}/{len(paths)}', flush=True)

    registered = get_registered_pages()
    covered = sorted({entry['expected_page'] for entry in images.values() if entry['expected_page']})
    real_pages = sorted(
        {
            entry['expected_page']
            for entry in images.values()
            if entry['expected_page'] and entry['source'].startswith('real_')
        }
    )
    fixture_only = sorted(set(covered) - set(real_pages))
    missing = sorted(set(registered) - set(covered))
    source_counts: dict[str, int] = {}
    page_counts: dict[str, int] = {}
    for entry in images.values():
        source_counts[entry['source']] = source_counts.get(entry['source'], 0) + 1
        page = entry['expected_page'] or 'UNKNOWN'
        page_counts[page] = page_counts.get(page, 0) + 1

    payload = {
        'schema_version': SCHEMA_VERSION,
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'generator': 'tests/golden/generate_expectations.py',
        'score_tolerance': args.tolerance,
        'recognition': {
            'entry': 'autowsgr.ui.page.get_current_page',
            'candidates': None,
            'combat_phase': 'autowsgr.combat.recognizer.CombatRecognizer.identify_current',
        },
        'environment': {
            'python': platform.python_version(),
            'opencv': cv2.__version__,
            'numpy': numpy.__version__,
            'autowsgr': getattr(autowsgr, '__version__', None),
        },
        'summary': {
            'total': len(images),
            'sources': dict(sorted(source_counts.items())),
            'by_page': dict(sorted(page_counts.items())),
            'registered_pages': registered,
            'covered_pages': covered,
            'missing_pages': missing,
            'real_page_coverage': real_pages,
            'fixture_only_pages': fixture_only,
        },
        'images': images,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )

    elapsed = time.time() - started
    print(
        f'wrote {args.out} ({len(images)} images, {elapsed:.1f}s); '
        f'pages {len(covered)}/{len(registered)} covered'
    )
    if real_pages:
        print('real screenshot pages: ' + ', '.join(real_pages))
    if fixture_only:
        print('fixture-only pages: ' + ', '.join(fixture_only))
    if missing:
        print('MISSING registered pages: ' + ', '.join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
