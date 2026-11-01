"""AST audit: direct controller clicks and ``time.sleep`` calls.

Usage (from the repository root)::

    python tests\\audit_click_sleep.py
    python tests\\audit_click_sleep.py --check
    python tests\\audit_click_sleep.py --write-baseline --strict ui/decisive/map_controller.py

The audit intentionally counts **direct controller clicks** (``ctrl.click`` /
``self._ctrl.click`` / ``ctx.ctrl.click``) and ``time.sleep`` calls only.
Closed-loop primitives such as ``click_and_wait_for_page`` / ``act_and_wait``
are not counted as naked clicks.

``--check`` compares against ``tests/audit_click_sleep_baseline.json``;
files listed in ``must_decrease`` must show a strictly lower total
(clicks + sleeps) than the baseline, and neither metric may increase.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / 'python' / 'site-packages' / 'autowsgr'
DEFAULT_BASELINE = Path(__file__).with_name('audit_click_sleep_baseline.json')


@dataclass
class FileAudit:
    """Per-file counters."""

    clicks: int = 0
    sleeps: int = 0

    @property
    def total(self) -> int:
        return self.clicks + self.sleeps

    def as_dict(self) -> dict[str, int]:
        return {'clicks': self.clicks, 'sleeps': self.sleeps}


@dataclass
class AuditResult:
    """Whole-tree audit result."""

    files: dict[str, FileAudit] = field(default_factory=dict)

    @property
    def clicks(self) -> int:
        return sum(item.clicks for item in self.files.values())

    @property
    def sleeps(self) -> int:
        return sum(item.sleeps for item in self.files.values())


def _attr_chain(node: ast.AST) -> tuple[str, ...]:
    """Return an attribute chain such as ``('self', '_ctrl', 'click')``."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return tuple(reversed(parts))


def _is_direct_click(call: ast.Call) -> bool:
    chain = _attr_chain(call.func)
    if not chain or chain[-1] != 'click':
        return False
    return any(part in {'ctrl', '_ctrl'} for part in chain[:-1])


def _is_sleep(call: ast.Call) -> bool:
    chain = _attr_chain(call.func)
    return bool(chain) and chain[-1] == 'sleep'


def audit_tree(source: Path) -> AuditResult:
    """Parse every ``*.py`` under *source* and count clicks/sleeps."""
    result = AuditResult()
    for path in sorted(source.rglob('*.py')):
        rel = path.relative_to(source).as_posix()
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except (OSError, SyntaxError) as exc:
            print(f'[WARN] skip {path}: {exc}', file=sys.stderr)
            continue
        item = FileAudit()
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if _is_direct_click(node):
                item.clicks += 1
            if _is_sleep(node):
                item.sleeps += 1
        if item.total:
            result.files[rel] = item
    return result


def _print_summary(result: AuditResult, *, top: int) -> None:
    print(f'AST audit: {DEFAULT_SOURCE}')
    print(f'  direct controller clicks: {result.clicks}')
    print(f'  time.sleep calls: {result.sleeps}')
    ranked = sorted(
        result.files.items(),
        key=lambda pair: (pair[1].total, pair[1].sleeps, pair[1].clicks),
        reverse=True,
    )
    if not ranked:
        return
    print(f'  top {min(top, len(ranked))} files by total:')
    for rel, item in ranked[:top]:
        print(f'    {rel}: clicks={item.clicks} sleeps={item.sleeps} total={item.total}')


def _write_baseline(
    source: Path,
    baseline: Path,
    strict: list[str],
    must_not_increase: list[str],
) -> int:
    result = audit_tree(source)
    # 0 命中的 strict 文件也要写入基线，否则 --check 会因“基线缺文件”误报。
    for rel in set(strict) | set(must_not_increase):
        result.files.setdefault(rel, FileAudit())
    payload = {
        'source': source.relative_to(ROOT).as_posix() if source.is_relative_to(ROOT) else str(source),
        'totals': {'clicks': result.clicks, 'sleeps': result.sleeps},
        'files': {rel: item.as_dict() for rel, item in sorted(result.files.items())},
        'must_decrease': sorted(set(strict)),
        'must_not_increase': sorted(set(must_not_increase)),
    }
    baseline.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'wrote baseline: {baseline}')
    _print_summary(result, top=20)
    return 0


def _check_baseline(
    source: Path,
    baseline: Path,
    cli_strict: list[str],
    cli_must_not_increase: list[str],
) -> int:
    if not baseline.exists():
        print(f'缺少基线文件: {baseline}', file=sys.stderr)
        return 2
    payload = json.loads(baseline.read_text(encoding='utf-8'))
    baseline_files: dict[str, dict[str, int]] = payload.get('files', {})
    strict = sorted(set(payload.get('must_decrease', [])) | set(cli_strict))
    must_not_increase = sorted(
        set(payload.get('must_not_increase', [])) | set(cli_must_not_increase)
    )
    current = audit_tree(source)
    failures: list[str] = []

    print(f'AST audit check: {source}')
    print(f'  baseline: {baseline}')
    print(f'  current totals: clicks={current.clicks} sleeps={current.sleeps}')
    print(f'  must decrease: {", ".join(strict) if strict else "(none)"}')
    print(
        '  must not increase: '
        f'{", ".join(must_not_increase) if must_not_increase else "(none)"}'
    )
    for rel in sorted(set(strict) | set(must_not_increase)):
        old = baseline_files.get(rel)
        if old is None:
            failures.append(f'{rel}: 基线中缺少该文件')
            print(f'  [FAIL] {rel}: 基线中缺少该文件')
            continue
        new = current.files.get(rel, FileAudit())
        old_total = int(old.get('clicks', 0)) + int(old.get('sleeps', 0))
        old_clicks = int(old.get('clicks', 0))
        old_sleeps = int(old.get('sleeps', 0))
        if new.clicks > old_clicks or new.sleeps > old_sleeps:
            failures.append(
                f'{rel}: 指标上升 clicks {old_clicks}->{new.clicks}, '
                f'sleeps {old_sleeps}->{new.sleeps}'
            )
            print(
                f'  [FAIL] {rel}: clicks {old_clicks}->{new.clicks}, '
                f'sleeps {old_sleeps}->{new.sleeps}'
            )
        elif rel in strict and new.total >= old_total:
            failures.append(
                f'{rel}: 总数未下降 {old_total}->{new.total} '
                f'(clicks {old_clicks}->{new.clicks}, sleeps {old_sleeps}->{new.sleeps})'
            )
            print(
                f'  [FAIL] {rel}: total {old_total}->{new.total}, '
                f'clicks {old_clicks}->{new.clicks}, sleeps {old_sleeps}->{new.sleeps}'
            )
        else:
            marker = 'OK/decreased' if new.total < old_total else 'OK/no-increase'
            print(
                f'  [{marker}] {rel}: clicks {old_clicks}->{new.clicks}, '
                f'sleeps {old_sleeps}->{new.sleeps}, total {old_total}->{new.total}'
            )

    if failures:
        print('结果: FAIL')
        for failure in failures:
            print(f'  - {failure}')
        return 1
    print('结果: PASS')
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='AST click/sleep audit')
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--baseline', type=Path, default=DEFAULT_BASELINE)
    parser.add_argument('--write-baseline', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument(
        '--strict',
        action='append',
        default=[],
        help='file path relative to --source that must decrease (repeatable)',
    )
    parser.add_argument(
        '--must-not-increase',
        action='append',
        default=[],
        help='file path relative to --source that must not increase (repeatable)',
    )
    parser.add_argument('--top', type=int, default=15)
    args = parser.parse_args(argv)

    if not args.source.exists():
        print(f'源目录不存在: {args.source}', file=sys.stderr)
        return 2
    if args.write_baseline:
        return _write_baseline(
            args.source,
            args.baseline,
            args.strict,
            args.must_not_increase,
        )
    if args.check:
        return _check_baseline(
            args.source,
            args.baseline,
            args.strict,
            args.must_not_increase,
        )
    _print_summary(audit_tree(args.source), top=args.top)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
