"""批次 6b-1 离线回归：6.5 配置 fail fast / 6.8 截图目录 / 6.13 进程精确匹配。

覆盖验收路径：

1. 显式传入不存在的配置路径 → ``ConfigPathNotFoundError``（FileNotFoundError
   子类），``/api/system/start`` 映射 400 + ``config_path_not_found``；
2. 未指定路径时仍允许探测 ``usersettings.yaml`` 或回退内置默认；
3. ``save_images=False`` 时 ``save_image()`` 直接返回 None，不创建
   ``logs/images/``，也不会出现名叫 ``None`` 的目录；
4. 显式传 ``img_dir`` 时仍正常保存；
5. ``ps`` 输出按整词匹配包名：同时安装 ``com.example.com.a`` 与
   ``com.example.com.ab`` 时不会互相误判；老设备不支持 ``-o`` 时回退
   ``ps -A``。

运行::

    .\\python\\python.exe tests\\test_batch6b_1.py -v
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import numpy as np
from fastapi import HTTPException

from autowsgr.emulator.controller import scrcpy as scrcpy_module
from autowsgr.emulator.controller.scrcpy import ScrcpyController
from autowsgr.infra import config as infra_config
from autowsgr.infra import logger as logger_module
from autowsgr.infra.config import ConfigManager, ConfigPathNotFoundError, UserConfig
from autowsgr.server import main as server_main
from autowsgr.server.device_lease import device_operation_lease
from autowsgr.server.routes.system import SystemStartRequest, system_start


def _image() -> np.ndarray:
    return np.zeros((4, 4, 3), dtype=np.uint8)


class ConfigFailFastTests(unittest.TestCase):
    """6.5：显式路径 fail fast，默认探测保持原语义。"""

    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))

    def test_explicit_missing_path_raises_file_not_found(self) -> None:
        missing = self.tmp / 'typo_usersettings.yaml'
        with self.assertRaises(ConfigPathNotFoundError) as ctx:
            ConfigManager.load(missing)
        self.assertIsInstance(ctx.exception, FileNotFoundError)
        self.assertEqual(ctx.exception.path, missing)
        self.assertIn(str(missing), str(ctx.exception))

    def test_explicit_directory_is_rejected(self) -> None:
        with self.assertRaises(ConfigPathNotFoundError):
            ConfigManager.load(self.tmp)

    def test_explicit_existing_path_still_loads(self) -> None:
        path = self.tmp / 'usersettings.yaml'
        path.write_text('emulator:\n  serial: emulator-5554\n', encoding='utf-8')
        config = ConfigManager.load(path)
        self.assertEqual(config.emulator.serial, 'emulator-5554')

    def test_default_probe_falls_back_to_builtin_when_missing(self) -> None:
        with mock.patch.object(infra_config.Path, 'cwd', return_value=self.tmp):
            config = ConfigManager.load()
        self.assertIsInstance(config, UserConfig)

    def test_default_probe_loads_usersettings_when_present(self) -> None:
        (self.tmp / 'usersettings.yaml').write_text(
            'emulator:\n  serial: 127.0.0.1:16384\n',
            encoding='utf-8',
        )
        with mock.patch.object(infra_config.Path, 'cwd', return_value=self.tmp):
            config = ConfigManager.load()
        self.assertEqual(config.emulator.serial, '127.0.0.1:16384')


class SystemStartConfigErrorTests(unittest.TestCase):
    """6.5：启动路由把配置路径错误映射为 400，而不是 500/静默降级。"""

    def setUp(self) -> None:
        self._ctx_patch = mock.patch.object(server_main, '_ctx', None)
        self._ctx_patch.start()
        self.addCleanup(self._ctx_patch.stop)
        server_main.set_system_state(server_main.SystemState.IDLE)
        self.addCleanup(server_main.set_system_state, server_main.SystemState.IDLE)
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))

    def test_missing_config_returns_400_config_path_not_found(self) -> None:
        missing = self.tmp / 'no_such_config.yaml'
        with mock.patch(
            'autowsgr.scheduler.launch',
            side_effect=ConfigPathNotFoundError(missing),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    system_start(SystemStartRequest(config_path=str(missing)))
                )

        error = ctx.exception
        self.assertEqual(error.status_code, 400)
        self.assertEqual(error.error_code, 'config_path_not_found')
        self.assertIn(str(missing), error.detail)
        self.assertEqual(error.data, {'config_path': str(missing)})
        # 失败后必须回到 idle 且归还设备租约，下一次启动不能被 409 卡住。
        self.assertIsNone(device_operation_lease.owner)
        self.assertEqual(server_main.get_system_state(), server_main.SystemState.IDLE)

    def test_omitted_config_path_uses_default_probe(self) -> None:
        """未指定路径 → 传 None 给 launch（由 ConfigManager 探测/回退）。"""
        fake_ctx = SimpleNamespace()  # 无 loot_update_sink，bind 会安全跳过
        self.addCleanup(setattr, server_main, '_ctx', None)
        with mock.patch('autowsgr.scheduler.launch', return_value=fake_ctx) as launch:
            response = asyncio.run(system_start(SystemStartRequest()))

        launch.assert_called_once_with(config_path=None)
        self.assertTrue(response.success)
        self.assertIs(server_main._ctx, fake_ctx)


class SaveImageDirTests(unittest.TestCase):
    """6.8：save_images=False 时不落盘，也不产生名为 None 的目录。"""

    def setUp(self) -> None:
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self._old_cwd = os.getcwd()
        os.chdir(self.tmp)
        self.addCleanup(os.chdir, self._old_cwd)
        self.addCleanup(logger_module.setup_logger, None, 'INFO', '10 MB', '7 days', False, None)

    def test_disabled_returns_none_and_creates_no_images_dir(self) -> None:
        logger_module.setup_logger(log_dir=self.tmp / 'logs', save_images=False)
        result = logger_module.save_image(_image(), tag='disabled')

        self.assertIsNone(result)
        self.assertFalse((self.tmp / 'logs' / 'images').exists())
        self.assertFalse((self.tmp / 'None').exists())

    def test_disabled_does_not_grow_existing_images_dir(self) -> None:
        images = self.tmp / 'logs' / 'images'
        images.mkdir(parents=True)
        logger_module.setup_logger(log_dir=self.tmp / 'logs', save_images=False)

        self.assertIsNone(logger_module.save_image(_image(), tag='disabled'))
        self.assertEqual(list(images.iterdir()), [])

    def test_none_dir_does_not_create_directory_named_none(self) -> None:
        logger_module.setup_logger(log_dir=None, save_images=False)

        self.assertIsNone(logger_module.save_image(_image(), tag='none'))
        self.assertFalse((self.tmp / 'None').exists())

    def test_explicit_img_dir_still_saves(self) -> None:
        logger_module.setup_logger(log_dir=None, save_images=False)
        target = self.tmp / 'explicit'

        path = logger_module.save_image(_image(), tag='explicit', img_dir=target)

        self.assertIsNotNone(path)
        assert path is not None
        self.assertEqual(path.parent, target)
        self.assertTrue(path.exists())


class _FakeDevice:
    """最小 adbutils 设备替身：按命令返回预设 ps 输出。"""

    def __init__(self, ps_args: str | None = None, ps_plain: str = '') -> None:
        self.ps_args = ps_args
        self.ps_plain = ps_plain
        self.commands: list[str] = []

    def shell(self, cmd: str, timeout: float | None = None) -> str:
        self.commands.append(cmd)
        if cmd == 'ps -A -o PID,ARGS':
            return self.ps_args if self.ps_args is not None else 'ps: unknown option -o\n'
        if cmd == 'ps -A':
            return self.ps_plain
        raise AssertionError(f'unexpected shell command: {cmd}')


_BOTH_PACKAGES = (
    'USER PID PPID VSZ RSS WCHAN ADDR S NAME\n'
    'u0_a101 2001 100 1000 100 0 0 S com.example.com.a\n'
    'u0_a102 2002 100 1000 100 0 0 S com.example.com.ab\n'
)


class AppRunningMatchTests(unittest.TestCase):
    """6.13：整词匹配，前缀包名不误判。"""

    def test_prefix_package_does_not_match(self) -> None:
        only_ab = 'u0_a102 2002 100 1000 100 0 0 S com.example.com.ab\n'
        only_a = 'u0_a101 2001 100 1000 100 0 0 S com.example.com.a\n'

        self.assertFalse(
            scrcpy_module._ps_output_has_package(only_ab, 'com.example.com.a')
        )
        self.assertTrue(
            scrcpy_module._ps_output_has_package(only_ab, 'com.example.com.ab')
        )
        self.assertTrue(
            scrcpy_module._ps_output_has_package(only_a, 'com.example.com.a')
        )
        self.assertFalse(
            scrcpy_module._ps_output_has_package(only_a, 'com.example.com.ab')
        )

    def test_both_installed_matches_each_exactly(self) -> None:
        for package in ('com.example.com.a', 'com.example.com.ab'):
            with self.subTest(package=package):
                self.assertTrue(
                    scrcpy_module._ps_output_has_package(_BOTH_PACKAGES, package)
                )
        # 更短的前缀（不是完整包名）不能被当成「已运行」。
        self.assertFalse(
            scrcpy_module._ps_output_has_package(_BOTH_PACKAGES, 'com.example.com')
        )

    def test_args_column_and_remote_service_forms(self) -> None:
        output = '2001 com.example.com.a\n2002 com.example.com.a:remote\n'
        self.assertTrue(
            scrcpy_module._ps_output_has_package(output, 'com.example.com.a')
        )
        # 包名后必须紧跟 : 或 /；.- 等字符属于另一个包名。
        self.assertFalse(
            scrcpy_module._ps_output_has_package(
                '2003 com.example.com.a.extra\n', 'com.example.com.a'
            )
        )

    def test_is_app_running_uses_parsed_args(self) -> None:
        ctrl = ScrcpyController()
        ctrl._device = _FakeDevice(  # type: ignore[assignment]
            ps_args='PID ARGS\n2002 com.example.com.ab\n'
        )

        self.assertFalse(ctrl.is_app_running('com.example.com.a'))
        self.assertTrue(ctrl.is_app_running('com.example.com.ab'))
        # 有效 ps 表不触发回退，每次只查一次设备。
        self.assertEqual(
            ctrl._device.commands,
            ['ps -A -o PID,ARGS', 'ps -A -o PID,ARGS'],
        )

    def test_is_app_running_falls_back_to_plain_ps(self) -> None:
        ctrl = ScrcpyController()
        ctrl._device = _FakeDevice(  # type: ignore[assignment]
            ps_args='ps: unknown option -o\n',
            ps_plain='u0_a101 2001 100 1000 100 0 0 S com.example.com.a\n',
        )

        self.assertTrue(ctrl.is_app_running('com.example.com.a'))
        self.assertEqual(
            ctrl._device.commands,
            ['ps -A -o PID,ARGS', 'ps -A'],
        )

    def test_blank_package_is_not_running(self) -> None:
        ctrl = ScrcpyController()
        ctrl._device = _FakeDevice(ps_args='2001 com.example.com.a\n')  # type: ignore[assignment]

        self.assertFalse(ctrl.is_app_running('   '))
        self.assertEqual(ctrl._device.commands, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
