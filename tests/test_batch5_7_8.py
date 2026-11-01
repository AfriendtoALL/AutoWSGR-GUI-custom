"""批次 5.7 / 5.8 离线回归：TaskInfo 不可变快照 + 事件循环关闭容错。

覆盖三条验收路径：

1. **5.7 并发快照**：100 线程同时读写（4 个写者 + 96 个读者），每个读者
   校验拿到的 TaskInfo 是完整快照——``current_round`` 与 ``success_runs``
   自洽，``current_round``/``current_node`` 不会出现中间态；
2. **5.8 关窗容错**：模拟任务结束瞬间事件循环已关闭，连跑 20 次，任务仍判
   ``completed``，工作线程不再抛 ``RuntimeError``；
3. **接口契约**：``/api/task/status`` 返回字段与结构保持不变。

运行::

    .\\python\\python.exe tests\\test_batch5_7_8.py -v
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import contextlib
import dataclasses
import itertools
import threading
import time
import unittest
from collections.abc import Iterator
from typing import Any
from unittest import mock

from autowsgr.server.device_lease import DeviceOperationLease
from autowsgr.server.routes import task as task_routes
from autowsgr.server.schemas import TaskStatusResponse
from autowsgr.server.task_manager import (
    TaskInfo,
    TaskManager,
    TaskOutcome,
    TaskStatus,
)
from autowsgr.server.ws_manager import task_ws_manager


# 压测参数：4 写者 + 96 读者 = 100 线程；每个读者固定读 200 次，避免
# 快照摘要的 O(n) 计算把测试拖成分钟级。
WRITER_THREADS = 4
READER_THREADS = 96
STRESS_ROUNDS = 400
READS_PER_THREAD = 200


def _make_closed_loop() -> asyncio.AbstractEventLoop:
    """创建一个「已关窗」的事件循环：is_closed() 为真。"""
    loop = asyncio.new_event_loop()
    loop.close()
    return loop


@contextlib.contextmanager
def _running_task(
    manager: TaskManager,
    *,
    total_rounds: int = 1,
) -> Iterator[threading.Event]:
    """起一个卡在 gate 上的任务，退出 with 时放行并等待线程结束。"""
    gate = threading.Event()

    def executor(_task: TaskInfo) -> TaskOutcome:
        gate.wait(5.0)
        return TaskOutcome.from_results(
            [{'round': index + 1, 'success': True} for index in range(total_rounds)]
        )

    manager.start_task('helper-task', total_rounds, executor)
    try:
        yield gate
    finally:
        gate.set()
        manager.wait_for_completion(5.0)


class TaskInfoSnapshotTest(unittest.TestCase):
    """5.7：TaskInfo 是 frozen 快照，进度成对发布。"""

    def test_task_info_is_frozen(self) -> None:
        info = TaskInfo(task_id='t1', task_type='normal_fight')
        with self.assertRaises(dataclasses.FrozenInstanceError):
            info.current_round = 1  # type: ignore[misc]
        with self.assertRaises(dataclasses.FrozenInstanceError):
            info.results = ()  # type: ignore[misc]

    def test_update_progress_publishes_round_and_node_together(self) -> None:
        manager = TaskManager(device_lease=DeviceOperationLease())
        with _running_task(manager):
            manager.update_progress(current_round=3, current_node='node-3')
            snapshot = manager.current_task
            assert snapshot is not None
            self.assertEqual((snapshot.current_round, snapshot.current_node), (3, 'node-3'))
            # 不可变：重复读取拿到的是同一个已发布对象
            self.assertIs(manager.current_task, snapshot)

            # current_node=None 表示「不修改」，与旧接口语义一致
            manager.update_progress(current_round=4)
            snapshot = manager.current_task
            assert snapshot is not None
            self.assertEqual((snapshot.current_round, snapshot.current_node), (4, 'node-3'))

    def test_add_result_replaces_tuple_and_keeps_readers_safe(self) -> None:
        manager = TaskManager(device_lease=DeviceOperationLease())
        with _running_task(manager):
            manager.add_result({'round': 1, 'success': True})
            first = manager.current_task
            manager.add_result({'round': 2, 'success': False})

            assert first is not None
            self.assertEqual(len(first.results), 1, '旧快照不应被追加修改')
            current = manager.current_task
            assert current is not None
            self.assertEqual(len(current.results), 2)
            self.assertEqual(current.result_summary['success_runs'], 1)

    def test_executor_snapshot_sees_stop_requested(self) -> None:
        """停止信号仍能透传给执行器手里的那份快照（5.2 压测依赖它）。"""
        manager = TaskManager(device_lease=DeviceOperationLease())
        started = threading.Event()
        observed = threading.Event()

        def executor(task: TaskInfo) -> TaskOutcome:
            started.set()
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                if task.stop_requested:
                    observed.set()
                    return TaskOutcome.from_results([])
                time.sleep(0.001)
            raise RuntimeError('stop 请求没有透传到执行器快照')

        manager.start_task('stoppable', 1, executor)
        self.assertTrue(started.wait(2.0))
        self.assertTrue(manager.stop_task())
        self.assertTrue(manager.wait_for_completion(3.0))
        self.assertTrue(observed.is_set())
        self.assertEqual(manager.get_status()['status'], 'stopped')


class SnapshotConcurrencyStressTest(unittest.TestCase):
    """5.7：100 线程同时读写，任何一次读取都必须是自洽快照。"""

    def test_100_threads_read_consistent_snapshots(self) -> None:
        manager = TaskManager(device_lease=DeviceOperationLease())
        executor_started = threading.Event()
        executor_release = threading.Event()

        def executor(_task: TaskInfo) -> TaskOutcome:
            executor_started.set()
            if not executor_release.wait(10.0):
                raise RuntimeError('测试未放行 executor')
            return TaskOutcome.from_results(
                [{'round': index + 1, 'success': True} for index in range(STRESS_ROUNDS)]
            )

        manager.start_task('snapshot-stress', STRESS_ROUNDS, executor)
        self.assertTrue(executor_started.wait(2.0), '任务线程没有启动')

        start_gate = threading.Event()
        write_lock = threading.Lock()
        counter = itertools.count(1)
        writers_left = [WRITER_THREADS]
        writing_done = threading.Event()
        problems: list[str] = []

        def writer() -> None:
            try:
                while True:
                    with write_lock:
                        try:
                            round_no = next(counter)
                        except StopIteration:
                            return
                        if round_no > STRESS_ROUNDS:
                            return
                        manager.update_progress(
                            current_round=round_no,
                            current_node=f'node-{round_no}',
                        )
                        manager.add_result({'round': round_no, 'success': True})
            finally:
                with write_lock:
                    writers_left[0] -= 1
                    if writers_left[0] == 0:
                        writing_done.set()

        reads_done = [0] * READER_THREADS

        def reader(index: int) -> None:
            start_gate.wait()
            local_reads = 0
            for _ in range(READS_PER_THREAD):
                snapshot = manager.current_task
                if snapshot is None:
                    problems.append('current_task 在运行中变成 None')
                    return
                local_reads += 1
                findings = _snapshot_violations(snapshot)
                if findings:
                    problems.extend(f'#{index}: {item}' for item in findings)
                    return
                if len(problems) > 32:
                    return
            reads_done[index] = local_reads

        writers = [
            threading.Thread(target=writer, name=f'writer-{i}', daemon=True)
            for i in range(WRITER_THREADS)
        ]
        readers = [
            threading.Thread(target=reader, args=(i,), name=f'reader-{i}', daemon=True)
            for i in range(READER_THREADS)
        ]
        for thread in [*writers, *readers]:
            thread.start()
        start_gate.set()

        writers_done = writing_done.wait(10.0)
        for thread in writers:
            thread.join(10.0)
        for thread in readers:
            thread.join(10.0)

        live = [thread.name for thread in [*writers, *readers] if thread.is_alive()]
        executor_release.set()
        finished = manager.wait_for_completion(10.0)

        print()
        print(f'[5.7] 写线程 / 读线程       : {WRITER_THREADS} / {READER_THREADS}')
        print(f'[5.7] 轮次 / 实际总读取次数 : {STRESS_ROUNDS} / {sum(reads_done)}')
        print(f'[5.7] 观察到的不自洽快照    : {len(problems)}')

        self.assertTrue(writers_done, '写线程未在 10s 内完成')
        self.assertEqual(live, [], '压测线程未在 10s 内退出')
        self.assertTrue(finished, '任务线程未在 10s 内退出')
        self.assertEqual(problems, [], '读到半截快照')
        self.assertGreater(sum(reads_done), 0, '读者一次都没读到')
        final = manager.get_status()
        self.assertEqual(final['status'], 'completed')
        assert final['result'] is not None
        self.assertEqual(final['result']['success_runs'], STRESS_ROUNDS)


def _snapshot_violations(snapshot: TaskInfo) -> list[str]:
    """校验一份 TaskInfo 快照的内部自洽性。"""
    findings: list[str] = []
    summary = snapshot.result_summary
    details = summary['details']
    success_runs = summary['success_runs']
    rounds = [detail.get('round') for detail in details]

    computed_success = sum(1 for detail in details if detail.get('success', False))
    if success_runs != computed_success:
        findings.append(f'success_runs={success_runs} 与 details 成功数={computed_success} 不一致')

    if success_runs > snapshot.current_round:
        findings.append(
            f'成功轮次 {success_runs} 超过当前轮次 {snapshot.current_round}'
        )
    if snapshot.current_round - success_runs not in (0, 1):
        findings.append(
            f'current_round={snapshot.current_round} 与 success_runs={success_runs} 不自洽'
        )
    if snapshot.current_round > 0:
        expected_node = f'node-{snapshot.current_round}'
        if snapshot.current_node != expected_node:
            findings.append(
                f'轮次 {snapshot.current_round} 配到了节点 {snapshot.current_node!r}（中间态）'
            )

    if rounds != sorted(rounds):
        findings.append(f'结果轮次乱序: {rounds[:8]}')
    if len(rounds) != len(set(rounds)):
        findings.append('结果轮次重复')
    if snapshot.status is not TaskStatus.RUNNING or snapshot.finished_at is not None:
        findings.append(f'读取期间任务不应进入终态: {snapshot.status}, {snapshot.finished_at}')
    return findings


class ClosedLoopResilienceTest(unittest.TestCase):
    """5.8：退出瞬间 loop 已关闭，不得把成功任务误判为失败。"""

    def test_task_finishing_with_closed_loop_20_times(self) -> None:
        thread_errors: list[Any] = []
        original_hook = threading.excepthook

        def hook(args: Any) -> None:
            thread_errors.append(args)

        threading.excepthook = hook
        statuses: list[str] = []
        try:
            for _ in range(20):
                manager = TaskManager(device_lease=DeviceOperationLease())
                manager.set_loop(_make_closed_loop())

                def executor(_task: TaskInfo) -> TaskOutcome:
                    manager.update_progress(current_round=1, current_node='决战')
                    manager.update_progress(current_round=2)
                    return TaskOutcome.from_results([
                        {'round': 1, 'success': True},
                        {'round': 2, 'success': True},
                    ])

                manager.start_task('closed-loop', 2, executor)
                self.assertTrue(manager.wait_for_completion(5.0), '任务线程未退出')
                status = manager.get_status()
                statuses.append(status['status'])
        finally:
            threading.excepthook = original_hook

        print()
        print(f'[5.8] 关窗瞬间完成任务 20 次 : {statuses.count("completed")}/20 completed')
        print(f'[5.8] 工作线程未捕获异常     : {len(thread_errors)}')
        self.assertEqual(statuses, ['completed'] * 20, '关窗瞬间把成功任务判成了失败')
        self.assertEqual(thread_errors, [], '工作线程仍抛出未捕获异常')

    def test_submit_closes_coroutine_when_loop_closes_after_precheck(self) -> None:
        """precheck 通过但 loop 恰好关闭：捕获 RuntimeError 并关闭协程。"""
        loop = asyncio.new_event_loop()
        manager = TaskManager(device_lease=DeviceOperationLease())
        manager.set_loop(loop)
        created: list[Any] = []

        def factory() -> Any:
            async def coro() -> None:
                return None

            instance = coro()
            created.append(instance)
            return instance

        try:
            with mock.patch(
                'asyncio.run_coroutine_threadsafe',
                side_effect=RuntimeError('Event loop is closed'),
            ):
                manager._submit_to_loop(factory, label='test')
        finally:
            loop.close()

        self.assertEqual(len(created), 1)
        self.assertIsNone(created[0].cr_frame, '未投递的协程必须 close()，避免 never awaited')

    def test_done_callback_consumes_future_exception(self) -> None:
        failed = concurrent.futures.Future()
        failed.set_exception(RuntimeError('ws transport closed'))
        TaskManager._consume_future_exception(failed)

        cancelled = concurrent.futures.Future()
        cancelled.cancel()
        TaskManager._consume_future_exception(cancelled)

    def test_ws_send_failure_does_not_change_task_status(self) -> None:
        loop = asyncio.new_event_loop()
        loop_thread = threading.Thread(target=loop.run_forever, daemon=True)
        loop_thread.start()
        manager = TaskManager(device_lease=DeviceOperationLease())
        manager.set_loop(loop)
        loop_errors: list[dict[str, Any]] = []
        loop.set_exception_handler(lambda _loop, context: loop_errors.append(context))

        async def broken_send(**_kwargs: Any) -> None:
            raise RuntimeError('ws transport closed')

        try:
            with (
                mock.patch.object(task_ws_manager, 'send_task_update', broken_send),
                mock.patch.object(task_ws_manager, 'send_task_completed', broken_send),
            ):

                def executor(_task: TaskInfo) -> TaskOutcome:
                    manager.update_progress(current_round=1)
                    return TaskOutcome.from_results([{'round': 1, 'success': True}])

                manager.start_task('ws-down', 1, executor)
                self.assertTrue(manager.wait_for_completion(5.0))
                time.sleep(0.1)
        finally:
            loop.call_soon_threadsafe(loop.stop)
            loop_thread.join(5.0)
            loop.close()

        self.assertEqual(manager.get_status()['status'], 'completed')
        self.assertEqual(loop_errors, [], 'WS 推送异常泄漏到了事件循环')


class TaskStatusContractTest(unittest.IsolatedAsyncioTestCase):
    """/api/task/status 数据结构保持不变。"""

    async def test_status_payload_shape_while_running_and_after_finish(self) -> None:
        manager = TaskManager(device_lease=DeviceOperationLease())
        gate = threading.Event()
        started = threading.Event()

        def executor(_task: TaskInfo) -> TaskOutcome:
            started.set()
            gate.wait(5.0)
            return TaskOutcome.from_results([{'round': 1, 'success': True}])

        manager.start_task('contract', 1, executor)
        self.assertTrue(await asyncio.to_thread(started.wait, 2.0))
        manager.update_progress(current_round=1, current_node='战斗')

        with mock.patch.object(task_routes, 'task_manager', manager):
            running = await task_routes.task_status()

        self.assertTrue(running.success)
        self.assertIsNotNone(running.data)
        assert running.data is not None
        self.assertEqual(running.data.task_id, manager.current_task.task_id)  # type: ignore[union-attr]
        self.assertEqual(running.data.status, 'running')
        self.assertIsNotNone(running.data.progress)
        assert running.data.progress is not None
        self.assertEqual(running.data.progress.current, 1)
        self.assertEqual(running.data.progress.total, 1)
        self.assertEqual(running.data.progress.node, '战斗')
        self.assertIsNone(running.data.result)
        self.assertIsNone(running.data.error)
        self.assertIsNone(running.data.error_code)
        self.assertIsNone(running.data.error_type)

        gate.set()
        self.assertTrue(await asyncio.to_thread(manager.wait_for_completion, 5.0))

        with mock.patch.object(task_routes, 'task_manager', manager):
            finished = await task_routes.task_status()

        self.assertTrue(finished.success)
        self.assertIsNotNone(finished.data)
        assert finished.data is not None
        self.assertEqual(finished.data.status, 'completed')
        self.assertIsNone(finished.data.progress)
        self.assertIsNotNone(finished.data.result)
        assert finished.data.result is not None
        self.assertEqual(finished.data.result.total_runs, 1)
        self.assertEqual(finished.data.result.success_runs, 1)
        self.assertEqual(len(finished.data.result.details), 1)
        self.assertEqual(finished.data.result.details[0].round, 1)
        self.assertIsNone(finished.data.result.error)
        self.assertIsNone(finished.data.error)

        # 直接交给响应模型再校验一次：字段名/类型变化会在这里炸。
        TaskStatusResponse.model_validate(manager.get_status())
        self.assertEqual(
            set(manager.get_status()),
            {'task_id', 'status', 'progress', 'result', 'error', 'error_code', 'error_type'},
        )


if __name__ == '__main__':
    result = unittest.main(verbosity=2, exit=False).result
    raise SystemExit(0 if result.wasSuccessful() else 1)
