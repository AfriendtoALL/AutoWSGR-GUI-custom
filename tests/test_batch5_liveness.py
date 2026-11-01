"""批次 5.1 离线验证：ScrcpyController.is_alive() 能识别断开的模拟器。

本测试不连接真机，用假 socket / 假解码线程 / 假 ADB 设备复现三种现场：

1. 视频流仍在出帧 → 存活；
2. 静止画面导致帧时间戳超时，但 ADB 还能响应 → 仍存活（不能误杀）；
3. socket 被关闭、解码线程退出、或 ADB 探活无响应 → 断开。

运行::

    python tests\\test_batch5_liveness.py -v
"""

from __future__ import annotations

import threading
import time
import unittest

from autowsgr.emulator.controller.scrcpy import (
    _ALIVE_FRAME_WINDOW,
    ScrcpyController,
)


class _FakeSocket:
    """最小 socket 替身：只实现 is_alive() 用到的 fileno()。"""

    def __init__(self, fd: int = 7) -> None:
        self._fd = fd

    def fileno(self) -> int:
        return self._fd


class _FakeDevice:
    """ADB 设备替身；``response`` 为 None 时模拟连接失败。"""

    def __init__(self, response: str | None = '__autowsgr_alive\n') -> None:
        self.response = response
        self.shell_calls: list[str] = []

    def shell(self, cmd: str, timeout: float | None = None) -> str:
        self.shell_calls.append(cmd)
        if self.response is None:
            raise ConnectionError('device offline')
        return self.response


class _LiveThread:
    def is_alive(self) -> bool:
        return True


def _make_alive_controller(
    *,
    frame_age: float = 0.0,
    device: _FakeDevice | None = None,
) -> ScrcpyController:
    ctrl = ScrcpyController(serial='fake-serial')
    ctrl._alive = True
    ctrl._closed = False
    ctrl._decode_thread = _LiveThread()  # type: ignore[assignment]
    ctrl._video_socket = _FakeSocket(7)  # type: ignore[assignment]
    ctrl._control_socket = _FakeSocket(8)  # type: ignore[assignment]
    ctrl._device = device or _FakeDevice()  # type: ignore[assignment]
    ctrl._last_frame_at = time.monotonic() - frame_age
    ctrl._alive_probe_at = 0.0
    ctrl._alive_probe_ok = False
    return ctrl


class ControllerLivenessTest(unittest.TestCase):
    def test_fresh_frame_is_alive_without_adb_probe(self) -> None:
        device = _FakeDevice()
        ctrl = _make_alive_controller(frame_age=0.0, device=device)

        self.assertTrue(ctrl.is_alive())
        self.assertEqual(device.shell_calls, [])

    def test_static_screen_falls_back_to_adb_probe(self) -> None:
        device = _FakeDevice()
        ctrl = _make_alive_controller(
            frame_age=_ALIVE_FRAME_WINDOW + 1.0,
            device=device,
        )

        self.assertTrue(ctrl.is_alive())
        self.assertEqual(len(device.shell_calls), 1)
        # 1s 内重复查询走缓存，不再执行 adb shell。
        self.assertTrue(ctrl.is_alive())
        self.assertEqual(len(device.shell_calls), 1)

    def test_dead_device_with_stale_frame_is_not_alive(self) -> None:
        device = _FakeDevice(response=None)
        ctrl = _make_alive_controller(
            frame_age=_ALIVE_FRAME_WINDOW + 1.0,
            device=device,
        )

        self.assertFalse(ctrl.is_alive())

    def test_decode_thread_gone_is_not_alive(self) -> None:
        ctrl = _make_alive_controller()
        ctrl._decode_thread = None  # type: ignore[assignment]

        self.assertFalse(ctrl.is_alive())

    def test_closed_socket_is_not_alive(self) -> None:
        ctrl = _make_alive_controller()
        ctrl._video_socket = _FakeSocket(-1)  # type: ignore[assignment]

        self.assertFalse(ctrl.is_alive())

    def test_never_received_first_frame_is_not_alive(self) -> None:
        ctrl = _make_alive_controller()
        ctrl._last_frame_at = None

        self.assertFalse(ctrl.is_alive())

    def test_stream_eof_marks_controller_dead(self) -> None:
        """视频 socket 返回 EOF（模拟器被杀）时解码线程必须置 _alive=False。"""

        class _EofSocket:
            def recv(self, _size: int) -> bytes:
                return b''

        ctrl = ScrcpyController(serial='fake-serial')
        ctrl._alive = True
        ctrl._video_socket = _EofSocket()  # type: ignore[assignment]
        ctrl._last_frame_at = time.monotonic()

        ctrl._stream_loop()

        self.assertFalse(ctrl._alive)
        self.assertFalse(ctrl.is_alive())

    def test_real_decode_thread_state_is_honoured(self) -> None:
        ctrl = _make_alive_controller()
        finished = threading.Thread(target=lambda: None)
        finished.start()
        finished.join()
        ctrl._decode_thread = finished

        self.assertFalse(ctrl.is_alive())


if __name__ == '__main__':
    unittest.main(verbosity=2)
