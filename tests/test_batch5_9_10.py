"""批次 5.9 / 5.10 离线回归：结构化掉落事件 + 统一业务错误码。

覆盖验收路径：

1. **5.9 掉落事件**：``GameContext`` 在战斗同步时调用注入的 sink，
   ``WebSocketManager`` 发出字段固定的 ``loot_update``；即使日志被静默，
   事件仍然到达；
2. **5.10 错误码**：8 处 ops 业务失败全部抛 4xx/5xx + ``error_code``，
   正常路径仍返回 ``success=True``；统一异常处理器输出结构化错误体；
   设备断开后启动任务返回 503，而不是 200 后异步失败。

运行::

    .\\python\\python.exe tests\\test_batch5_9_10.py -v
"""

from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from typing import Any
from unittest import mock

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

from autowsgr.context import game_context as game_context_module
from autowsgr.context.game_context import GameContext
from autowsgr.server import main as server_main
from autowsgr.server.device_lease import DeviceOperationLease
from autowsgr.server.errors import ErrorCode, api_error
from autowsgr.server.routes import ops as ops_routes
from autowsgr.server.routes.task import task_start
from autowsgr.server.task_manager import TaskManager
from autowsgr.server.ws_manager import WebSocketManager
from autowsgr.types import ConditionFlag


class _FakeWebSocket:
    """只实现广播所需的最小 WebSocket 接口。"""

    def __init__(self) -> None:
        self.accepted = False
        self.payloads: list[dict[str, Any]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, data: str) -> None:
        self.payloads.append(json.loads(data))


def _context() -> GameContext:
    return GameContext(ctrl=object(), config=object(), ocr=object())  # type: ignore[arg-type]


class LootUpdateSinkTest(unittest.TestCase):
    """5.9：核心上下文只依赖可选 sink，不依赖日志输出。"""

    def test_sync_before_combat_emits_full_counts(self) -> None:
        ctx = _context()
        events: list[tuple[int, int]] = []
        ctx.loot_update_sink = lambda loot, ship: events.append((loot, ship))

        ctx.sync_before_combat(1, None, loot_count=50, ship_acquired_count=12)

        self.assertEqual(events, [(50, 12)])

    def test_sync_after_combat_emits_ship_increment(self) -> None:
        ctx = _context()
        ctx.dropped_ship_count = 10
        events: list[tuple[int, int]] = []
        ctx.loot_update_sink = lambda loot, ship: events.append((loot, ship))
        result = SimpleNamespace(
            flag=ConditionFlag.OPERATION_SUCCESS,
            ship_stats=[],
            fight_results=[
                SimpleNamespace(dropped_ship=True),
                SimpleNamespace(dropped_ship=False),
            ],
        )

        ctx.sync_after_combat(1, result)

        self.assertEqual(ctx.dropped_ship_count, 11)
        self.assertEqual(events, [(0, 11)])

    def test_loot_event_does_not_depend_on_log_emission(self) -> None:
        """把 logger 换成 no-op，模拟 WARNING 级别下日志不可见。"""
        ctx = _context()
        events: list[tuple[int, int]] = []
        ctx.loot_update_sink = lambda loot, ship: events.append((loot, ship))
        silent_log = SimpleNamespace(
            debug=lambda *args, **kwargs: None,
            info=lambda *args, **kwargs: None,
            warning=lambda *args, **kwargs: None,
            error=lambda *args, **kwargs: None,
        )

        with mock.patch.object(game_context_module, '_log', silent_log):
            ctx.sync_before_combat(1, None, loot_count=50, ship_acquired_count=12)

        self.assertEqual(events, [(50, 12)])

    def test_sink_failure_does_not_break_combat_sync(self) -> None:
        ctx = _context()

        def broken_sink(_loot: int, _ship: int) -> None:
            raise RuntimeError('ws down')

        ctx.loot_update_sink = broken_sink
        ctx.sync_before_combat(1, None, loot_count=50, ship_acquired_count=12)

        self.assertEqual(ctx.dropped_loot_count, 50)
        self.assertEqual(ctx.dropped_ship_count, 12)

    def test_server_bridge_forwards_to_task_manager(self) -> None:
        ctx = _context()
        with mock.patch.object(server_main.task_manager, 'publish_loot_update') as publish:
            server_main.bind_context_observers(ctx)
            ctx.sync_before_combat(1, None, loot_count=50, ship_acquired_count=12)

        publish.assert_called_once_with(loot_count=50, ship_count=12)


class LootUpdateTransportTest(unittest.IsolatedAsyncioTestCase):
    """5.9：WS 事件字段与线程安全投递。"""

    async def test_send_loot_update_payload_is_stable(self) -> None:
        manager = WebSocketManager('test')
        websocket = _FakeWebSocket()
        await manager.connect(websocket)  # type: ignore[arg-type]

        await manager.send_loot_update(loot_count=50, ship_count=7)

        self.assertTrue(websocket.accepted)
        self.assertEqual(
            websocket.payloads,
            [{'type': 'loot_update', 'loot_count': 50, 'ship_count': 7}],
        )
        await manager.disconnect(websocket)  # type: ignore[arg-type]
        self.assertEqual(manager.connection_count, 0)

    async def test_task_manager_publishes_into_running_loop(self) -> None:
        manager = TaskManager()
        manager.set_loop(asyncio.get_running_loop())
        fake_ws = mock.Mock()
        fake_ws.send_loot_update = mock.AsyncMock()

        with mock.patch(
            'autowsgr.server.task_manager.task_ws_manager',
            fake_ws,
        ):
            manager.publish_loot_update(loot_count=50, ship_count=7)
            await asyncio.sleep(0.05)

        fake_ws.send_loot_update.assert_awaited_once_with(loot_count=50, ship_count=7)

    def test_task_manager_ignores_closed_loop(self) -> None:
        manager = TaskManager()
        loop = asyncio.new_event_loop()
        loop.close()
        manager.set_loop(loop)
        fake_ws = mock.Mock()
        fake_ws.send_loot_update = mock.AsyncMock()

        with mock.patch(
            'autowsgr.server.task_manager.task_ws_manager',
            fake_ws,
        ):
            manager.publish_loot_update(loot_count=50, ship_count=7)

        fake_ws.send_loot_update.assert_not_called()


class ApiErrorContractTest(unittest.IsolatedAsyncioTestCase):
    """5.10：抛出的异常带 error_code，处理器统一成结构化 JSON。"""

    def test_api_error_keeps_readable_detail_and_code(self) -> None:
        error = api_error(
            409,
            ErrorCode.DEVICE_BUSY,
            '设备正由 api:destroy 使用',
            headers={'Retry-After': '1'},
            data={'holder': 'api:destroy'},
        )

        self.assertEqual(error.status_code, 409)
        self.assertEqual(error.detail, '设备正由 api:destroy 使用')
        self.assertEqual(error.error_code, 'device_busy')
        self.assertEqual(error.data, {'holder': 'api:destroy'})
        self.assertEqual(error.headers, {'Retry-After': '1'})

    async def test_http_handler_returns_structured_body(self) -> None:
        error = api_error(500, ErrorCode.EXPEDITION_FAILED, '远征收取失败')
        response = await server_main._api_http_exception_handler(None, error)  # type: ignore[arg-type]
        body = json.loads(response.body)

        self.assertEqual(response.status_code, 500)
        self.assertFalse(body['success'])
        self.assertEqual(body['error'], '远征收取失败')
        self.assertEqual(body['error_code'], 'expedition_failed')
        self.assertEqual(body['detail'], '远征收取失败')

    async def test_plain_http_exception_gets_fallback_code(self) -> None:
        response = await server_main._api_http_exception_handler(
            None,  # type: ignore[arg-type]
            HTTPException(status_code=404, detail='nope'),
        )
        body = json.loads(response.body)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(body['error_code'], 'not_found')
        self.assertEqual(body['error'], 'nope')

    async def test_validation_error_uses_same_envelope(self) -> None:
        error = RequestValidationError(
            [
                {
                    'type': 'missing',
                    'loc': ('body', 'name'),
                    'msg': 'Field required',
                    'input': {},
                }
            ]
        )
        response = await server_main._api_validation_exception_handler(None, error)  # type: ignore[arg-type]
        body = json.loads(response.body)

        self.assertEqual(response.status_code, 422)
        self.assertFalse(body['success'])
        self.assertEqual(body['error_code'], 'validation_error')
        self.assertIn('body.name', body['error'])


class OpsRouteErrorContractTest(unittest.IsolatedAsyncioTestCase):
    """5.10：8 处 ops 业务失败改为 HTTP 异常，正常路径仍返回 200。"""

    def setUp(self) -> None:
        self.lease = DeviceOperationLease()
        self._lease_patch = mock.patch(
            'autowsgr.server.device_lease.device_operation_lease',
            self.lease,
        )
        self._lease_patch.start()

    def tearDown(self) -> None:
        self._lease_patch.stop()

    async def _expect_error(
        self,
        coroutine: Any,
        status_code: int,
        error_code: str,
    ) -> None:
        with self.assertRaises(HTTPException) as caught:
            await coroutine
        self.assertEqual(caught.exception.status_code, status_code)
        self.assertEqual(getattr(caught.exception, 'error_code', None), error_code)
        self.assertIsNone(self.lease.snapshot(), '失败路径必须归还设备租约')

    async def test_intensify_without_context_returns_503(self) -> None:
        with mock.patch.object(
            ops_routes,
            'get_context',
            side_effect=RuntimeError('系统未启动'),
        ):
            await self._expect_error(
                ops_routes.intensify_action(None),
                503,
                'system_not_ready',
            )

    async def test_intensify_failure_returns_500(self) -> None:
        policy = SimpleNamespace(
            material_ship_types=None,
            max_materials=4,
            protected_ships=[],
            reuse_target_inventory_baseline=False,
        )
        ctx = SimpleNamespace(config=SimpleNamespace(intensify=policy))
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=ctx),
            mock.patch(
                'autowsgr.ops.intensify.auto_intensify',
                side_effect=RuntimeError('强化失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.intensify_action(None),
                500,
                'intensify_failed',
            )

    async def test_expedition_failure_returns_500(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch(
                'autowsgr.ops.expedition.collect_expedition',
                side_effect=RuntimeError('远征失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.expedition_check(),
                500,
                'expedition_failed',
            )

    async def test_build_collect_failure_returns_500(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch(
                'autowsgr.ops.collect_built_ships',
                side_effect=RuntimeError('收取失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.build_collect(),
                500,
                'build_collect_failed',
            )

    async def test_build_start_failure_returns_500(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch(
                'autowsgr.ops.build_ship',
                side_effect=RuntimeError('建造失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.build_start(ops_routes.BuildStartRequest()),
                500,
                'build_start_failed',
            )

    async def test_reward_collect_failure_returns_500(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch(
                'autowsgr.ops.collect_rewards',
                side_effect=RuntimeError('奖励失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.reward_collect(),
                500,
                'reward_collect_failed',
            )

    async def test_cook_failure_returns_500(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch(
                'autowsgr.ops.cook',
                side_effect=RuntimeError('烹饪失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.cook_action(ops_routes.CookRequest()),
                500,
                'cook_failed',
            )

    async def test_destroy_failure_returns_500(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch(
                'autowsgr.ops.destroy_ships',
                side_effect=RuntimeError('解装失败'),
            ),
        ):
            await self._expect_error(
                ops_routes.destroy_action(ops_routes.DestroyRequest()),
                500,
                'destroy_failed',
            )

    async def test_success_still_returns_200_envelope(self) -> None:
        with (
            mock.patch.object(ops_routes, 'get_context', return_value=object()),
            mock.patch('autowsgr.ops.collect_built_ships', return_value=3),
        ):
            response = await ops_routes.build_collect()

        self.assertTrue(response.success)
        self.assertEqual(response.data, {'collected': 3})
        self.assertTrue(response.message)


class TaskStartLivenessTest(unittest.IsolatedAsyncioTestCase):
    """5.10：设备断开/系统未就绪时启动任务必须是 4xx/5xx。"""

    def setUp(self) -> None:
        self._saved_ctx = server_main._ctx
        self._saved_state = server_main.get_system_state()

    def tearDown(self) -> None:
        server_main._ctx = self._saved_ctx
        server_main.set_system_state(self._saved_state)

    async def test_dead_emulator_returns_503_device_unavailable(self) -> None:
        server_main._ctx = SimpleNamespace(
            ctrl=SimpleNamespace(is_alive=lambda: False),
        )
        server_main.set_system_state(server_main.SystemState.READY)

        with self.assertRaises(HTTPException) as caught:
            await task_start(object())  # type: ignore[arg-type]

        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.error_code, 'device_unavailable')
        self.assertIn('模拟器连接已断开', str(caught.exception.detail))

    async def test_not_ready_returns_503_system_code(self) -> None:
        server_main._ctx = None
        server_main.set_system_state(server_main.SystemState.STARTING)

        with self.assertRaises(HTTPException) as caught:
            await task_start(object())  # type: ignore[arg-type]

        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.error_code, 'system_starting')


class RendererLootWiringTest(unittest.TestCase):
    """5.9 前端静态契约：WS 主路径 + 日志兜底 + 4xx/5xx 归一化。"""

    @classmethod
    def setUpClass(cls) -> None:
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[1]
            / '.workbuddy'
            / 'asar_work'
            / 'dist'
            / 'renderer.bundle.js'
        )
        cls.source = path.read_text(encoding='utf-8')

    def test_task_ws_dispatches_loot_update(self) -> None:
        self.assertIn('msg.type === "loot_update"', self.source)
        self.assertIn('this.callbacks.onLootUpdate(msg)', self.source)

    def test_scheduler_consumes_loot_update_and_checks_stop(self) -> None:
        self.assertIn('applyLootUpdate(msg)', self.source)
        self.assertIn('this.stopChecker.updateTracked(loot, ship)', self.source)
        self.assertIn('this.checkAndStopRunningTask(this.currentTask.stopCondition)', self.source)
        self.assertIn('this.callbacks.onLootUpdate?.(loot, ship)', self.source)
        self.assertIn('this.runtime.applyLootUpdate(loot, ship)', self.source)

    def test_log_parser_remains_as_fallback(self) -> None:
        self.assertIn('processBackendLog(message)', self.source)
        self.assertIn('parseUiCount', self.source)
        self.assertIn('!this.lootEventSeen && (loot != null || ship != null)', self.source)

    def test_http_transport_normalizes_4xx_5xx(self) -> None:
        self.assertIn('normalizeHttpFailure(payload, response.status)', self.source)
        self.assertIn('payload.success === false && Number(payload.status) >= 400', self.source)


if __name__ == '__main__':
    result = unittest.main(verbosity=2, exit=False).result
    raise SystemExit(0 if result.wasSuccessful() else 1)
