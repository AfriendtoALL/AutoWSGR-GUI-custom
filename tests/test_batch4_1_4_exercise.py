"""Fake-controller regressions for batch 4.1.4 (ops/exercise.py).

Run with::

    python tests\\test_batch4_1_4_exercise.py -v

The four former fixed sleeps now go through ``ExerciseRunner._wait_stable``.
These tests pin the wait names/timeouts and the failure path without a device.
"""

from __future__ import annotations

import ast
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np

from autowsgr.infra.exceptions import NavigationError
from autowsgr.ops.exercise import ExerciseRunner
from autowsgr.types import ShipDamageState


ROOT = Path(__file__).resolve().parents[1]
EXERCISE_SOURCE = (
    ROOT / 'python' / 'site-packages' / 'autowsgr' / 'ops' / 'exercise.py'
)


class FakeCtrl:
    def screenshot(self) -> np.ndarray:
        return np.zeros((8, 8, 3), dtype=np.uint8)


class FakeCtx:
    def __init__(self) -> None:
        self.ctrl = FakeCtrl()
        self.stop_event = threading.Event()


def _make_runner() -> ExerciseRunner:
    return ExerciseRunner(FakeCtx(), fleet_id=2)


class WaitStableTests(unittest.TestCase):
    def test_wait_stable_forwards_stop_event(self) -> None:
        runner = _make_runner()

        with patch('autowsgr.ops.exercise.wait_for_stable_screen') as stable:
            runner._wait_stable('test-stage', timeout=0.4)

        stable.assert_called_once()
        self.assertEqual(stable.call_args.kwargs['source'], 'test-stage')
        self.assertEqual(stable.call_args.kwargs['timeout'], 0.4)
        self.assertIs(stable.call_args.kwargs['stop_event'], runner._ctx.stop_event)


class EnterExercisePageTests(unittest.TestCase):
    def test_enter_exercise_page_waits_for_panel(self) -> None:
        runner = _make_runner()
        map_page = MagicMock()

        with (
            patch('autowsgr.ops.exercise.ensure_page') as ensure,
            patch('autowsgr.ops.exercise.MapPage', return_value=map_page),
            patch.object(runner, '_wait_stable') as stable,
        ):
            runner._enter_exercise_page()

        ensure.assert_called_once()
        map_page.switch_panel.assert_called_once()
        stable.assert_called_once_with('演习-切换面板', timeout=1.5)

    def test_enter_exercise_page_propagates_switch_failure(self) -> None:
        runner = _make_runner()
        map_page = MagicMock()
        map_page.switch_panel.side_effect = NavigationError('panel failed')

        with (
            patch('autowsgr.ops.exercise.ensure_page'),
            patch('autowsgr.ops.exercise.MapPage', return_value=map_page),
            patch.object(runner, '_wait_stable') as stable,
        ):
            with self.assertRaises(NavigationError):
                runner._enter_exercise_page()

        stable.assert_not_called()


class PrepareForBattleTests(unittest.TestCase):
    def test_prepare_for_battle_waits_in_expected_order(self) -> None:
        runner = _make_runner()
        page = MagicMock()
        page.detect_ship_damage.return_value = {}

        with (
            patch(
                'autowsgr.ops.exercise.BattlePreparationPage',
                return_value=page,
            ),
            patch.object(runner, '_wait_stable') as stable,
        ):
            stats = runner._prepare_for_battle()

        self.assertEqual(
            [call.args[0] for call in stable.call_args_list],
            ['演习-出征准备', '演习-选择舰队', '演习-开始出征'],
        )
        page.select_fleet.assert_called_once_with(2)
        page.detect_ship_damage.assert_called_once()
        page.start_battle.assert_called_once()
        self.assertEqual(stats, [ShipDamageState.NORMAL] * 6)

    def test_prepare_for_battle_fleet_failure_stops_before_start(self) -> None:
        runner = _make_runner()
        page = MagicMock()
        page.select_fleet.side_effect = NavigationError('fleet failed')
        page.detect_ship_damage.return_value = {}

        with (
            patch(
                'autowsgr.ops.exercise.BattlePreparationPage',
                return_value=page,
            ),
            patch.object(runner, '_wait_stable') as stable,
        ):
            with self.assertRaises(NavigationError):
                runner._prepare_for_battle()

        page.start_battle.assert_not_called()
        self.assertEqual(
            [call.args[0] for call in stable.call_args_list],
            ['演习-出征准备'],
        )


class SourceGuardTests(unittest.TestCase):
    def test_exercise_has_no_time_sleep_left(self) -> None:
        tree = ast.parse(EXERCISE_SOURCE.read_text(encoding='utf-8'))
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
