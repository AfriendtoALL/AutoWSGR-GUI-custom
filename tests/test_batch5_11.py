"""批次 5.11 离线回归：唯一轮次原语 + 船坞满语义 + 等级停止条件后端化。

覆盖验收路径：

1. 「打 10 次」中途两次船坞满且解装成功 → 实际开打 10 场，循环正常结束；
2. 船坞满且解装失败 → 立即停止，不再空跑剩余次数；
3. 等级停止条件由后端 ``run_rounds()`` 依据 ``fleet_levels`` 求值；
4. ``ops.normal_fight.run_for_times`` 与路由层共享同一套船坞满语义；
5. ``TaskOutcome`` / ``TaskResult`` 透传 ``stop_reason``，前端只读不重算。

运行::

    .\\python\\python.exe tests\\test_batch5_11.py -v
"""

from __future__ import annotations

import threading
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest import mock

from autowsgr.combat import CombatMode, CombatPlan
from autowsgr.context.ship import Ship
from autowsgr.ops.normal_fight import NormalFightRunner
from autowsgr.server.routes import task as task_routes
from autowsgr.server.schemas import NormalFightRequest, TaskResult
from autowsgr.server.task_manager import TaskInfo, TaskOutcome
from autowsgr.types import ConditionFlag


ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / '.workbuddy' / 'asar_work' / 'dist' / 'renderer.bundle.js'


def _combat_result(
    *,
    success: bool = True,
    dock_full: bool = False,
    dock_full_destroyed: bool = False,
    levels: list[int] | None = None,
) -> Any:
    from autowsgr.combat.history import CombatResult

    flag = ConditionFlag.DOCK_FULL if dock_full else ConditionFlag.OPERATION_SUCCESS
    if not success and not dock_full:
        flag = ConditionFlag.ACTION_FAILED
    fleet = [Ship(level=level) for level in levels] if levels is not None else None
    return CombatResult(
        flag=flag,
        fleet=fleet,
        dock_full_destroyed=dock_full_destroyed,
    )


class _FakeTaskManager:
    """只实现 run_rounds 需要的三个方法。"""

    def __init__(self) -> None:
        self.progress: list[tuple[int | None, str | None]] = []
        self.results: list[dict[str, Any]] = []
        self.stopping = False

    def should_stop(self) -> bool:
        return self.stopping

    def update_progress(
        self,
        current_round: int | None = None,
        current_node: str | None = None,
    ) -> None:
        self.progress.append((current_round, current_node))

    def add_result(self, result: dict[str, Any]) -> None:
        self.results.append(result)


class _RunRoundsCase(unittest.TestCase):
    def setUp(self) -> None:
        self.fake_manager = _FakeTaskManager()
        self._original_manager = task_routes.task_manager
        task_routes.task_manager = self.fake_manager  # type: ignore[assignment]
        self.task_info = SimpleNamespace(task_id='task_test')

    def tearDown(self) -> None:
        task_routes.task_manager = self._original_manager  # type: ignore[assignment]

    def _run(
        self,
        round_func: Any,
        times: int,
        *,
        stop_condition: Any = None,
    ) -> Any:
        return task_routes.run_rounds(
            self.task_info,
            round_func,
            times,
            label='测试',
            stop_condition=stop_condition,
        )

    def test_dock_full_resolved_does_not_consume_times(self) -> None:
        calls: list[int] = []

        def round_func(round_num: int) -> Any:
            calls.append(round_num)
            # 第 2、5 次尝试撞船坞满，但都解装成功。
            if len(calls) in (2, 5):
                return _combat_result(dock_full=True, dock_full_destroyed=True)
            return _combat_result()

        outcome = self._run(round_func, 10)

        self.assertEqual(len(calls), 12)
        self.assertEqual(len(outcome.results), 10)
        self.assertIsNone(outcome.stop_reason)
        self.assertIsNone(outcome.error)
        self.assertEqual(len(self.fake_manager.results), 10)
        self.assertEqual(self.fake_manager.progress[-1][0], 10)
        # 解装轮不占次数：第 2 轮出现两次（第二次是重试）。
        self.assertEqual([p[0] for p in self.fake_manager.progress[:3]], [1, 2, 2])

    def test_dock_full_failed_stops_immediately(self) -> None:
        calls: list[int] = []

        def round_func(round_num: int) -> Any:
            calls.append(round_num)
            if len(calls) == 2:
                return _combat_result(dock_full=True, dock_full_destroyed=False)
            return _combat_result()

        outcome = self._run(round_func, 10)

        self.assertEqual(len(calls), 2)
        self.assertEqual(len(outcome.results), 2)
        self.assertEqual(outcome.stop_reason, 'dock_full')
        self.assertIn('船坞已满', outcome.error or '')
        self.assertEqual(len(self.fake_manager.results), 2)
        self.assertEqual(self.fake_manager.progress[-1][0], 2)

        task_outcome = TaskOutcome.from_results(
            outcome.results,
            error=outcome.error,
            stop_reason=outcome.stop_reason,
        )
        self.assertFalse(task_outcome.success)
        self.assertEqual(task_outcome.stop_reason, 'dock_full')

    def test_level_stop_condition_hits_after_current_round(self) -> None:
        calls: list[int] = []

        def round_func(round_num: int) -> Any:
            calls.append(round_num)
            return _combat_result(levels=[80, 75, 74, 73, 72, 71])

        outcome = self._run(
            round_func,
            10,
            stop_condition={'level_slot': 0, 'level_ge': 80},
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(len(outcome.results), 1)
        self.assertEqual(outcome.stop_reason, 'stop_condition')
        task_outcome = TaskOutcome.from_results(
            outcome.results,
            stop_reason=outcome.stop_reason,
        )
        self.assertTrue(task_outcome.success)
        self.assertEqual(task_outcome.stop_reason, 'stop_condition')

    def test_level_stop_condition_not_met_continues(self) -> None:
        calls: list[int] = []

        def round_func(round_num: int) -> Any:
            calls.append(round_num)
            return _combat_result(levels=[79, 75, 74, 73, 72, 71])

        outcome = self._run(
            round_func,
            3,
            stop_condition={'level_slot': 0, 'level_ge': 80},
        )

        self.assertEqual(len(calls), 3)
        self.assertEqual(len(outcome.results), 3)
        self.assertIsNone(outcome.stop_reason)

    def test_level_stop_condition_uses_slot_index(self) -> None:
        calls: list[int] = []

        def round_func(round_num: int) -> Any:
            calls.append(round_num)
            return _combat_result(levels=[80, 75, 74, 73, 72, 71])

        outcome = self._run(
            round_func,
            10,
            stop_condition={'level_slot': 1, 'level_ge': 75},
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(outcome.stop_reason, 'stop_condition')

    def test_level_stop_condition_without_fleet_levels_keeps_running(self) -> None:
        calls: list[int] = []

        def round_func(round_num: int) -> Any:
            calls.append(round_num)
            return _combat_result(levels=None)

        outcome = self._run(
            round_func,
            2,
            stop_condition={'level_slot': 0, 'level_ge': 80},
        )

        self.assertEqual(len(calls), 2)
        self.assertIsNone(outcome.stop_reason)


class NormalFightDockSemanticsTest(unittest.TestCase):
    """第三份循环（ops.normal_fight）必须与路由层同一套船坞语义。"""

    def _runner(self) -> NormalFightRunner:
        ctx = SimpleNamespace(
            config=SimpleNamespace(dock_full_destroy=True, destroy_ship_types=None),
            ctrl=object(),
            stop_event=threading.Event(),
        )
        plan = CombatPlan(name='test', mode=CombatMode.NORMAL, chapter=1, map_id=1)
        selection = SimpleNamespace(fleet_id=1, source='test')
        return NormalFightRunner(ctx, plan, selection)  # type: ignore[arg-type]

    def test_dock_full_resolved_retries_without_counting(self) -> None:
        runner = self._runner()
        calls: list[int] = []

        def fake_run(**_kwargs: Any) -> Any:
            calls.append(len(calls) + 1)
            if len(calls) == 1:
                return _combat_result(dock_full=True, dock_full_destroyed=True)
            return _combat_result()

        runner.run = fake_run  # type: ignore[method-assign]
        results = runner.run_for_times(1)

        self.assertEqual(len(calls), 2)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].flag, ConditionFlag.OPERATION_SUCCESS)

    def test_dock_full_failed_stops_remaining_rounds(self) -> None:
        runner = self._runner()
        calls: list[int] = []

        def fake_run(**_kwargs: Any) -> Any:
            calls.append(len(calls) + 1)
            return _combat_result(dock_full=True, dock_full_destroyed=False)

        runner.run = fake_run  # type: ignore[method-assign]
        results = runner.run_for_times(10)

        self.assertEqual(len(calls), 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].flag, ConditionFlag.DOCK_FULL)


class _ExecutingTaskManager(_FakeTaskManager):
    """start_task 立即同步执行 executor，便于验证路由层接线。"""

    def __init__(self) -> None:
        super().__init__()
        self.outcome: TaskOutcome | None = None

    def start_task(self, task_type: str, total_rounds: int, executor: Any) -> str:
        self.outcome = executor(SimpleNamespace(task_id='task_route'))
        return 'task_route'


class RouteExecutorTest(unittest.IsolatedAsyncioTestCase):
    """常规战路由必须真正经过 run_rounds，并把 stop_reason 带回。"""

    async def test_normal_route_returns_backend_stop_reason(self) -> None:
        from autowsgr.combat import CombatPlan as RealCombatPlan
        from autowsgr.ops import run_normal_fight as real_run_normal_fight  # noqa: F401
        from autowsgr.server.schemas import NormalFightRequest

        manager = _ExecutingTaskManager()
        calls: list[int] = []

        def fake_run_normal_fight(
            _ctx: Any,
            _plan: Any,
            *,
            times: int = 1,
            fleet_selection: Any = None,
        ) -> list[Any]:
            calls.append(times)
            return [_combat_result(levels=[80, 75, 74, 73, 72, 71])]

        request = NormalFightRequest(
            type='normal_fight',
            plan_id='7-4',
            times=10,
            stop_condition={'level_slot': 0, 'level_ge': 80},
        )
        plan = RealCombatPlan(name='test', mode=CombatMode.NORMAL, chapter=1, map_id=1)

        with (
            mock.patch.object(task_routes, 'task_manager', manager),
            mock.patch.object(
                task_routes,
                'build_fleet_selection',
                lambda *_args, **_kwargs: SimpleNamespace(fleet_id=1),
            ),
            mock.patch(
                'autowsgr.ops.run_normal_fight',
                fake_run_normal_fight,
            ),
            mock.patch.object(
                RealCombatPlan,
                'from_yaml',
                classmethod(lambda _cls, _path: plan),
            ),
        ):
            response = await task_routes._start_normal_fight(object(), request)

        self.assertTrue(response.success)
        self.assertEqual(calls, [1])
        self.assertIsNotNone(manager.outcome)
        assert manager.outcome is not None
        self.assertEqual(manager.outcome.stop_reason, 'stop_condition')
        self.assertTrue(manager.outcome.success)


class StopReasonContractTest(unittest.TestCase):
    def test_task_result_summary_exposes_stop_reason(self) -> None:
        info = TaskInfo(task_id='t', task_type='normal_fight', total_rounds=10)
        info = replace(info, stop_reason='stop_condition')
        self.assertEqual(info.result_summary['stop_reason'], 'stop_condition')
        self.assertEqual(TaskResult(stop_reason='stop_condition').stop_reason, 'stop_condition')

    def test_request_accepts_stop_condition(self) -> None:
        request = NormalFightRequest(
            type='normal_fight',
            plan_id='7-4',
            stop_condition={'level_slot': 0, 'level_ge': 80},
        )
        self.assertEqual(request.stop_condition.level_slot, 0)  # type: ignore[union-attr]
        self.assertEqual(request.stop_condition.level_ge, 80)  # type: ignore[union-attr]

    def test_task_routes_have_single_round_primitive(self) -> None:
        text = (
            ROOT / 'python' / 'site-packages' / 'autowsgr' / 'server' / 'routes' / 'task.py'
        ).read_text(encoding='utf-8')
        self.assertIn('def run_rounds(', text)
        self.assertNotIn('for i in range(', text)
        self.assertEqual(text.count('= run_rounds(\n'), 4)  # normal / event / campaign / decisive

    def test_renderer_reads_backend_stop_reason_without_level_eval(self) -> None:
        text = RENDERER.read_text(encoding='utf-8')
        self.assertNotIn('checkLevel', text)
        self.assertNotIn('readSlotLevel', text)
        self.assertNotIn('fleet_levels', text)
        self.assertIn('backendStopReason', text)
        self.assertIn('stop_condition: task.stopCondition', text)


if __name__ == '__main__':
    unittest.main(verbosity=2)
