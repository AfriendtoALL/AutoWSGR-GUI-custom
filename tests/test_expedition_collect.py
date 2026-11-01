"""远征收取回归测试。

覆盖 2026-10-29 真机 Bug：
- 4.1 用战斗结算模板（``CLICK_TO_CONTINUE``）验证远征结果页，实测永远
  不命中（0.563 < 0.85），收取抛 ``PageDriftError``，游戏卡在结果页；
- 后续导航全部失败，最终 ``recover_to_main_or_restart`` 强制重启游戏 (SL)。

Run with::

    python tests\\test_expedition_collect.py -v
"""

from __future__ import annotations

import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np

from autowsgr.image_resources import Templates
from autowsgr.infra.exceptions import PageDriftError
from autowsgr.ops.navigate import _try_dismiss_result_overlay
from autowsgr.types import PageName
from autowsgr.ui.map.base import BaseMapPage
from autowsgr.ui.map.data import CLICK_EXPEDITION_SKIP, EXPEDITION_SLOT_PROBES
from autowsgr.ui.map.page import MapPage
from autowsgr.ui.stack import UIStack
from autowsgr.ui.substate import SubstateSpec
from autowsgr.ui.utils import NavConfig
from autowsgr.vision import ImageChecker


GOLDEN_RESULT_FRAME = (
    Path(__file__).parent
    / 'golden'
    / 'images'
    / 'real'
    / 'expedition'
    / 'NavError_104026_562.png'
)


class FakeCtrl:
    """最小控制器：只记录点击，截图返回 720p 黑帧。"""

    def __init__(self) -> None:
        self.clicks: list[tuple[float, float]] = []

    def screenshot(self) -> np.ndarray:
        return np.zeros((720, 1280, 3), dtype=np.uint8)

    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))


class FakeCtx:
    def __init__(self, ctrl: FakeCtrl) -> None:
        self.ctrl = ctrl
        self.ocr = None
        self.stop_event = threading.Event()
        self.ui_stack = UIStack()


class ExpeditionCollectTests(unittest.TestCase):
    def _make_page(self) -> tuple[FakeCtrl, FakeCtx, MapPage]:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        ctx.ui_stack.reset(PageName.MAP.value)
        return ctrl, ctx, MapPage(ctx)

    def test_expedition_result_template_matches_real_frame(self) -> None:
        """实机结果页必须被专用模板命中，且战斗结算模板必须不命中。"""
        self.assertTrue(GOLDEN_RESULT_FRAME.is_file(), GOLDEN_RESULT_FRAME)
        screen = cv2.cvtColor(cv2.imread(str(GOLDEN_RESULT_FRAME)), cv2.COLOR_BGR2RGB)

        self.assertTrue(
            ImageChecker.template_exists(screen, Templates.Symbol.EXPEDITION_CONTINUE)
        )
        # 这就是 4.1 的回归点：战斗结算模板对远征结果页永远 false。
        self.assertFalse(
            ImageChecker.template_exists(screen, Templates.Symbol.CLICK_TO_CONTINUE)
        )

    def test_collect_expedition_clicks_continue_and_confirms(self) -> None:
        ctrl, ctx, page = self._make_page()

        with (
            patch.object(
                MapPage, 'find_ready_expedition_slot', side_effect=[0, None]
            ),
            patch.object(MapPage, 'has_expedition_notification', return_value=False),
            patch(
                'autowsgr.ui.map.panels.expedition._is_expedition_result',
                side_effect=lambda screen: bool(ctrl.clicks),
            ),
            patch('autowsgr.ui.map.panels.expedition.wait_for_stable_screen'),
            patch(
                'autowsgr.ui.map.panels.expedition.confirm_operation',
                return_value=True,
            ) as confirm,
            patch.object(
                ImageChecker,
                'find_any',
                side_effect=lambda *args, **kwargs: SimpleNamespace(center=(0.5, 0.5))
                if len(ctrl.clicks) >= 2
                else None,
            ),
            patch.object(MapPage, 'is_current_page', staticmethod(lambda screen: True)),
        ):
            collected = page.collect_expedition()

        self.assertEqual(collected, 1)
        self.assertEqual(ctrl.clicks, [EXPEDITION_SLOT_PROBES[0], CLICK_EXPEDITION_SKIP])
        confirm.assert_called_once()
        self.assertEqual(ctx.ui_stack.state.page, PageName.MAP.value)
        self.assertEqual(ctx.ui_stack.state.substate, '远征/已收取')

    def test_collect_expedition_failure_dismisses_overlay(self) -> None:
        """结果页验证失败时也必须点掉 overlay，不能把游戏留在未知画面。"""
        ctrl, _ctx, page = self._make_page()
        fast_nav = NavConfig(max_retries=1, timeout=0.05, interval=0.01, stable_frames=1)

        with (
            patch.object(
                MapPage, 'find_ready_expedition_slot', side_effect=[0, None]
            ),
            patch.object(MapPage, 'has_expedition_notification', return_value=False),
            patch(
                'autowsgr.ui.map.panels.expedition._is_expedition_result',
                return_value=False,
            ),
            patch.object(SubstateSpec, 'nav_config', return_value=fast_nav),
            patch('autowsgr.ui.page.get_current_page', return_value=None),
            patch(
                'autowsgr.ui.map.panels.expedition.ImageChecker.template_exists',
                return_value=True,
            ),
            patch('autowsgr.ui.map.panels.expedition.wait_for_stable_screen'),
            patch(
                'autowsgr.ui.map.panels.expedition.confirm_operation',
                return_value=True,
            ) as confirm,
            patch('autowsgr.infra.logger.save_image', return_value=None),
        ):
            with self.assertRaises(PageDriftError):
                page.collect_expedition()

        # 第 1 次是点槽位，第 2 次必须来自兜底清理的“点击继续”。
        self.assertEqual(ctrl.clicks, [EXPEDITION_SLOT_PROBES[0], CLICK_EXPEDITION_SKIP])
        confirm.assert_called_once()


class ResultOverlayRecoveryTests(unittest.TestCase):
    """出逃阶梯的兜底：UNKNOWN 结果页必须能被点掉。"""

    def test_try_dismiss_result_overlay_clicks_continue(self) -> None:
        screen = cv2.cvtColor(cv2.imread(str(GOLDEN_RESULT_FRAME)), cv2.COLOR_BGR2RGB)
        ctrl = FakeCtrl()
        ctrl.screenshot = lambda: screen  # type: ignore[method-assign]
        ctx = SimpleNamespace(ctrl=ctrl, stop_event=threading.Event())

        with patch('autowsgr.ops.navigate.time.sleep'):
            self.assertTrue(_try_dismiss_result_overlay(ctx))

        self.assertEqual(len(ctrl.clicks), 1)
        x, y = ctrl.clicks[0]
        self.assertAlmostEqual(x, 0.92, places=2)
        self.assertAlmostEqual(y, 0.93, places=2)

    def test_try_dismiss_result_overlay_ignores_normal_page(self) -> None:
        ctrl = FakeCtrl()
        ctx = SimpleNamespace(ctrl=ctrl, stop_event=threading.Event())
        self.assertFalse(_try_dismiss_result_overlay(ctx))
        self.assertEqual(ctrl.clicks, [])


if __name__ == '__main__':
    unittest.main()
