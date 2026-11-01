"""批次 7a 离线回归：7.2 / 7.3 / 7.5 / 7.9。

运行::

    .\\python\\python.exe tests\\test_batch7a.py -v
"""

from __future__ import annotations

import json
import os
import struct
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest import mock

from autowsgr.context import Resources
from autowsgr.infra import ResourceThresholdConfig, UserConfig
from autowsgr.ops.rounds import (
    STOP_REASON_RESOURCE_EXHAUSTED,
    evaluate_resource_thresholds,
)
from autowsgr.server.routes import task as task_routes
from autowsgr.server.schemas import TaskResult
from autowsgr.server.task_manager import TaskInfo, TaskOutcome


ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'python' / 'site-packages' / 'autowsgr'
ASAR = ROOT / 'resources' / 'app.asar'
RENDERER = ROOT / '.workbuddy' / 'asar_work' / 'dist' / 'renderer.bundle.js'


class _FakeTaskManager:
    """run_rounds 只依赖 should_stop / update_progress / add_result。"""

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


def _asar_paths() -> set[str]:
    raw = ASAR.read_bytes()
    _n1, _n2, _n3, n4 = struct.unpack('<IIII', raw[:16])
    header = json.loads(raw[16:16 + n4].decode('utf-8'))

    def walk(node: dict[str, Any], prefix: str = '') -> Any:
        for name, meta in node.get('files', {}).items():
            path = prefix + name
            if 'files' in meta:
                yield from walk(meta, path + '/')
            else:
                yield path

    return set(walk(header))


def _combat_result() -> Any:
    from autowsgr.combat.history import CombatResult
    from autowsgr.types import ConditionFlag

    return CombatResult(flag=ConditionFlag.OPERATION_SUCCESS)


class SchedulerRemovalTest(unittest.TestCase):
    """7.2：触发器链路下线，launcher 仍可用。"""

    def test_launch_still_importable(self) -> None:
        from autowsgr.scheduler import Launcher, launch

        self.assertTrue(callable(launch))
        self.assertTrue(callable(Launcher))

    def test_removed_exports_are_gone(self) -> None:
        import autowsgr.scheduler as scheduler

        for name in ('TaskScheduler', 'FightTask', 'build_daily_plan', 'run_yaml_plan'):
            self.assertFalse(hasattr(scheduler, name), name)

    def test_deleted_scheduler_files_are_absent(self) -> None:
        for name in ('scheduler.py', 'daily_plan.py', 'plan_runner.py', 'triggers.py'):
            self.assertFalse((PKG / 'scheduler' / name).exists(), name)
        self.assertTrue((PKG / 'scheduler' / 'launcher.py').exists())

    def test_ipc_registrar_removed_from_asar(self) -> None:
        paths = _asar_paths()
        self.assertNotIn('dist/electron/ipc/IpcRegistrar.js', paths)
        self.assertIn('dist/electron/services/BackendService.js', paths)

    def test_unused_page_signatures_removed(self) -> None:
        definitions = {
            path.relative_to(ROOT).as_posix()
            for path in (PKG / 'ui').rglob('*.py')
            if 'PAGE_SIGNATURE = ' in path.read_text(encoding='utf-8')
        }
        self.assertEqual(
            definitions,
            {
                'python/site-packages/autowsgr/ui/choose_ship_page.py',
                'python/site-packages/autowsgr/ui/start_screen_page.py',
            },
        )


class ChapterYConstantTest(unittest.TestCase):
    """7.3：名字与行为一致。"""

    def test_default_chapter_y_constant(self) -> None:
        from autowsgr.ui.map.base import BaseMapPage

        self.assertEqual(BaseMapPage.DEFAULT_CHAPTER_Y, 0.556)
        self.assertFalse(hasattr(BaseMapPage, 'find_selected_chapter_y'))

    def test_sortie_uses_named_constant(self) -> None:
        text = (PKG / 'ui' / 'map' / 'panels' / 'sortie.py').read_text(encoding='utf-8')
        self.assertIn('self.DEFAULT_CHAPTER_Y', text)
        self.assertNotIn('find_selected_chapter_y', text)


class IntensifyEnvInjectionTest(unittest.TestCase):
    """7.5：环境变量缺失时也能按安装布局解析数据路径。"""

    ENV_KEYS = (
        'AUTOWSGR_STRENGTHEN_DATA',
        'AUTOWSGR_SHIP_LIBRARY',
        'AUTOWSGR_WSG_NCC_DATA',
    )

    def setUp(self) -> None:
        self._env = {key: os.environ.get(key) for key in self.ENV_KEYS}
        for key in self.ENV_KEYS:
            os.environ.pop(key, None)

    def tearDown(self) -> None:
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_backend_service_injects_both_paths(self) -> None:
        text = (
            ROOT
            / '.workbuddy'
            / 'asar_work'
            / 'dist'
            / 'electron'
            / 'services'
            / 'BackendService.js'
        ).read_text(encoding='utf-8')
        self.assertIn('AUTOWSGR_STRENGTHEN_DATA', text)
        self.assertIn('AUTOWSGR_SHIP_LIBRARY', text)
        self.assertIn("path.join(dataRoot, 'strengthen.json')", text)
        self.assertIn("path.join(dataRoot, 'ship-library')", text)

    def test_preview_service_resolves_without_env(self) -> None:
        from autowsgr.server import intensify_preview_dependencies as dependencies

        service = dependencies.get_intensify_preview_service()
        self.assertEqual(service._strengthen_path.name, 'strengthen.json')
        self.assertEqual(service._manifest_path.name, 'manifest.json')
        self.assertEqual(service._manifest_path.parent.name, 'ship-library')

    def test_scan_service_configures_downstream_env(self) -> None:
        from autowsgr.server import intensify_preview_dependencies as dependencies

        context = SimpleNamespace(
            config=SimpleNamespace(
                emulator=SimpleNamespace(serial='127.0.0.1:16384'),
                ocr=SimpleNamespace(gpu=False),
            ),
            ctrl=object(),
            ocr=None,
        )
        service = dependencies.get_intensify_snapshot_scan_service(context)
        self.assertIsNotNone(service)
        self.assertTrue(os.environ['AUTOWSGR_SHIP_LIBRARY'].endswith('ship-library'))


class IntensifyRouteTest(unittest.IsolatedAsyncioTestCase):
    """7.5：缺 env 的配置型 503 应消失，未知会话走 404。"""

    async def test_snapshot_preview_unknown_session_is_404(self) -> None:
        from autowsgr.server.errors import ApiError
        from autowsgr.server.routes import ops as ops_routes
        from autowsgr.server.schemas import IntensifySnapshotPreviewRequest

        request = IntensifySnapshotPreviewRequest(
            session_id='missing',
            selected_target_ref='target',
            allowed_material_identities=['material'],
        )
        with self.assertRaises(ApiError) as raised:
            await ops_routes.intensify_snapshot_preview(request)
        self.assertEqual(raised.exception.status_code, 404)


class ResourceThresholdTest(unittest.TestCase):
    """7.9：后端资源阈值与 stop_reason。"""

    def setUp(self) -> None:
        self.fake_manager = _FakeTaskManager()
        self._original_manager = task_routes.task_manager
        task_routes.task_manager = self.fake_manager  # type: ignore[assignment]
        self.task_info = SimpleNamespace(task_id='task_resource')

    def tearDown(self) -> None:
        task_routes.task_manager = self._original_manager  # type: ignore[assignment]

    def _run(
        self,
        round_func: Any,
        times: int,
        *,
        provider: Any,
        thresholds: Any,
    ) -> Any:
        return task_routes.run_rounds(
            self.task_info,
            round_func,
            times,
            label='测试',
            resource_provider=provider,
            resource_thresholds=thresholds,
        )

    def test_low_resource_stops_before_first_round(self) -> None:
        calls: list[int] = []

        outcome = self._run(
            lambda round_num: calls.append(round_num) or _combat_result(),
            5,
            provider=lambda: Resources(fuel=10, ammo=9000, steel=9000, aluminum=9000),
            thresholds=ResourceThresholdConfig(fuel=100),
        )

        self.assertEqual(calls, [])
        self.assertEqual(outcome.stop_reason, STOP_REASON_RESOURCE_EXHAUSTED)
        self.assertIn('燃料', outcome.error or '')
        task_outcome = TaskOutcome.from_results(
            outcome.results,
            error=outcome.error,
            stop_reason=outcome.stop_reason,
        )
        self.assertFalse(task_outcome.success)
        self.assertEqual(task_outcome.stop_reason, 'resource_exhausted')

    def test_resource_drops_after_one_round(self) -> None:
        calls: list[int] = []
        snapshots = iter([
            Resources(fuel=9000, ammo=9000, steel=9000, aluminum=9000),
            Resources(fuel=10, ammo=9000, steel=9000, aluminum=9000),
        ])

        outcome = self._run(
            lambda round_num: calls.append(round_num) or _combat_result(),
            5,
            provider=lambda: next(snapshots),
            thresholds=ResourceThresholdConfig(fuel=100),
        )

        self.assertEqual(calls, [1])
        self.assertEqual(len(outcome.results), 1)
        self.assertEqual(outcome.stop_reason, STOP_REASON_RESOURCE_EXHAUSTED)
        self.assertIn('燃料', outcome.error or '')

    def test_all_zero_resources_are_treated_as_unknown(self) -> None:
        calls: list[int] = []

        outcome = self._run(
            lambda round_num: calls.append(round_num) or _combat_result(),
            2,
            provider=lambda: Resources(),
            thresholds=ResourceThresholdConfig(fuel=100),
        )

        self.assertEqual(calls, [1, 2])
        self.assertIsNone(outcome.stop_reason)

    def test_disabled_thresholds_do_not_stop(self) -> None:
        calls: list[int] = []

        outcome = self._run(
            lambda round_num: calls.append(round_num) or _combat_result(),
            2,
            provider=lambda: Resources(fuel=0, ammo=1, steel=1, aluminum=1),
            thresholds=ResourceThresholdConfig(),
        )

        self.assertEqual(calls, [1, 2])
        self.assertIsNone(outcome.stop_reason)

    def test_evaluator_reads_config_model_and_dict(self) -> None:
        resources = Resources(fuel=50, ammo=9000, steel=9000, aluminum=9000)
        self.assertIn(
            '燃料',
            evaluate_resource_thresholds(resources, {'fuel': 100}) or '',
        )
        self.assertIsNone(evaluate_resource_thresholds(resources, {'fuel': 50}))
        self.assertIn(
            '弹药',
            evaluate_resource_thresholds(resources, {'ammo': 10000}) or '',
        )

    def test_config_accepts_resource_thresholds(self) -> None:
        config = UserConfig(
            daily_automation={
                'resource_thresholds': {
                    'fuel': 100,
                    'ammo': 200,
                    'steel': 300,
                    'aluminum': 400,
                }
            }
        )
        thresholds = config.daily_automation.resource_thresholds  # type: ignore[union-attr]
        self.assertEqual((thresholds.fuel, thresholds.ammo), (100, 200))
        self.assertTrue(thresholds.enabled)

    def test_frontend_displays_resource_exhausted(self) -> None:
        text = RENDERER.read_text(encoding='utf-8')
        self.assertIn('backendStopReason === "resource_exhausted"', text)
        self.assertIn('"resource_exhausted"', text)
        self.assertIn('\\u8D44\\u6E90', text)

    def test_task_result_exposes_resource_reason(self) -> None:
        info = TaskInfo(task_id='t', task_type='normal_fight', total_rounds=5)
        self.assertEqual(
            TaskResult(stop_reason='resource_exhausted').stop_reason,
            'resource_exhausted',
        )
        self.assertEqual(info.stop_reason, None)


if __name__ == '__main__':
    unittest.main(verbosity=2)
