"""Golden-set page recognition regression test.

Usage (from the repository root)::

    python\\python.exe tests\\run_golden.py
    python\\python.exe tests\\run_golden.py --quiet
    python\\python.exe tests\\run_golden.py --tolerance 0.002

The script intentionally uses only the standard library at import time so a
system Python without OpenCV can re-exec the bundled interpreter and still
work.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / 'tests' / 'golden'
DEFAULT_IMAGES = GOLDEN / 'images'
DEFAULT_EXPECTATIONS = GOLDEN / 'expectations.json'
SCHEMA_VERSION = 1


def _maybe_reexec() -> None:
    """Re-exec with the bundled interpreter when OpenCV is unavailable."""

    if os.environ.get('AUTOWSGR_GOLDEN_REEXEC') == '1':
        return
    try:
        import cv2  # noqa: F401
    except Exception:
        pass
    else:
        return

    bundled = ROOT / 'python' / 'python.exe'
    if not bundled.exists() or Path(sys.executable).resolve() == bundled.resolve():
        print(
            '当前 Python 缺少 cv2/autowsgr。请使用随程序附带的解释器运行：\n'
            f'  {bundled} tests\\run_golden.py',
            file=sys.stderr,
        )
        raise SystemExit(2)

    os.chdir(ROOT)
    env = os.environ.copy()
    env['AUTOWSGR_GOLDEN_REEXEC'] = '1'
    entry = ROOT / 'tests' / 'run_golden.py'
    os.execve(str(bundled), [str(bundled), str(entry), *sys.argv[1:]], env)


def _enable_windows_ansi() -> bool:
    if os.name != 'nt':
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_uint32()
        if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            return False
        return bool(kernel32.SetConsoleMode(handle, mode.value | 0x0004))
    except Exception:
        return False


def _load_runtime() -> dict[str, object]:
    from loguru import logger

    logger.remove()
    logger.add(sys.stderr, level='ERROR')

    import cv2
    import numpy

    import autowsgr
    import autowsgr.ui  # noqa: F401 - registers page checkers
    from autowsgr.combat.recognizer import CombatRecognizer
    from autowsgr.combat.state import CombatPhase
    from autowsgr.ui.page import (
        dump_page_scores,
        get_current_page,
        get_registered_pages,
    )

    return {
        'cv2': cv2,
        'numpy': numpy,
        'autowsgr': autowsgr,
        'CombatRecognizer': CombatRecognizer,
        'CombatPhase': CombatPhase,
        'dump_page_scores': dump_page_scores,
        'get_current_page': get_current_page,
        'get_registered_pages': get_registered_pages,
    }


def _find_row(rows: list[tuple], name: str | None) -> tuple | None:
    if name is None:
        return None
    return next((row for row in rows if row[0] == name), None)


def _page_display(page: str | None) -> str:
    return page if page is not None else 'UNKNOWN'


def _fmt_threshold(value: float | None) -> str:
    return '-' if value is None else f'{float(value):.6f}'


def _thresholds_equal(left: float | None, right: float | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return abs(float(left) - float(right)) <= 1e-9


def _color(text: str, code: str, enabled: bool) -> str:
    return f'\033[{code}m{text}\033[0m' if enabled else text


def _print_failure(
    *,
    rel: str,
    path: Path,
    reasons: list[str],
    expected_page: str | None,
    actual_page: str | None,
    expected_score: float,
    actual_score: float,
    expected_threshold: float | None,
    actual_threshold: float | None,
    expected_page_score: float | None,
    expected_phase: str | None,
    actual_phase: str | None,
    tolerance: float,
    top_rows: list[tuple],
    red,
) -> None:
    delta = actual_score - expected_score
    print(f'{red("[FAIL]")} {rel}')
    print(f'  图片路径: {path}')
    print(f'  期望页面: {_page_display(expected_page)}')
    print(f'  实际页面: {_page_display(actual_page)}')
    print(f'  期望得分: {expected_score:.6f}')
    print(f'  实际得分: {actual_score:.6f}')
    print(f'  得分差: {delta:+.6f} (容差 {tolerance:.6f})')
    print(f'  期望阈值: {_fmt_threshold(expected_threshold)}')
    print(f'  实际阈值: {_fmt_threshold(actual_threshold)}')
    if expected_page_score is not None and expected_page_score != actual_score:
        print(f'  期望页原始分: {expected_page_score:.6f}')
    print(f'  战斗阶段: 期望 {expected_phase or "-"} / 实际 {actual_phase or "-"}')
    print(f'  判定: {", ".join(reasons)}')
    if top_rows:
        top = ', '.join(
            f'{row[0]}={float(row[1]):.3f}/thr={_fmt_threshold(row[3])}'
            f'{"*" if row[2] else ""}'
            for row in top_rows
        )
        print(f'  Top: {top}')


def main(argv: list[str] | None = None) -> int:
    _maybe_reexec()

    parser = argparse.ArgumentParser(description='Golden-set recognition regression')
    parser.add_argument('--images', type=Path, default=DEFAULT_IMAGES)
    parser.add_argument('--expectations', type=Path, default=DEFAULT_EXPECTATIONS)
    parser.add_argument('--tolerance', type=float, default=None)
    parser.add_argument('--context', type=int, default=5)
    parser.add_argument('--quiet', action='store_true')
    parser.add_argument(
        '--color',
        choices=('auto', 'always', 'never'),
        default='auto',
        help='ANSI colour mode (default: auto)',
    )
    args = parser.parse_args(argv)

    color_enabled = args.color == 'always' or (
        args.color == 'auto' and sys.stdout.isatty() and _enable_windows_ansi()
    )
    green = lambda text: _color(text, '92', color_enabled)  # noqa: E731
    red = lambda text: _color(text, '91', color_enabled)  # noqa: E731
    yellow = lambda text: _color(text, '93', color_enabled)  # noqa: E731

    if not args.expectations.exists():
        print(f'缺少基线文件: {args.expectations}', file=sys.stderr)
        return 2
    payload = json.loads(args.expectations.read_text(encoding='utf-8'))
    if payload.get('schema_version') != SCHEMA_VERSION:
        print(
            f'基线版本不匹配: {payload.get("schema_version")} != {SCHEMA_VERSION}',
            file=sys.stderr,
        )
        return 2
    expected_images: dict[str, dict] = payload.get('images', {})
    tolerance = (
        args.tolerance
        if args.tolerance is not None
        else float(payload.get('score_tolerance', 0.002))
    )

    try:
        runtime = _load_runtime()
    except Exception as exc:
        print(f'无法加载识别运行时: {exc}', file=sys.stderr)
        print(
            '请使用随程序附带的解释器：python\\python.exe tests\\run_golden.py',
            file=sys.stderr,
        )
        return 2

    cv2 = runtime['cv2']
    get_current_page = runtime['get_current_page']
    dump_page_scores = runtime['dump_page_scores']
    get_registered_pages = runtime['get_registered_pages']
    CombatRecognizer = runtime['CombatRecognizer']
    CombatPhase = runtime['CombatPhase']

    actual_files = {
        path.relative_to(args.images).as_posix(): path
        for path in sorted(args.images.rglob('*.png'))
    }
    expected_files = set(expected_images)
    actual_set = set(actual_files)
    missing_files = sorted(expected_files - actual_set)
    extra_files = sorted(actual_set - expected_files)

    started = time.time()
    total = passed = failed = 0
    real_total = real_passed = 0
    synthetic_total = synthetic_passed = 0
    failures: list[str] = []
    covered_pages: set[str] = set()

    print('Golden recognition regression')
    print(f'  images: {args.images}')
    print(f'  expectations: {args.expectations}')
    print(f'  score tolerance: {tolerance:.6f}')
    print(f'  registered pages: {len(get_registered_pages())}')
    print()

    for rel in sorted(expected_files | actual_set):
        total += 1
        entry = expected_images.get(rel)
        source = entry.get('source', 'unknown') if entry else 'unknown'
        is_real = source.startswith('real_')
        if is_real:
            real_total += 1
        elif source == 'synthetic':
            synthetic_total += 1

        if entry is None:
            failed += 1
            message = f'expectations.json 缺少该图片: {rel}'
            failures.append(message)
            print(f'{red("[FAIL]")} {rel}\n  图片路径: {actual_files[rel]}\n  判定: {message}')
            continue
        if rel not in actual_files:
            failed += 1
            message = f'图片文件缺失: {rel}'
            failures.append(message)
            print(f'{red("[FAIL]")} {rel}\n  判定: {message}')
            continue

        path = actual_files[rel]
        image = cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)
        if image is None:
            failed += 1
            message = f'无法读取图片: {path}'
            failures.append(message)
            print(f'{red("[FAIL]")} {rel}\n  图片路径: {path}\n  判定: {message}')
            continue

        try:
            actual_page = get_current_page(image)
            rows = dump_page_scores(image)
            phase = CombatRecognizer.identify_current(image, list(CombatPhase))
            actual_phase = phase.name if phase is not None else None
        except Exception as exc:
            failed += 1
            message = f'识别过程异常: {type(exc).__name__}: {exc}'
            failures.append(f'{rel}: {message}')
            print(f'{red("[FAIL]")} {rel}\n  图片路径: {path}\n  判定: {message}')
            print()
            continue

        expected_page = entry.get('expected_page')
        expected_score = float(entry.get('expected_score', 0.0))
        expected_threshold = entry.get('expected_threshold')
        expected_phase = entry.get('combat_phase')
        if expected_page is not None:
            covered_pages.add(expected_page)

        actual_row = _find_row(rows, actual_page)
        if actual_row is None:
            actual_row = rows[0] if rows else (None, 0.0, False, None)
        actual_score = float(actual_row[1])
        actual_threshold = actual_row[3]

        if expected_page is not None:
            expected_row = _find_row(rows, expected_page)
            expected_page_score = float(expected_row[1]) if expected_row else -1.0
            score_to_compare = expected_page_score
            threshold_to_compare = expected_row[3] if expected_row else None
        else:
            expected_page_score = None
            score_to_compare = actual_score
            threshold_to_compare = actual_threshold

        page_ok = actual_page == expected_page
        score_ok = abs(score_to_compare - expected_score) <= tolerance
        threshold_ok = _thresholds_equal(expected_threshold, threshold_to_compare)
        phase_ok = actual_phase == expected_phase

        reasons: list[str] = []
        if not page_ok:
            reasons.append('页面不一致')
        if not score_ok:
            reasons.append('得分超出容差')
        if not threshold_ok:
            reasons.append('阈值变化')
        if not phase_ok:
            reasons.append('战斗阶段不一致')

        if reasons:
            failed += 1
            failures.append(f'{rel}: ' + ', '.join(reasons))
            _print_failure(
                rel=rel,
                path=path,
                reasons=reasons,
                expected_page=expected_page,
                actual_page=actual_page,
                expected_score=expected_score,
                actual_score=actual_score,
                expected_threshold=expected_threshold,
                actual_threshold=actual_threshold,
                expected_page_score=expected_page_score,
                expected_phase=expected_phase,
                actual_phase=actual_phase,
                tolerance=tolerance,
                top_rows=rows[: max(args.context, 0)],
                red=red,
            )
            print()
            continue

        passed += 1
        if is_real:
            real_passed += 1
        elif source == 'synthetic':
            synthetic_passed += 1
        if not args.quiet:
            threshold_text = _fmt_threshold(expected_threshold)
            phase_text = f' phase={actual_phase}' if actual_phase else ''
            print(
                f'{green("[PASS]")} {rel} -> {_page_display(actual_page)} '
                f'(score={actual_score:.6f}, thr={threshold_text}){phase_text}'
            )

    registered = set(get_registered_pages())
    missing_pages = sorted(registered - covered_pages)
    if missing_pages:
        failed += 1
        message = '注册页面未被 golden set 覆盖: ' + ', '.join(missing_pages)
        failures.append(message)
        print(f'{red("[FAIL]")} {message}')

    elapsed = time.time() - started
    print()
    print(f'真实截图: {real_passed}/{real_total} PASS')
    print(f'页面夹具: {synthetic_passed}/{synthetic_total} PASS')
    print(f'总计: {passed}/{total} PASS, {failed} FAIL, {len(missing_files)} 缺图, {len(extra_files)} 多图')
    print(
        f'页面覆盖: {len(covered_pages)}/{len(registered)} registered '
        f'({len(missing_pages)} missing)'
    )
    if extra_files:
        print(yellow('expectations.json 未收录的图片: ' + ', '.join(extra_files)))
    if failures:
        print('失败明细:')
        for failure in failures:
            print(f'  - {failure}')
    print(f'耗时: {elapsed:.1f}s')
    print(green('结果: PASS') if failed == 0 else red('结果: FAIL'))
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
