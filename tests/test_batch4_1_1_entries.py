"""Fake-controller regressions for batch 4.1.1 UI entry closures.

Run with::

    python tests\\test_batch4_1_1_entries.py -v

Covers the five residual UI files from 4.1 phase 2b:

- ``ui/build_page.py``: collect completion marker / destroy final gate
- ``ui/main_page/overlays.py``: overlay close verification + degradation
- ``ui/battle/base.py``: fleet/panel selection, choose-ship page, auto supply
- ``ui/canteen_page.py``: recipe -> cook button, missing-button failure
- ``ui/map/panels/exercise.py``: rival selection leaves the list
"""

from __future__ import annotations

import ast
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from autowsgr.image_resources import Templates
from autowsgr.infra.exceptions import NavigationError, PageDriftError
from autowsgr.types import PageName
from autowsgr.ui._checkers import screen_changed
from autowsgr.ui.battle.base import BaseBattlePreparation
from autowsgr.ui.battle.constants import (
    CLICK_AUTO_SUPPLY,
    CLICK_FLEET,
    CLICK_SHIP_SLOT,
)
from autowsgr.ui.battle.preparation import BattlePreparationPage
from autowsgr.ui.build_page import (
    CLICK_DESTROY_FOUR_STAR_CONFIRM,
    BuildPage,
    BuildTab,
)
from autowsgr.ui.canteen_page import CLICK_RECIPE, CanteenPage
from autowsgr.ui.main_page.constants import DismissCoord
from autowsgr.ui.main_page import overlays
from autowsgr.ui.map.data import EXERCISE_CHALLENGE_PROBES
from autowsgr.ui.map.page import MapPage
from autowsgr.ui.map.panels.exercise import ExercisePanelMixin
from autowsgr.ui.stack import UIState, UIStack
from autowsgr.vision import ImageChecker


ROOT = Path(__file__).resolve().parents[1]
AUTOWSGR_ROOT = ROOT / 'python' / 'site-packages' / 'autowsgr'


class FakeCtrl:
    def __init__(self) -> None:
        self.clicks: list[tuple[float, float]] = []
        self.swipes: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def screenshot(self) -> np.ndarray:
        return np.zeros((16, 16, 3), dtype=np.uint8)

    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))

    def swipe(self, *args: object, **kwargs: object) -> None:
        self.swipes.append((args, kwargs))


class FakeCtx:
    def __init__(self) -> None:
        self.ctrl = FakeCtrl()
        self.stop_event = threading.Event()
        self.ui_stack = UIStack()
        self.ocr = None
        self.ship_ocr = None


class BuildPageEntryTests(unittest.TestCase):
    def test_collect_all_success_uses_completion_marker_leave_check(self) -> None:
        ctx = FakeCtx()
        page = BuildPage(ctx)
        detail = SimpleNamespace(center=(0.82, 0.31))

        with (
            patch.object(ImageChecker, 'find_template', side_effect=[detail, None]),
            patch.object(ImageChecker, 'template_exists', return_value=False),
            patch('autowsgr.ui.build_page.click_and_wait_for_page') as click_wait,
            patch.object(BuildPage, 'dismiss_build_result') as dismiss,
            patch.object(BuildPage, '_wait_stable'),
        ):
            count = page.collect_all('ship')

        self.assertEqual(count, 1)
        self.assertEqual(ctx.ctrl.clicks, [])
        click_wait.assert_called_once()
        self.assertEqual(click_wait.call_args.args[1], detail.center)
        dismiss.assert_called_once()

    def test_collect_all_failure_raises_page_drift(self) -> None:
        ctx = FakeCtx()
        page = BuildPage(ctx)
        detail = SimpleNamespace(center=(0.82, 0.31))

        with (
            patch.object(ImageChecker, 'find_template', return_value=detail),
            patch.object(ImageChecker, 'template_exists', return_value=False),
            patch(
                'autowsgr.ui.build_page.click_and_wait_for_page',
                side_effect=NavigationError('timeout'),
            ),
        ):
            with self.assertRaises(PageDriftError):
                page.collect_all('ship')

        self.assertEqual(ctx.ctrl.clicks, [])

    def test_destroy_four_star_confirm_verifies_destroy_list(self) -> None:
        ctx = FakeCtx()
        ctx.ui_stack.reset(PageName.BUILD.value)
        page = BuildPage(ctx)

        with (
            patch.object(BuildPage, '_wait_destroy_list', return_value=False),
            patch.object(BuildPage, '_is_destroy_list', return_value=True),
            patch('autowsgr.ui.build_page.click_and_wait_for_page') as click_wait,
        ):
            page.destroy_four_star_confirm()

        click_wait.assert_called_once()
        self.assertEqual(
            click_wait.call_args.args[1],
            CLICK_DESTROY_FOUR_STAR_CONFIRM,
        )
        self.assertEqual(
            ctx.ui_stack.state,
            UIState(PageName.BUILD.value, BuildTab.DESTROY.value),
        )

    def test_destroy_four_star_confirm_failure_raises_page_drift(self) -> None:
        ctx = FakeCtx()
        page = BuildPage(ctx)

        with (
            patch.object(BuildPage, '_wait_destroy_list', return_value=False),
            patch.object(ImageChecker, 'find_any', return_value=None),
            patch(
                'autowsgr.ui.build_page.click_and_wait_for_page',
                side_effect=NavigationError('timeout'),
            ),
        ):
            with self.assertRaises(PageDriftError):
                page.destroy_four_star_confirm()


class OverlayEntryTests(unittest.TestCase):
    def test_dismiss_news_clicks_and_verifies_overlay_gone(self) -> None:
        ctrl = FakeCtrl()

        with (
            patch(
                'autowsgr.ui.main_page.overlays.PixelChecker.check_signature',
                return_value=SimpleNamespace(matched=True),
            ),
            patch('autowsgr.ui.main_page.overlays.click_and_wait_leave_page') as leave,
            patch('autowsgr.ui.main_page.overlays.wait_for_stable_screen'),
        ):
            overlays.dismiss_news(ctrl)

        self.assertEqual(ctrl.clicks, [])
        leave.assert_called_once()
        self.assertEqual(leave.call_args.args[1], DismissCoord.NEWS_CLOSE.xy)

    def test_dismiss_booking_failure_warns_without_raising(self) -> None:
        ctrl = FakeCtrl()

        with patch(
            'autowsgr.ui.main_page.overlays.click_and_wait_leave_page',
            side_effect=NavigationError('timeout'),
        ):
            overlays.dismiss_booking(ctrl)

        self.assertEqual(ctrl.clicks, [])


class BattleBaseEntryTests(unittest.TestCase):
    def test_select_fleet_success_records_substate(self) -> None:
        ctx = FakeCtx()
        ctx.ui_stack.reset(PageName.BATTLE_PREP.value)
        page = BattlePreparationPage(ctx)

        def probe(_screen: np.ndarray) -> int:
            return 4 if ctx.ctrl.clicks else 2

        with patch.object(
            BaseBattlePreparation,
            'get_selected_fleet',
            side_effect=probe,
        ):
            page.select_fleet(4)

        self.assertEqual(ctx.ctrl.clicks, [CLICK_FLEET[4]])
        self.assertEqual(
            ctx.ui_stack.state,
            UIState(PageName.BATTLE_PREP.value, '4队'),
        )

    def test_select_fleet_failure_raises_page_drift(self) -> None:
        ctx = FakeCtx()
        page = BattlePreparationPage(ctx)

        with (
            patch.object(
                BaseBattlePreparation,
                'get_selected_fleet',
                return_value=2,
            ),
            patch(
                'autowsgr.ui.substate.click_and_wait_for_page',
                side_effect=NavigationError('timeout'),
            ),
        ):
            with self.assertRaises(PageDriftError):
                page.select_fleet(4)

    def test_click_ship_slot_waits_for_choose_page(self) -> None:
        ctx = FakeCtx()
        page = BattlePreparationPage(ctx)

        with patch('autowsgr.ui.battle.base.click_and_wait_for_page') as click_wait:
            page.click_ship_slot(2)

        click_wait.assert_called_once()
        self.assertEqual(click_wait.call_args.kwargs['click_coord'], CLICK_SHIP_SLOT[2])
        self.assertEqual(click_wait.call_args.kwargs['target'], PageName.CHOOSE_SHIP)

    def test_toggle_auto_supply_verifies_state_flip(self) -> None:
        ctx = FakeCtx()
        page = BattlePreparationPage(ctx)

        with patch.object(
            BaseBattlePreparation,
            'is_auto_supply_enabled',
            side_effect=lambda _screen: bool(ctx.ctrl.clicks),
        ):
            page.toggle_auto_supply()

        self.assertEqual(ctx.ctrl.clicks, [CLICK_AUTO_SUPPLY])


class CanteenEntryTests(unittest.TestCase):
    def test_select_recipe_waits_for_cook_button(self) -> None:
        ctx = FakeCtx()
        ctx.ui_stack.reset(PageName.CANTEEN.value)
        page = CanteenPage(ctx)

        with patch.object(ImageChecker, 'template_exists', return_value=True):
            page.select_recipe(2)

        self.assertEqual(ctx.ctrl.clicks, [CLICK_RECIPE[2]])
        self.assertEqual(
            ctx.ui_stack.state,
            UIState(PageName.CANTEEN.value, '菜谱2'),
        )

    def test_cook_without_button_raises_timeout(self) -> None:
        ctx = FakeCtx()
        page = CanteenPage(ctx)

        with (
            patch.object(CanteenPage, 'select_recipe'),
            patch.object(ImageChecker, 'find_template', return_value=None),
        ):
            with self.assertRaises(TimeoutError):
                page.cook(1)


class ExerciseEntryTests(unittest.TestCase):
    def test_select_exercise_rival_waits_until_list_leave(self) -> None:
        ctx = FakeCtx()
        ctx.ui_stack.reset(PageName.MAP.value)
        page = MapPage(ctx)

        def challenge(_screen: np.ndarray, _slot: int) -> bool:
            return not ctx.ctrl.clicks

        with (
            patch.object(ExercisePanelMixin, '_exercise_is_at_top', return_value=True),
            patch.object(
                ExercisePanelMixin,
                '_check_challenge_at',
                side_effect=challenge,
            ),
        ):
            page.select_exercise_rival(2)

        self.assertEqual(ctx.ctrl.clicks, [EXERCISE_CHALLENGE_PROBES[1]])
        self.assertEqual(
            ctx.ui_stack.state,
            UIState(PageName.MAP.value, '演习/对手2'),
        )

    def test_select_exercise_rival_failure_raises(self) -> None:
        ctx = FakeCtx()
        page = MapPage(ctx)

        with (
            patch.object(ExercisePanelMixin, '_exercise_is_at_top', return_value=True),
            patch.object(
                ExercisePanelMixin,
                '_check_challenge_at',
                return_value=True,
            ),
            patch(
                'autowsgr.ui.map.panels.exercise.click_and_wait_leave_page',
                side_effect=NavigationError('timeout'),
            ),
        ):
            with self.assertRaises(NavigationError):
                page.select_exercise_rival(1)


class ClosedLoopSourceGuardTests(unittest.TestCase):
    """The five files must contain no fixed sleep and no naked controller click."""

    FILES = (
        'ui/build_page.py',
        'ui/main_page/overlays.py',
        'ui/battle/base.py',
        'ui/canteen_page.py',
        'ui/map/panels/exercise.py',
    )

    @staticmethod
    def _chain(node: ast.AST) -> tuple[str, ...]:
        parts: list[str] = []
        while isinstance(node, ast.Attribute):
            parts.append(node.attr)
            node = node.value
        if isinstance(node, ast.Name):
            parts.append(node.id)
        return tuple(reversed(parts))

    @classmethod
    def _is_click(cls, call: ast.Call) -> bool:
        chain = cls._chain(call.func)
        return bool(chain) and chain[-1] == 'click' and any(
            part in {'ctrl', '_ctrl'} for part in chain[:-1]
        )

    @classmethod
    def _is_sleep(cls, call: ast.Call) -> bool:
        chain = cls._chain(call.func)
        return bool(chain) and chain[-1] == 'sleep'

    def test_no_fixed_sleep_and_only_start_battle_clicks(self) -> None:
        for rel in self.FILES:
            path = AUTOWSGR_ROOT / rel
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and self._is_sleep(node):
                    self.fail(f'{rel}: 仍存在 time.sleep 调用 (line {node.lineno})')

        # start_battle 是唯一有意保留的裸点击（点完可能弹「船坞已满」，
        # 重试会误触，由战斗状态机 DOCK_FULL 接管）。
        tree = ast.parse((AUTOWSGR_ROOT / 'ui/battle/base.py').read_text(encoding='utf-8'))
        start_battle = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.name == 'start_battle'
        )
        clicks_in_start = [
            node
            for node in ast.walk(start_battle)
            if isinstance(node, ast.Call) and self._is_click(node)
        ]
        self.assertEqual(len(clicks_in_start), 1)
        allowed_click_lines = {node.lineno for node in clicks_in_start}

        for rel in self.FILES:
            path = AUTOWSGR_ROOT / rel
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or not self._is_click(node):
                    continue
                if rel == 'ui/battle/base.py' and node.lineno in allowed_click_lines:
                    continue
                self.fail(f'{rel}: 存在裸 controller click (line {node.lineno})')


class CheckerHelperTests(unittest.TestCase):
    def test_screen_changed_only_accepts_visible_difference(self) -> None:
        reference = np.zeros((16, 16, 3), dtype=np.uint8)
        changed = np.full((16, 16, 3), 255, dtype=np.uint8)
        checker = screen_changed(reference)
        self.assertFalse(checker(reference))
        self.assertTrue(checker(changed))


if __name__ == '__main__':
    unittest.main()
