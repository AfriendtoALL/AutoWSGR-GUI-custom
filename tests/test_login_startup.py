"""登录页与启动链回归测试。

覆盖 2026-10-29 真机 Bug：
- 登录/选区页没有页面模型，`get_current_page` 只能返回 UNKNOWN；
- 登录页与「启动画面」共用底部像素签名（登录页上启动签名 5/5、score 1.0）；
- `start_game` 点完「点击进入」后只再等一次启动画面就宣布加载完成，
  实际停在登录页 → 所有任务识别失败 → 强制重启 → 再次回到登录页。

Run with::

    python tests\\test_login_startup.py -v
"""

from __future__ import annotations

import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np

from autowsgr.infra.exceptions import NavigationError
from autowsgr.ops.startup import (
    _detect_entry_state,
    ensure_game_ready,
    recover_to_main_or_restart,
    start_game,
    wait_for_game_ui,
)
from autowsgr.types import GameAPP, PageName
from autowsgr.ui.login_page import LoginPage
from autowsgr.ui.main_page import MainPage
from autowsgr.ui.navigation import find_path
from autowsgr.ui.page import get_current_page
from autowsgr.ui.start_screen_page import StartScreenPage


GOLDEN_LOGIN_FRAME = (
    Path(__file__).parent
    / 'golden'
    / 'images'
    / 'real'
    / 'login'
    / 'NavError_182947_187.png'
)


def _load_login_frame() -> np.ndarray:
    return cv2.cvtColor(cv2.imread(str(GOLDEN_LOGIN_FRAME)), cv2.COLOR_BGR2RGB)


class FakeCtrl:
    def __init__(self, screen: np.ndarray | None = None) -> None:
        self.screen = np.zeros((720, 1280, 3), dtype=np.uint8) if screen is None else screen
        self.clicks: list[tuple[float, float]] = []
        self.started: list[str] = []

    def screenshot(self) -> np.ndarray:
        return self.screen

    def click(self, x: float, y: float) -> None:
        self.clicks.append((x, y))

    def start_app(self, package: str) -> None:
        self.started.append(package)


class FakeCtx:
    def __init__(self, ctrl: FakeCtrl) -> None:
        self.ctrl = ctrl
        self.stop_event = threading.Event()


class LoginRecognitionTests(unittest.TestCase):
    def test_login_frame_is_login_page_not_start_screen(self) -> None:
        screen = _load_login_frame()
        self.assertTrue(GOLDEN_LOGIN_FRAME.is_file(), GOLDEN_LOGIN_FRAME)

        match = LoginPage.is_current_page(screen)
        self.assertTrue(match)
        self.assertGreater(match.score, 0.85)
        self.assertEqual(get_current_page(screen), PageName.LOGIN.value)

        # 这是事故的第二个根因：启动画面签名在登录页上也是 1.0。
        self.assertFalse(StartScreenPage.is_current_page(screen))
        self.assertFalse(MainPage.is_current_page(screen))

    def test_enter_game_clicks_template_center(self) -> None:
        ctrl = FakeCtrl(_load_login_frame())
        LoginPage(ctrl).enter_game()
        self.assertEqual(len(ctrl.clicks), 1)
        x, y = ctrl.clicks[0]
        self.assertAlmostEqual(x, 0.885, places=2)
        self.assertAlmostEqual(y, 0.865, places=2)

    def test_enter_game_without_button_raises(self) -> None:
        with (
            patch('autowsgr.infra.logger.save_image', return_value=None),
            self.assertRaises(NavigationError),
        ):
            LoginPage(FakeCtrl()).enter_game()


    def test_navigation_has_login_to_main_edge(self) -> None:
        path = find_path(PageName.LOGIN.value, PageName.MAIN.value)
        self.assertIsNotNone(path)
        assert path is not None
        self.assertEqual(len(path), 1)
        self.assertEqual(path[0].target, PageName.MAIN)


class StartupStateMachineTests(unittest.TestCase):
    def test_detect_entry_state_prefers_login_over_start(self) -> None:
        state = _detect_entry_state(FakeCtrl(_load_login_frame()))
        self.assertEqual(state, 'login')

    def test_start_game_clicks_start_then_login_until_main(self) -> None:
        ctrl = FakeCtrl()
        states = iter(['start', 'login', 'main'])
        with (
            patch('autowsgr.ops.startup.wait_for_game_ui', return_value=True),
            patch(
                'autowsgr.ops.startup._detect_entry_state',
                side_effect=lambda _ctrl: next(states),
            ),
            patch.object(StartScreenPage, 'click_enter') as start_click,
            patch.object(LoginPage, 'enter_game') as login_click,
            patch('autowsgr.ops.startup.time.sleep'),
        ):
            start_game(ctrl)

        start_click.assert_called_once()
        login_click.assert_called_once()
        self.assertEqual(ctrl.started, [GameAPP.official.package_name])

    def test_start_game_raises_when_stuck_on_login(self) -> None:
        ctrl = FakeCtrl()
        with (
            patch('autowsgr.ops.startup.wait_for_game_ui', return_value=True),
            patch('autowsgr.ops.startup._detect_entry_state', return_value='login'),
            patch('autowsgr.ops.startup._ENTER_GAME_TIMEOUT', 0.0),
            patch.object(LoginPage, 'enter_game') as login_click,
            patch('autowsgr.ops.startup.time.sleep'),
        ):
            with self.assertRaises(TimeoutError):
                start_game(ctrl)

        self.assertGreaterEqual(login_click.call_count, 1)

    def test_wait_for_game_ui_accepts_login_state(self) -> None:
        ctrl = FakeCtrl()
        states = iter([None, 'login'])
        with (
            patch(
                'autowsgr.ops.startup._detect_entry_state',
                side_effect=lambda _ctrl: next(states),
            ),
            patch('autowsgr.ops.startup.time.sleep'),
        ):
            self.assertTrue(wait_for_game_ui(ctrl, timeout=5.0))


class RecoveryTests(unittest.TestCase):
    def test_recover_enters_game_from_login_page(self) -> None:
        ctrl = FakeCtrl(_load_login_frame())
        ctx = FakeCtx(ctrl)
        with (
            patch(
                'autowsgr.ops.navigate.identify_current_page',
                return_value=PageName.LOGIN.value,
            ),
            patch.object(LoginPage, 'enter_game') as enter_game,
            patch('autowsgr.ops.startup.ensure_page') as ensure_main,
            patch('autowsgr.ops.startup.restart_game') as restart,
        ):
            recover_to_main_or_restart(ctx, GameAPP.official)

        enter_game.assert_called_once()
        ensure_main.assert_called_once()
        restart.assert_not_called()

    def test_ensure_game_ready_always_lands_on_main(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        with (
            patch('autowsgr.ops.startup.is_game_running', return_value=True),
            patch('autowsgr.ops.startup.recover_to_main_or_restart') as recover,
            patch('autowsgr.ops.startup.go_main_page') as go_main,
        ):
            ensure_game_ready(ctx, GameAPP.official)

        recover.assert_called_once()
        go_main.assert_called_once()

    def test_ensure_game_ready_cold_start_lands_on_main(self) -> None:
        ctrl = FakeCtrl()
        ctx = FakeCtx(ctrl)
        with (
            patch('autowsgr.ops.startup.is_game_running', return_value=False),
            patch('autowsgr.ops.startup.start_game') as start,
            patch('autowsgr.ops.startup.go_main_page') as go_main,
        ):
            ensure_game_ready(ctx, GameAPP.official)

        start.assert_called_once()
        go_main.assert_called_once()


if __name__ == '__main__':
    unittest.main()
