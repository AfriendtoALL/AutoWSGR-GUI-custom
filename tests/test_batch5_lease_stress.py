"""批次 5.2 离线压力测试：连续 100 次短任务，验证 409 消失。

复现的是真实前端节奏——只要任务状态离开 ``running``，调度层就会立刻
派发下一个任务。若 ``_run_in_thread`` 先写终态、后释放设备租约，新任务
的 ``acquire()`` 就会在这条缝隙里撞上 409。

测试从三个角度取证：

1. **准入压力**：100 次「上一任务刚结束 → 立即启动下一任务」，统计
   ``DeviceOperationBusyError``（即 HTTP 409 的内核）次数，必须为 0；
2. **状态/租约一致性**：每次观察到终态时立刻读 ``device_lease``，必须
   已经为空；
3. **释放顺序**：给租约打桩，记录 ``release()`` 执行瞬间的任务状态，必须
   仍是 ``running``（先放租约、后写终态）。

运行::

    python tests\\test_batch5_lease_stress.py
"""

from __future__ import annotations

import sys
import time
import unittest
from typing import Any

from autowsgr.server.device_lease import (
    DeviceOperationBusyError,
    DeviceOperationLease,
)
from autowsgr.server.task_manager import TaskManager, TaskOutcome


TOTAL_TASKS = 100


class _RecordingLease(DeviceOperationLease):
    """记录每次 release() 瞬间任务处于什么状态。"""

    def __init__(self) -> None:
        super().__init__()
        self.manager_getter: Any = lambda: None
        self.released_statuses: list[str] = []

    def release(self, token: Any) -> None:
        manager = self.manager_getter()
        task = manager.current_task if manager is not None else None
        self.released_statuses.append(task.status.value if task is not None else 'none')
        super().release(token)


def _wait_until_idle(manager: TaskManager, timeout: float = 5.0) -> bool:
    """按前端视角轮询：只要 is_running 为假就返回。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not manager.is_running:
            return True
        time.sleep(0.0002)
    return False


class LeaseReleaseStressTest(unittest.TestCase):
    def test_100_short_tasks_never_hit_busy(self) -> None:
        lease = _RecordingLease()
        manager = TaskManager(device_lease=lease)
        lease.manager_getter = lambda: manager

        busy_failures: list[str] = []
        admission_failures: list[str] = []
        terminal_with_lease: list[int] = []

        def make_executor(stoppable: bool) -> Any:
            def executor(task: Any) -> TaskOutcome:
                if stoppable:
                    deadline = time.monotonic() + 1.0
                    while not task.stop_requested and time.monotonic() < deadline:
                        time.sleep(0.0005)
                return TaskOutcome.from_results([{'round': 1, 'success': True}])

            return executor

        for index in range(TOTAL_TASKS):
            # 1) 前端视角：状态一离开 running 就立刻派下一个任务。
            if not _wait_until_idle(manager):
                admission_failures.append(f'#{index}: 上一任务未在 5s 内结束')
                break

            stoppable = index % 2 == 1
            try:
                manager.start_task(
                    f'stress-{index}',
                    1,
                    make_executor(stoppable),
                )
            except DeviceOperationBusyError as error:
                busy_failures.append(f'#{index}: {error}')
                continue
            except RuntimeError as error:
                if '已有任务正在运行' in str(error):
                    admission_failures.append(f'#{index}: {error}')
                else:
                    admission_failures.append(f'#{index}: {error!r}')
                continue

            if stoppable:
                # 模拟「任务刚跑起来就被停止」，覆盖 STOPPED 终态。
                deadline = time.monotonic() + 0.5
                while time.monotonic() < deadline:
                    if manager.stop_task():
                        break
                    time.sleep(0.0002)

            # 2) 看到终态的那一刻，设备租约必须已经为空。
            if not _wait_until_idle(manager):
                admission_failures.append(f'#{index}: 任务未在 5s 内结束')
                break
            if manager.get_device_lease() is not None:
                terminal_with_lease.append(index)

        manager.wait_for_completion(5.0)

        print()
        print(f'[5.2] 任务总数                 : {TOTAL_TASKS}')
        print(f'[5.2] DeviceOperationBusyError : {len(busy_failures)}')
        print(f'[5.2] 准入冲突                 : {len(admission_failures)}')
        print(f'[5.2] 终态仍持租约（观测点）   : {len(terminal_with_lease)}')
        print(f'[5.2] release() 瞬间状态分布   : {self._status_histogram(lease)}')

        self.assertEqual(busy_failures, [], '出现 409：新任务撞上了未释放的租约')
        self.assertEqual(admission_failures, [], '任务准入异常')
        self.assertEqual(terminal_with_lease, [], '状态已终态但设备租约仍被占用')
        self.assertEqual(
            set(lease.released_statuses),
            {'running'},
            'release() 必须发生在写终态之前',
        )
        self.assertEqual(len(lease.released_statuses), TOTAL_TASKS)

    @staticmethod
    def _status_histogram(lease: _RecordingLease) -> dict[str, int]:
        histogram: dict[str, int] = {}
        for status in lease.released_statuses:
            histogram[status] = histogram.get(status, 0) + 1
        return histogram


if __name__ == '__main__':
    result = unittest.main(verbosity=2, exit=False).result
    sys.exit(0 if result.wasSuccessful() else 1)
