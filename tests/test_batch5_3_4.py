"""批次 5.3 / 5.4 离线回归：停止超时强制中断 + 显式生命周期状态机。

覆盖两条验收路径：

1. **5.4 启动中点击任务**：``launch`` 被一个阻塞替身卡住时，``task_start``
   必须立刻 503「系统正在启动，请稍候」，而不是排队等 ``lifecycle_lock``；
2. **5.3 停止卡死**：任务永不退出导致 ``wait_for_completion`` 超时后，
   ``ctrl.disconnect()`` 必须被调用，``_ctx`` 必须被清空并标记失效，
   返回文案必须明确说明「停止超时 + 已强制断开设备」。

运行::

    python tests\\test_batch5_3_4.py -v
"""

from __future__ import annotations

import asyncio
import sys
import threading
import time
import unittest
from typing import Any
from unittest import mock

from fastapi import HTTPException

from autowsgr.server import main as server_main
from autowsgr.server.device_lease import DeviceOperationLease
from autowsgr.server.routes import system as system_routes
from autowsgr.server.routes.system import (
    SystemStartRequest,
    system_start,
    system_stop,
)
from autowsgr.server.routes.task import task_start
from autowsgr.server.task_manager import TaskManager, task_manager


class _FakeController:
    """只记录 disconnect() 调用次数。"""

    def __init__(self) -> None:
        self.disconnect_calls = 0

    def disconnect(self) -> None:
        self.disconnect_calls += 1


class _FakeContext:
    """最小 GameContext 替身：设备控制器 + 协作式停止信号。"""

    def __init__(self) -> None:
        self.ctrl = _FakeController()
        self.stop_event = threading.Event()
        self.invalidated = False


class _BlockingController(_FakeController):
    """disconnect() 卡住，用于验证强制路径的硬上界。"""

    def __init__(self) -> None:
        super().__init__()
        self.release = threading.Event()

    def disconnect(self) -> None:
        self.disconnect_calls += 1
        self.release.wait(2.0)


class _BlockingLaunch:
    """阻塞到测试放行才返回的 launch 替身，用于制造「启动中」窗口。"""

    def __init__(self) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()
        self.config_paths: list[str | None] = []

    def __call__(self, config_path: str | None = None) -> _FakeContext:
        self.config_paths.append(config_path)
        self.entered.set()
        if not self.release.wait(5.0):
            raise RuntimeError('测试未放行 launch')
        return _FakeContext()


class Batch53StopForceTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._saved_ctx = server_main._ctx
        self._saved_state = server_main.get_system_state()
        server_main._ctx = None
        server_main.set_system_state(server_main.SystemState.IDLE)

    def tearDown(self) -> None:
        server_main._ctx = self._saved_ctx
        server_main.set_system_state(self._saved_state)

    def test_state_enum_has_explicit_transitions(self) -> None:
        self.assertEqual(server_main.SystemState.STARTING.value, 'starting')
        self.assertEqual(server_main.SystemState.READY.value, 'ready')
        self.assertEqual(server_main.SystemState.STOPPING.value, 'stopping')
        self.assertEqual(system_routes._TASK_STOP_TIMEOUT_SECONDS, 30.0)

    async def test_task_start_during_starting_returns_503_without_waiting_for_lock(
        self,
    ) -> None:
        server_main.set_system_state(server_main.SystemState.STARTING)

        # 故意持锁：旧实现会在这里挂住；新实现必须在抢锁之前就 503。
        async with server_main.lifecycle_lock:
            started = time.perf_counter()
            with self.assertRaises(HTTPException) as caught:
                await asyncio.wait_for(task_start(object()), timeout=1.0)  # type: ignore[arg-type]
            elapsed = time.perf_counter() - started

        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn('正在启动', str(caught.exception.detail))
        self.assertLess(elapsed, 0.5, 'task_start 仍在等待 lifecycle_lock')

    async def test_real_launch_in_progress_rejects_task_immediately(self) -> None:
        blocker = _BlockingLaunch()
        fresh_lease = DeviceOperationLease()
        start: asyncio.Task[Any] | None = None

        with (
            mock.patch.object(system_routes, 'device_operation_lease', fresh_lease),
            mock.patch('autowsgr.scheduler.launch', blocker),
        ):
            start = asyncio.create_task(system_start(SystemStartRequest()))
            self.assertTrue(
                await asyncio.to_thread(blocker.entered.wait, 2.0),
                'launch 未被调用',
            )
            self.assertIs(
                server_main.get_system_state(),
                server_main.SystemState.STARTING,
            )

            started = time.perf_counter()
            with self.assertRaises(HTTPException) as caught:
                await asyncio.wait_for(task_start(object()), timeout=1.0)  # type: ignore[arg-type]
            elapsed = time.perf_counter() - started

            blocker.release.set()
            response = await asyncio.wait_for(start, timeout=5.0)

        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn('系统正在启动，请稍候', str(caught.exception.detail))
        self.assertLess(elapsed, 0.5, '启动中点击任务仍被 lifecycle_lock 挂住')
        self.assertTrue(response.success)
        # 6.5 起：未传 config_path 时不再硬编码 'usersettings.yaml' 作为显式
        # 路径，而是传 None 让 ConfigManager 探测/回退（显式路径才 fail fast）。
        self.assertEqual(blocker.config_paths, [None])
        self.assertIs(
            server_main.get_system_state(),
            server_main.SystemState.READY,
        )
        self.assertIsNotNone(server_main._ctx)
        self.assertIsNone(fresh_lease.snapshot())

    async def test_stop_timeout_forces_disconnect_and_clears_context(self) -> None:
        ctx = _FakeContext()
        server_main._ctx = ctx
        server_main.set_system_state(server_main.SystemState.READY)

        wait_calls: list[float] = []

        def fake_wait(timeout: float) -> bool:
            wait_calls.append(timeout)
            return False

        with (
            mock.patch.object(
                TaskManager,
                'is_running',
                new_callable=mock.PropertyMock,
                return_value=True,
            ),
            mock.patch.object(task_manager, 'stop_task', return_value=True) as stop_mock,
            mock.patch.object(
                task_manager,
                'wait_for_completion',
                side_effect=fake_wait,
            ),
            mock.patch.object(system_routes, '_TASK_STOP_TIMEOUT_SECONDS', 0.05),
        ):
            started = time.perf_counter()
            with self.assertRaises(HTTPException) as caught:
                await asyncio.wait_for(system_stop(), timeout=2.0)
            elapsed = time.perf_counter() - started

        stop_mock.assert_called_once_with()
        self.assertEqual(wait_calls, [0.05])
        # 5.10：超时失败改为 500 + 结构化错误码，data 仍保留现场信息。
        self.assertEqual(caught.exception.status_code, 500)
        self.assertEqual(caught.exception.error_code, 'system_stop_timeout')
        self.assertIn('停止超时', str(caught.exception.detail))
        self.assertIn('强制断开设备连接', str(caught.exception.detail))
        self.assertEqual(
            caught.exception.data,
            {'forced_disconnect': True, 'context_cleared': True},
        )

        # 设备 socket 真的被断开，上下文被摘除并标记失效。
        self.assertEqual(ctx.ctrl.disconnect_calls, 1)
        self.assertIsNone(server_main._ctx)
        self.assertTrue(ctx.invalidated)
        self.assertTrue(ctx.stop_event.is_set())
        self.assertIs(
            server_main.get_system_state(),
            server_main.SystemState.IDLE,
        )
        self.assertLess(elapsed, 1.0, '超时后的强制清理耗时异常')

    async def test_force_release_clears_context_even_when_disconnect_blocks(
        self,
    ) -> None:
        ctx = _FakeContext()
        ctx.ctrl = _BlockingController()  # type: ignore[assignment]
        server_main._ctx = ctx

        started = time.perf_counter()
        try:
            disconnect_ok = await asyncio.wait_for(
                server_main.force_release_context(timeout=0.05),
                timeout=1.0,
            )
        finally:
            ctx.ctrl.release.set()  # type: ignore[attr-defined]
        elapsed = time.perf_counter() - started

        self.assertFalse(disconnect_ok, 'disconnect 卡住时应报告未在限时内完成')
        self.assertIsNone(server_main._ctx, '强制路径必须先摘掉 _ctx')
        self.assertTrue(ctx.invalidated)
        self.assertLess(elapsed, 0.5)

    async def test_start_failure_returns_to_idle(self) -> None:
        fresh_lease = DeviceOperationLease()

        def failing_launch(config_path: str | None = None) -> _FakeContext:
            raise RuntimeError('模拟器连接失败')

        with (
            mock.patch.object(system_routes, 'device_operation_lease', fresh_lease),
            mock.patch('autowsgr.scheduler.launch', failing_launch),
        ):
            with self.assertRaises(HTTPException) as caught:
                await asyncio.wait_for(
                    system_start(SystemStartRequest()),
                    timeout=2.0,
                )

        # 5.10：启动失败不再回 200 + success=False，而是 500 + 结构化错误码。
        self.assertEqual(caught.exception.status_code, 500)
        self.assertEqual(caught.exception.error_code, 'system_start_failed')
        self.assertIn('模拟器连接失败', str(caught.exception.detail))
        self.assertIsNone(server_main._ctx)
        self.assertIs(
            server_main.get_system_state(),
            server_main.SystemState.IDLE,
        )
        self.assertIsNone(fresh_lease.snapshot())

    async def test_lifecycle_endpoints_reject_during_transition(self) -> None:
        server_main.set_system_state(server_main.SystemState.STARTING)

        async with server_main.lifecycle_lock:
            for coroutine in (
                system_start(SystemStartRequest()),
                system_stop(),
            ):
                with self.assertRaises(HTTPException) as caught:
                    await asyncio.wait_for(coroutine, timeout=1.0)
                self.assertEqual(caught.exception.status_code, 503)
                self.assertIn('正在启动', str(caught.exception.detail))

    async def test_normal_stop_still_disconnects_and_reaches_idle(self) -> None:
        ctx = _FakeContext()
        server_main._ctx = ctx
        server_main.set_system_state(server_main.SystemState.READY)
        fresh_lease = DeviceOperationLease()

        with (
            mock.patch.object(
                TaskManager,
                'is_running',
                new_callable=mock.PropertyMock,
                return_value=False,
            ),
            mock.patch.object(system_routes, 'device_operation_lease', fresh_lease),
        ):
            response = await asyncio.wait_for(system_stop(), timeout=2.0)

        self.assertTrue(response.success)
        self.assertEqual(ctx.ctrl.disconnect_calls, 1)
        self.assertIsNone(server_main._ctx)
        self.assertIs(
            server_main.get_system_state(),
            server_main.SystemState.IDLE,
        )
        self.assertIsNone(fresh_lease.snapshot())


if __name__ == '__main__':
    result = unittest.main(verbosity=2, exit=False).result
    sys.exit(0 if result.wasSuccessful() else 1)
