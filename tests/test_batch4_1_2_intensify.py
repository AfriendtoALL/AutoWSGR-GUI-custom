"""Fake-device regressions for batch 4.1.2 (ops/intensify.py).

Run with::

    python tests\\test_batch4_1_2_intensify.py -v

The 16 former fixed sleeps in ``auto_intensify`` are now six small helpers.
These tests pin their success/failure semantics without touching a real device.
"""

from __future__ import annotations

import ast
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from autowsgr.infra.exceptions import NavigationError
from autowsgr.ops.intensify import (
    _ANIMATION_CONFIG,
    _CLICK_CONFIRM_DIALOG,
    _CLICK_DISMISS_ANIMATION,
    _CLICK_INTENSIFY_BUTTON,
    _CLICK_MATERIAL_CONFIRM,
    _CLICK_TARGET_CLOSE,
    _close_material_selector_after_skip,
    _confirm_intensify_dialog,
    _confirm_target_materials,
    _dismiss_intensify_animation,
    _open_intensify_confirmation,
    _select_target_and_wait_home,
    _wait_stable,
)
from autowsgr.ui.material_first_intensify import is_intensify_home_screen


ROOT = Path(__file__).resolve().parents[1]
INTENSIFY_SOURCE = ROOT / 'python' / 'site-packages' / 'autowsgr' / 'ops' / 'intensify.py'


class FakeDevice:
    def __init__(self) -> None:
        self.clicks: list[tuple[float, float]] = []
        self.screen = np.zeros((8, 8, 3), dtype=np.uint8)

    def screenshot(self) -> np.ndarray:
        return self.screen

    def click(self, x: float, y: float, *, delay: bool = True) -> None:
        self.clicks.append((x, y))


class FakeCtx:
    def __init__(self) -> None:
        self.stop_event = threading.Event()


class SelectTargetTests(unittest.TestCase):
    def test_select_target_success_uses_home_checker(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()
        expected = np.ones((8, 8, 3), dtype=np.uint8)

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            return_value=expected,
        ) as click_wait:
            selected = _select_target_and_wait_home(
                ctx, device, (0.2, 0.3), source='test-target'
            )

        self.assertTrue(selected)
        click_wait.assert_called_once()
        self.assertEqual(click_wait.call_args.args[1], (0.2, 0.3))
        self.assertIs(click_wait.call_args.args[2], is_intensify_home_screen)
        self.assertIs(click_wait.call_args.kwargs['stop_event'], ctx.stop_event)

    def test_select_target_timeout_returns_false(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            side_effect=NavigationError('timeout'),
        ):
            selected = _select_target_and_wait_home(
                ctx, device, (0.2, 0.3), source='test-target'
            )

        self.assertFalse(selected)
        self.assertEqual(device.clicks, [])


class MaterialConfirmTests(unittest.TestCase):
    def test_confirm_materials_returns_home_screen(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()
        expected = np.full((8, 8, 3), 7, dtype=np.uint8)

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            return_value=expected,
        ) as click_wait:
            screen = _confirm_target_materials(ctx, device)

        self.assertIs(screen, expected)
        self.assertEqual(click_wait.call_args.args[1], _CLICK_MATERIAL_CONFIRM)
        self.assertIs(click_wait.call_args.args[2], is_intensify_home_screen)

    def test_confirm_materials_timeout_raises_runtime(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            side_effect=NavigationError('timeout'),
        ):
            with self.assertRaisesRegex(RuntimeError, '素材确认后未正常返回强化首页'):
                _confirm_target_materials(ctx, device)


class IntensifyTransitionTests(unittest.TestCase):
    def test_open_confirmation_returns_true_when_modal_visible(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with (
            patch('autowsgr.ops.intensify.click_and_wait_for_page') as click_wait,
            patch(
                'autowsgr.ops.intensify.is_intensify_confirmation',
                return_value=True,
            ),
        ):
            opened = _open_intensify_confirmation(ctx, device)

        self.assertTrue(opened)
        self.assertEqual(click_wait.call_args.args[1], _CLICK_INTENSIFY_BUTTON)

    def test_open_confirmation_timeout_degrades_to_false(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with (
            patch(
                'autowsgr.ops.intensify.click_and_wait_for_page',
                side_effect=NavigationError('timeout'),
            ),
            patch(
                'autowsgr.ops.intensify.is_intensify_confirmation',
                return_value=False,
            ),
        ):
            opened = _open_intensify_confirmation(ctx, device)

        self.assertFalse(opened)
        self.assertEqual(device.clicks, [])

    def test_confirm_dialog_timeout_warns_without_raising(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with patch(
            'autowsgr.ops.intensify.click_and_wait_leave_page',
            side_effect=NavigationError('timeout'),
        ):
            _confirm_intensify_dialog(ctx, device)

        self.assertEqual(device.clicks, [])

    def test_dismiss_animation_success_returns_home_screen(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()
        expected = np.full((8, 8, 3), 9, dtype=np.uint8)

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            return_value=expected,
        ) as click_wait:
            screen = _dismiss_intensify_animation(ctx, device)

        self.assertIs(screen, expected)
        self.assertEqual(click_wait.call_args.args[1], _CLICK_DISMISS_ANIMATION)
        self.assertIs(click_wait.call_args.kwargs['config'], _ANIMATION_CONFIG)

    def test_dismiss_animation_failure_returns_last_frame(self) -> None:
        device = FakeDevice()
        device.screen = np.full((8, 8, 3), 11, dtype=np.uint8)
        ctx = FakeCtx()

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            side_effect=NavigationError('timeout'),
        ):
            screen = _dismiss_intensify_animation(ctx, device)

        self.assertIs(screen, device.screen)


class CleanupAndStableWaitTests(unittest.TestCase):
    def test_close_material_selector_success(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            return_value=np.zeros((8, 8, 3), dtype=np.uint8),
        ) as click_wait:
            closed = _close_material_selector_after_skip(ctx, device)

        self.assertTrue(closed)
        self.assertEqual(click_wait.call_args.args[1], _CLICK_TARGET_CLOSE)

    def test_close_material_selector_failure_returns_false(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with patch(
            'autowsgr.ops.intensify.click_and_wait_for_page',
            side_effect=NavigationError('timeout'),
        ):
            closed = _close_material_selector_after_skip(ctx, device)

        self.assertFalse(closed)

    def test_wait_stable_forwards_stop_event(self) -> None:
        device = FakeDevice()
        ctx = FakeCtx()

        with patch('autowsgr.ops.intensify.wait_for_stable_screen') as stable:
            _wait_stable(ctx, device, source='test-stable', timeout=0.4)

        stable.assert_called_once()
        self.assertEqual(stable.call_args.kwargs['source'], 'test-stable')
        self.assertEqual(stable.call_args.kwargs['timeout'], 0.4)
        self.assertIs(stable.call_args.kwargs['stop_event'], ctx.stop_event)


class SourceGuardTests(unittest.TestCase):
    def test_intensify_has_no_time_sleep_left(self) -> None:
        tree = ast.parse(INTENSIFY_SOURCE.read_text(encoding='utf-8'))
        sleeps = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == 'sleep'
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == 'time'
        ]
        self.assertEqual(sleeps, [])


if __name__ == '__main__':
    unittest.main()
