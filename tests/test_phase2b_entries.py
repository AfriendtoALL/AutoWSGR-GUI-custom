"""Fake-controller tests for phase 2b entry closures.

Run with::

    python tests\\test_phase2b_entries.py -v
"""

from __future__ import annotations

import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from autowsgr.infra.exceptions import NavigationError
from autowsgr.types import PageName
from autowsgr.ui.choose_ship_page import ChooseShipPage
from autowsgr.ui.decisive.battle_page import DecisiveBattlePage
from autowsgr.ui.event.event_page import BaseEventPage
from autowsgr.ui.intensify_page import IntensifyPage, IntensifyTab
from autowsgr.ui.mission_page.data import MissionPanel
from autowsgr.ui.mission_page.page import MissionPage
from autowsgr.ui.stack import UIState, UIStack
from autowsgr.vision import PixelChecker


class FakeCtrl:
    def __init__(self) -> None:
        self.clicks: list[tuple[float, float]] = []

    def screenshot(self) -> np.ndarray:
        return np.zeros((8, 8, 3), dtype=np.uint8)

    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))


class FakeCtx:
    def __init__(self, ctrl: FakeCtrl) -> None:
        self.ctrl = ctrl
        self.stop_event = threading.Event()
        self.ui_stack = UIStack()
        self.ocr = None
        self.ship_ocr = None


class Phase2bEntryTests(unittest.TestCase):
    def test_mission_switch_panel_records_substate(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset(PageName.MISSION.value)
        page = MissionPage(ctx)
        with patch(
            'autowsgr.ui.mission_page.page.make_tab_checker',
            return_value=lambda screen: bool(ctrl.clicks),
        ):
            page.switch_panel(MissionPanel.WEEKLY)

        self.assertEqual(len(ctrl.clicks), 1)
        self.assertEqual(ctx.ui_stack.state, UIState(PageName.MISSION.value, '周常'))

    def test_intensify_switch_tab_records_substate(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset(PageName.INTENSIFY.value)
        page = IntensifyPage(ctx)
        with patch(
            'autowsgr.ui.intensify_page.make_tab_checker',
            return_value=lambda screen: bool(ctrl.clicks),
        ):
            page.switch_tab(IntensifyTab.REMAKE)

        self.assertEqual(len(ctrl.clicks), 1)
        self.assertEqual(ctx.ui_stack.state, UIState(PageName.INTENSIFY.value, '改修'))

    def test_decisive_click_enter_map_verifies_target(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        page = DecisiveBattlePage(ctx)
        with patch(
            'autowsgr.ui.decisive.battle_page.is_decisive_map_page',
            side_effect=lambda screen: bool(ctrl.clicks),
        ):
            page.click_enter_map()

        self.assertEqual(len(ctrl.clicks), 1)

    def test_decisive_click_enter_map_failure_raises(self) -> None:
        ctx = FakeCtx(FakeCtrl())
        page = DecisiveBattlePage(ctx)
        with patch(
            'autowsgr.ui.decisive.battle_page.click_and_wait_for_page',
            side_effect=NavigationError('timeout'),
        ):
            with self.assertRaises(NavigationError):
                page.click_enter_map()

    def test_event_change_difficulty_records_substate(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset(PageName.EVENT_MAP.value)
        page = BaseEventPage(ctx, event_name='test')
        with patch.object(
            BaseEventPage,
            '_difficulty_icon_state',
            side_effect=lambda screen: 'H' if ctrl.clicks else 'E',
        ):
            page._change_difficulty('H')

        self.assertEqual(len(ctrl.clicks), 1)
        self.assertEqual(ctx.ui_stack.state, UIState(PageName.EVENT_MAP.value, '难度H'))

    def test_choose_ship_ensure_search_box_clicks_and_waits(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        page = ChooseShipPage(ctx)
        with patch.object(
            PixelChecker,
            'check_signature',
            return_value=SimpleNamespace(matched=True),
        ):
            page.ensure_search_box()

        self.assertEqual(len(ctrl.clicks), 1)


if __name__ == '__main__':
    unittest.main()
