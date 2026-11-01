"""批次 5.5 / 5.6 离线回归：WS 广播快照 + 频道隔离 + 日志 Sink。

覆盖四条验收路径：

1. 人为制造半死连接 → 其他连接立即收到广播，半死连接 1s 内被剔除；
2. 发送报错的连接同样被剔除；
3. 模拟前端刷新 10 次 → ``/ws/logs`` 与 ``/ws/task`` 两个连接池都能清空；
4. loguru 日志经自定义 Sink → 队列 → ``/ws/logs`` 广播，前端可收到。

运行::

    python tests\\test_batch5_5_6.py -v
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import unittest
from typing import Any
from unittest import mock

from fastapi import WebSocketDisconnect

from autowsgr.infra import config as infra_config
from autowsgr.infra.logger import (
    disable_ws_log_sink,
    enable_ws_log_sink,
    get_logger,
    setup_logger,
)
from autowsgr.server import main as server_main
from autowsgr.server.ws_manager import (
    DEFAULT_SEND_TIMEOUT_SECONDS,
    WebSocketManager,
    log_ws_manager,
    task_ws_manager,
    ws_manager,
)


# 6.1 起 /ws/* 需要 ?token=，替身默认带上路由层校验用的测试 token。
_WS_TEST_TOKEN = 'batch5_5_6-ws-token'


class _FakeWebSocket:
    """最小 WebSocket 替身：可正常发送、卡死或抛错。"""

    def __init__(
        self,
        *,
        hang: bool = False,
        error_on_send: bool = False,
        incoming: list[str] | None = None,
    ) -> None:
        self.hang = hang
        self.error_on_send = error_on_send
        self.incoming = list(incoming or [])
        self.accepted = False
        self.sent: list[str] = []
        self.query_params = {'token': _WS_TEST_TOKEN}

    async def accept(self) -> None:
        self.accepted = True

    async def receive_text(self) -> str:
        if self.incoming:
            return self.incoming.pop(0)
        raise WebSocketDisconnect()

    async def send_text(self, data: str) -> None:
        if self.hang:
            await asyncio.sleep(10.0)
        if self.error_on_send:
            raise RuntimeError('connection closed')
        self.sent.append(data)


class BroadcastSnapshotTest(unittest.IsolatedAsyncioTestCase):
    """5.5：锁内快照 + 锁外并发 + 单连接超时剔除。"""

    async def test_half_dead_connection_does_not_block_others(self) -> None:
        manager = WebSocketManager('test', send_timeout=DEFAULT_SEND_TIMEOUT_SECONDS)
        healthy = _FakeWebSocket()
        half_dead = _FakeWebSocket(hang=True)

        await manager.connect(healthy)
        await manager.connect(half_dead)

        started = time.perf_counter()
        await manager.broadcast({'type': 'task_update', 'task_id': 't1'})
        elapsed = time.perf_counter() - started

        self.assertEqual(healthy.sent, [json.dumps({'type': 'task_update', 'task_id': 't1'})])
        self.assertEqual(manager.connection_count, 1)
        self.assertEqual(DEFAULT_SEND_TIMEOUT_SECONDS, 1.0)
        self.assertLess(elapsed, 1.2, '广播被半死连接拖住了')
        self.assertNotIn(half_dead, manager._connections)
        self.assertIn(healthy, manager._connections)

    async def test_erroring_connection_is_evicted(self) -> None:
        manager = WebSocketManager('test', send_timeout=DEFAULT_SEND_TIMEOUT_SECONDS)
        healthy = _FakeWebSocket()
        broken = _FakeWebSocket(error_on_send=True)

        await manager.connect(healthy)
        await manager.connect(broken)
        await manager.broadcast({'type': 'log', 'message': 'hello'})

        self.assertEqual(len(healthy.sent), 1)
        self.assertEqual(manager.connection_count, 1)
        self.assertNotIn(broken, manager._connections)

    async def test_new_connection_after_broadcast_still_works(self) -> None:
        manager = WebSocketManager('test', send_timeout=DEFAULT_SEND_TIMEOUT_SECONDS)
        dead = _FakeWebSocket(hang=True)
        await manager.connect(dead)
        await manager.broadcast({'type': 'log', 'message': 'first'})
        self.assertEqual(manager.connection_count, 0)

        fresh = _FakeWebSocket()
        await manager.connect(fresh)
        await manager.broadcast({'type': 'log', 'message': 'second'})
        self.assertEqual(len(fresh.sent), 1)
        self.assertEqual(manager.connection_count, 1)

    async def test_task_and_log_managers_are_isolated(self) -> None:
        self.assertIsNot(task_ws_manager, log_ws_manager)
        self.assertIs(ws_manager, task_ws_manager)

        task_client = _FakeWebSocket()
        log_client = _FakeWebSocket()
        await task_ws_manager.connect(task_client)
        await log_ws_manager.connect(log_client)
        try:
            # 清掉其他用例可能留下的连接，只观察本次两个客户端。
            await task_ws_manager.broadcast({'type': 'task_update', 'task_id': 't1'})
            await log_ws_manager.broadcast({'type': 'log', 'message': 'l1'})

            self.assertEqual(len(task_client.sent), 1)
            self.assertEqual(len(log_client.sent), 1)
            self.assertEqual(json.loads(task_client.sent[0])['type'], 'task_update')
            self.assertEqual(json.loads(log_client.sent[0])['type'], 'log')
        finally:
            await task_ws_manager.disconnect(task_client)
            await log_ws_manager.disconnect(log_client)


class WebSocketRouteCleanupTest(unittest.IsolatedAsyncioTestCase):
    """5.6：两个 WS 路由都用 finally 清理，刷新 10 次后池子归零。"""

    def setUp(self) -> None:
        env_patch = mock.patch.dict(os.environ, {'AUTOWSGR_API_TOKEN': _WS_TEST_TOKEN})
        env_patch.start()
        self.addCleanup(env_patch.stop)
        cache_patch = mock.patch.object(infra_config, '_api_token', None)
        cache_patch.start()
        self.addCleanup(cache_patch.stop)

    async def test_refresh_ten_times_clears_both_pools(self) -> None:
        for index in range(10):
            log_socket = _FakeWebSocket(incoming=[json.dumps({'type': 'ping'})])
            await server_main.ws_logs(log_socket)
            self.assertTrue(log_socket.accepted, f'第 {index + 1} 次 logs 未 accept')
            self.assertEqual(log_socket.sent, [json.dumps({'type': 'pong'})])
            self.assertEqual(log_ws_manager.connection_count, 0)

            task_socket = _FakeWebSocket(incoming=[json.dumps({'type': 'ping'})])
            await server_main.ws_task(task_socket)
            self.assertTrue(task_socket.accepted, f'第 {index + 1} 次 task 未 accept')
            self.assertEqual(task_socket.sent, [json.dumps({'type': 'pong'})])
            self.assertEqual(task_ws_manager.connection_count, 0)

    async def test_route_cleanup_runs_on_unexpected_receive_error(self) -> None:
        class _BrokenSocket(_FakeWebSocket):
            async def receive_text(self) -> str:
                raise RuntimeError('transport reset')

        broken_log = _BrokenSocket()
        await server_main.ws_logs(broken_log)
        self.assertEqual(log_ws_manager.connection_count, 0)

        broken_task = _BrokenSocket()
        await server_main.ws_task(broken_task)
        self.assertEqual(task_ws_manager.connection_count, 0)


class LogSinkTest(unittest.IsolatedAsyncioTestCase):
    """5.6/R31：loguru -> WS Sink -> 队列 -> /ws/logs。"""

    def tearDown(self) -> None:
        disable_ws_log_sink()

    async def test_loguru_log_reaches_log_ws_client_from_worker_thread(self) -> None:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def enqueue(payload: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, payload)

        enable_ws_log_sink(enqueue, level='INFO')
        client = _FakeWebSocket()
        await log_ws_manager.connect(client)
        pump = asyncio.create_task(server_main._log_ws_pump(queue))
        try:
            await asyncio.to_thread(get_logger('test.ws').info, 'sink 线程日志 {}', 7)
            await asyncio.sleep(0.15)
            self.assertTrue(client.sent, '日志没有到达 /ws/logs 客户端')
            payloads = [json.loads(item) for item in client.sent]
            self.assertTrue(
                any(
                    payload.get('type') == 'log'
                    and payload.get('level') == 'info'
                    and payload.get('message') == 'sink 线程日志 7'
                    for payload in payloads
                ),
                payloads,
            )
        finally:
            pump.cancel()
            try:
                await pump
            except asyncio.CancelledError:
                pass
            await log_ws_manager.disconnect(client)

    async def test_lifespan_wires_log_sink_to_log_manager(self) -> None:
        client = _FakeWebSocket()
        await log_ws_manager.connect(client)
        saved_ctx = server_main._ctx
        server_main._ctx = None
        try:
            async with server_main.lifespan(server_main.app):
                get_logger('test.ws').info('lifespan 日志 {}', 9)
                await asyncio.sleep(0.15)
            payloads = [json.loads(item) for item in client.sent]
            self.assertTrue(
                any(
                    payload.get('message') == 'lifespan 日志 9'
                    for payload in payloads
                ),
                payloads,
            )
        finally:
            server_main._ctx = saved_ctx
            await log_ws_manager.disconnect(client)

    async def test_sink_survives_setup_logger_reinstall_and_filters_debug(self) -> None:
        payloads: list[dict[str, Any]] = []
        enable_ws_log_sink(payloads.append, level='INFO')
        # 模拟系统启动时 Launcher 再次调用 setup_logger；logger.remove()
        # 不能把 WS Sink 永久删掉。
        setup_logger(log_dir=None, level='INFO')

        get_logger('test.ws').info('reinstalled {}', 1)
        get_logger('test.ws').debug('debug 不应推送')

        messages = [payload['message'] for payload in payloads]
        self.assertIn('reinstalled 1', messages)
        self.assertNotIn('debug 不应推送', messages)
        record = next(payload for payload in payloads if payload['message'] == 'reinstalled 1')
        self.assertEqual(record['type'], 'log')
        self.assertEqual(record['level'], 'info')
        self.assertEqual(record['channel'], 'test.ws')

    async def test_callback_error_does_not_break_business_logging(self) -> None:
        def broken_callback(_payload: dict[str, Any]) -> None:
            raise RuntimeError('sink callback failed')

        enable_ws_log_sink(broken_callback, level='INFO')
        # 不应把 Sink 异常抛给业务日志调用方。
        get_logger('test.ws').info('business log still works')


if __name__ == '__main__':
    unittest.main(verbosity=2)
