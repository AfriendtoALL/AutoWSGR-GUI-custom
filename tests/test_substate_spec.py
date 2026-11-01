"""Fake-controller tests for :class:`autowsgr.ui.substate.SubstateSpec`.

Run with::

    python -m unittest tests.test_substate_spec -v
"""

from __future__ import annotations

import threading
import unittest

import numpy as np

from autowsgr.infra.exceptions import PageDriftError
from autowsgr.ui.battle.constants import SUPPORT_DISABLE, SUPPORT_ENABLE, SUPPORT_PROBE
from autowsgr.ui.battle.supply import SupplyMixin
from autowsgr.ui.stack import UIState, UIStack
from autowsgr.ui.substate import SubstateSpec


class FakeCtrl:
    """Minimal controller: one solid-colour frame, optional click mutation."""

    def __init__(self, *, value: int = 0, on_click=None) -> None:
        self.value = value
        self.on_click = on_click
        self.clicks: list[tuple[float, float]] = []

    def screenshot(self) -> np.ndarray:
        return np.full((8, 8, 3), self.value, dtype=np.uint8)

    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))
        if self.on_click is not None:
            self.on_click()


class FakeCtx:
    def __init__(self, ctrl: FakeCtrl) -> None:
        self.ctrl = ctrl
        self.stop_event = threading.Event()
        self.ui_stack = UIStack()
        self.ocr = None
        self.ship_ocr = None


class SupportFakeCtrl(FakeCtrl):
    """Controller whose support-toggle pixel flips on click."""

    def __init__(self) -> None:
        super().__init__()
        self.screen = np.zeros((100, 100, 3), dtype=np.uint8)
        h, w = self.screen.shape[:2]
        self._support_xy = (int(SUPPORT_PROBE[0] * w), int(SUPPORT_PROBE[1] * h))
        self.screen[self._support_xy[1], self._support_xy[0]] = SUPPORT_DISABLE.as_rgb_tuple()

    def screenshot(self) -> np.ndarray:
        return self.screen.copy()

    def click(self, x: float, y: float) -> None:
        super().click(x, y)
        self.screen[self._support_xy[1], self._support_xy[0]] = SUPPORT_ENABLE.as_rgb_tuple()


def _reached(screen: np.ndarray) -> bool:
    return int(screen[0, 0, 0]) == 1


def _spec(**overrides) -> SubstateSpec:
    params = {
        'page': '地图页面',
        'substate': '出征',
        'checker': _reached,
        'timeout': 0.3,
        'retries': 1,
        'interval': 0.01,
        'stable_frames': 1,
        'retry_delay': 0.01,
    }
    params.update(overrides)
    return SubstateSpec(**params)


class SubstateSpecTests(unittest.TestCase):
    def test_click_success_records_substate(self) -> None:
        ctrl = FakeCtrl(on_click=lambda: setattr(ctrl, 'value', 1))
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset('地图页面')

        _spec().click(ctx, (0.5, 0.5), source='测试', action_name='go')

        self.assertEqual(len(ctrl.clicks), 1)
        self.assertEqual(ctx.ui_stack.state, UIState('地图页面', '出征'))

    def test_click_timeout_raises_page_drift(self) -> None:
        ctx = FakeCtx(FakeCtrl(value=0))
        ctx.ui_stack.reset('地图页面')

        with self.assertRaises(PageDriftError) as caught:
            _spec().click(ctx, (0.5, 0.5), source='测试', action_name='go')

        self.assertIn('子状态未到达', str(caught.exception))
        self.assertEqual(ctx.ui_stack.state, UIState('地图页面'))

    def test_probe_unavailable_clicks_once_without_recording(self) -> None:
        ctrl = FakeCtrl(value=0)
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset('地图页面')
        spec = _spec(probe=lambda screen: False)

        spec.click(ctx, (0.5, 0.5), source='探针缺失')

        self.assertEqual(len(ctrl.clicks), 1)
        self.assertEqual(ctx.ui_stack.state, UIState('地图页面'))

    def test_apply_success_records_substate(self) -> None:
        ctrl = FakeCtrl(value=0, on_click=lambda: setattr(ctrl, 'value', 1))
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset('地图页面')

        _spec().apply(ctx, lambda: ctrl.click(0.5, 0.5), source='组合动作')

        self.assertEqual(ctx.ui_stack.state, UIState('地图页面', '出征'))

    def test_wait_success_without_click(self) -> None:
        ctrl = FakeCtrl(value=1)
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset('地图页面')

        _spec(stable_frames=2).wait(ctx, source='仅验证')

        self.assertEqual(ctrl.clicks, [])
        self.assertEqual(ctx.ui_stack.state, UIState('地图页面', '出征'))

    def test_toggle_battle_support_entry_uses_spec(self) -> None:
        ctrl = SupportFakeCtrl()
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset('出征准备')

        SupplyMixin(ctx).toggle_battle_support()

        self.assertEqual(len(ctrl.clicks), 1)
        self.assertEqual(ctx.ui_stack.state, UIState('出征准备', '战役支援/开'))


if __name__ == '__main__':
    unittest.main()
