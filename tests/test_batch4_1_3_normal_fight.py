"""Fake-controller regressions for batch 4.1.3 (ops/normal_fight.py).

Run with::

    python tests\\test_batch4_1_3_normal_fight.py -v

All eight former fixed sleeps now go through ``NormalFightRunner._wait_stable``
(or existing closed-loop UI methods). These tests pin the ordering and the
degradation behavior without touching a real device.
"""

from __future__ import annotations

import ast
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from autowsgr.infra import ActionFailedError
from autowsgr.infra.exceptions import NavigationError
from autowsgr.ops.normal_fight import NormalFightRunner
from autowsgr.types import RepairMode


ROOT = Path(__file__).resolve().parents[1]
NORMAL_FIGHT_SOURCE = (
    ROOT / 'python' / 'site-packages' / 'autowsgr' / 'ops' / 'normal_fight.py'
)


class FakeCtx:
    def __init__(self) -> None:
        self.stop_event = threading.Event()


def _make_runner(*, plan: object | None = None, fleet_selection: object | None = None):
    runner = NormalFightRunner.__new__(NormalFightRunner)
    runner._ctx = FakeCtx()
    runner._ctrl = object()
    runner._plan = plan or SimpleNamespace(
        chapter=1,
        map_id=1,
        repair_mode=RepairMode.repairing,
        event_name='test',
    )
    runner._fleet_selection = fleet_selection or SimpleNamespace(
        slot_rules=None,
        plain_fleet=None,
        primary_names=['A'],
        fleet_id=1,
    )
    runner._fleet_id = 1
    runner._fleet_ships = None
    runner._loot_count = None
    runner._ship_acquired_count = None
    runner._is_event = False
    runner._entrance = None
    runner._map_code = ''
    runner._skip_check = False
    return runner


class WaitStableTests(unittest.TestCase):
    def test_wait_stable_forwards_stop_event(self) -> None:
        runner = _make_runner()

        with patch('autowsgr.ops.normal_fight.wait_for_stable_screen') as stable:
            runner._wait_stable('test-stage', timeout=0.4)

        stable.assert_called_once()
        self.assertEqual(stable.call_args.kwargs['source'], 'test-stage')
        self.assertEqual(stable.call_args.kwargs['timeout'], 0.4)
        self.assertIs(stable.call_args.kwargs['stop_event'], runner._ctx.stop_event)


class EnterNormalTests(unittest.TestCase):
    def test_enter_normal_waits_for_sortie_panel(self) -> None:
        runner = _make_runner()
        map_page = MagicMock()
        map_page.get_loot_and_ship_count.return_value = SimpleNamespace(loot=1, ship=2)

        with (
            patch('autowsgr.ops.normal_fight.ensure_page') as ensure,
            patch('autowsgr.ops.normal_fight.MapPage', return_value=map_page),
            patch.object(runner, '_wait_stable') as stable,
        ):
            runner._enter_normal()

        ensure.assert_called_once()
        stable.assert_called_once_with('常规战-出征面板', timeout=0.6)
        map_page.ensure_panel.assert_called_once()
        map_page.enter_sortie.assert_called_once_with(1, 1)
        self.assertEqual(runner._loot_count, 1)
        self.assertEqual(runner._ship_acquired_count, 2)

    def test_enter_normal_navigation_failure_returns_main(self) -> None:
        runner = _make_runner()
        map_page = MagicMock()
        map_page.get_loot_and_ship_count.return_value = SimpleNamespace(loot=0, ship=0)
        map_page.enter_sortie.side_effect = NavigationError('chapter failed')

        with (
            patch('autowsgr.ops.normal_fight.ensure_page') as ensure,
            patch('autowsgr.ops.normal_fight.MapPage', return_value=map_page),
            patch.object(runner, '_wait_stable'),
        ):
            with self.assertRaises(ActionFailedError):
                runner._enter_normal()

        self.assertEqual(ensure.call_count, 2)
        self.assertEqual(ensure.call_args_list[-1].args[1].value, '主页面')


class EnterEventTests(unittest.TestCase):
    def test_enter_event_waits_for_event_map(self) -> None:
        runner = _make_runner()
        runner._is_event = True
        runner._entrance = 'alpha'
        runner._map_code = 'H1'
        runner._skip_check = True
        event_page = MagicMock()

        with (
            patch('autowsgr.ops.normal_fight.ensure_page') as ensure,
            patch('autowsgr.ops.normal_fight.BaseEventPage', return_value=event_page),
            patch.object(runner, '_wait_stable') as stable,
        ):
            runner._enter_event()

        ensure.assert_called_once()
        stable.assert_called_once_with('常规战-活动地图', timeout=0.6)
        event_page.start_fight.assert_called_once_with('H1', 'alpha', True)


class PrepareBattleTests(unittest.TestCase):
    def _prepare(self, runner: NormalFightRunner, page: MagicMock):
        page.detect_fleet_info.return_value = SimpleNamespace(
            ship_damage={},
            to_ships=lambda names: list(names or []),
        )
        with (
            patch(
                'autowsgr.ops.normal_fight.BattlePreparationPage',
                return_value=page,
            ),
            patch.object(runner, '_wait_stable') as stable,
        ):
            stats = runner._prepare_for_battle()
        return stats, stable

    def test_prepare_battle_waits_in_expected_order(self) -> None:
        runner = _make_runner()
        page = MagicMock()

        stats, stable = self._prepare(runner, page)

        self.assertEqual(
            [call.args[0] for call in stable.call_args_list],
            ['常规战-出征准备', '常规战-选择舰队', '常规战-补给', '常规战-开始出征'],
        )
        page.select_fleet.assert_called_once_with(1)
        page.apply_supply.assert_called_once()
        page.apply_repair.assert_not_called()
        page.start_battle.assert_called_once()
        self.assertEqual(len(stats), 6)

    def test_prepare_battle_slot_rules_waits(self) -> None:
        runner = _make_runner(
            fleet_selection=SimpleNamespace(
                slot_rules=object(),
                plain_fleet=None,
                primary_names=['A'],
                fleet_id=1,
            )
        )
        page = MagicMock()
        page.change_fleet.return_value = True
        page.last_changed_fleet = ['A']

        _stats, stable = self._prepare(runner, page)

        page.change_fleet.assert_called_once()
        self.assertIn('常规战-换船(规则)', [call.args[0] for call in stable.call_args_list])

    def test_prepare_battle_plain_fleet_waits(self) -> None:
        runner = _make_runner(
            fleet_selection=SimpleNamespace(
                slot_rules=None,
                plain_fleet=['A'],
                primary_names=['A'],
                fleet_id=1,
            )
        )
        page = MagicMock()
        page.change_fleet.return_value = True
        page.last_changed_fleet = ['A']

        with patch('autowsgr.ops.normal_fight.exact_fleet_rules', return_value=object()):
            _stats, stable = self._prepare(runner, page)

        page.change_fleet.assert_called_once()
        self.assertIn('常规战-换船(名单)', [call.args[0] for call in stable.call_args_list])

    def test_prepare_battle_fleet_failure_raises(self) -> None:
        runner = _make_runner(
            fleet_selection=SimpleNamespace(
                slot_rules=object(),
                plain_fleet=None,
                primary_names=['A'],
                fleet_id=1,
            )
        )
        page = MagicMock()
        page.change_fleet.return_value = False
        page.detect_fleet_info.return_value = SimpleNamespace(
            ship_damage={},
            to_ships=lambda names: list(names or []),
        )

        with (
            patch(
                'autowsgr.ops.normal_fight.BattlePreparationPage',
                return_value=page,
            ),
            patch.object(runner, '_wait_stable'),
        ):
            with self.assertRaises(ActionFailedError):
                runner._prepare_for_battle()


class SourceGuardTests(unittest.TestCase):
    def test_normal_fight_has_no_time_sleep_left(self) -> None:
        tree = ast.parse(NORMAL_FIGHT_SOURCE.read_text(encoding='utf-8'))
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
