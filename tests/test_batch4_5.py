"""批次 4.5 离线回归：WS 实时推送 UI 状态 + 前端状态指示器。

覆盖：

1. 后端负载：``ui_state_update`` 的 ``type/page/stack/phase/substate`` 字段稳定；
2. 变化去重：页面/导航栈/战斗阶段/子状态任一变化才推，同一状态不重复；
3. 页面识别与子状态入口：``get_current_page`` 观察者、``record_page_substate``
   在导航栈未跟上时也能把「确认过的页面」推给前端；
4. 线程桥：``TaskManager.publish_ui_state`` 复用 5.8 的线程安全投递；
5. 前端：Scheduler 30 秒无更新转 stale、StatusBar 转黄 + pulse、VO 字段；
6. 打包：``app.asar`` 内的 renderer 与工作副本一致（前端改动必须重打包）。

运行::

    python tests\\test_batch4_5.py -v
"""

from __future__ import annotations

import asyncio
import json
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from autowsgr.context.game_context import GameContext
from autowsgr.server import main as server_main
from autowsgr.server.task_manager import TaskManager
from autowsgr.server.ws_manager import WebSocketManager
from autowsgr.types import PageName
from autowsgr.ui import page as ui_page
from autowsgr.ui.page import (
    get_page_observer,
    set_page_observer,
)
from autowsgr.ui.stack import record_page_substate
from autowsgr.vision.page_match import PageMatch


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.workbuddy' / 'asar_work'
RENDERER = WORK / 'dist' / 'renderer.bundle.js'
SOURCE_MAP = RENDERER.with_name(RENDERER.name + '.map')
ASAR = ROOT / 'resources' / 'app.asar'


def _context() -> GameContext:
    # 4.5 的状态推送不依赖设备/OCR，构造一个最小上下文即可。
    return GameContext(ctrl=None, config=None, ocr=None)  # type: ignore[arg-type]


def _bundle_text() -> str:
    return RENDERER.read_text(encoding='utf-8').replace('\r\n', '\n')


def _extract_module_body(text: str, module_path: str) -> str:
    banner = f'  // {module_path}\n'
    start = text.index(banner) + len(banner)
    open_line = text.index('(exports)', start)
    body_start = text.index('\n', open_line) + 1
    body_end = text.index('\n    }\n  });', body_start)
    body = text[body_start:body_end]
    return '\n'.join(line[6:] if line.startswith('      ') else line for line in body.split('\n'))


def _run_node(script: str) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / 'harness.js'
        path.write_text(script, encoding='utf-8')
        completed = subprocess.run(
            ['node', str(path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120,
        )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise AssertionError(
            f'node 无输出\nstdout={completed.stdout}\nstderr={completed.stderr}'
        )
    if completed.returncode != 0:
        raise AssertionError(
            f'node 退出码 {completed.returncode}\nstdout={completed.stdout}\n'
            f'stderr={completed.stderr}'
        )
    return json.loads(lines[-1])


def _asar_files() -> dict[str, tuple[dict[str, Any], bytes]]:
    raw = ASAR.read_bytes()
    _n1, n2, _n3, n4 = struct.unpack('<IIII', raw[:16])
    header = json.loads(raw[16 : 16 + n4].decode('utf-8'))
    content_start = 8 + n2
    files: dict[str, tuple[dict[str, Any], bytes]] = {}

    def walk(node: dict[str, Any], prefix: str = '') -> None:
        for name, meta in node.get('files', {}).items():
            path = prefix + name
            if 'files' in meta:
                walk(meta, path + '/')
                continue
            if meta.get('unpacked') or 'offset' not in meta:
                continue
            offset = int(meta['offset'])
            size = int(meta['size'])
            files[path] = (meta, raw[content_start + offset : content_start + offset + size])

    walk(header)
    return files


class _FakeWebSocket:
    """最小 WebSocket 替身：记录每条 JSON 负载。"""

    def __init__(self) -> None:
        self.accepted = False
        self.payloads: list[dict[str, Any]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, data: str) -> None:
        self.payloads.append(json.loads(data))


class UiStatePayloadTest(unittest.IsolatedAsyncioTestCase):
    """4.5：WS 负载与连接隔离。"""

    async def test_send_ui_state_update_payload_is_stable(self) -> None:
        manager = WebSocketManager('test')
        websocket = _FakeWebSocket()
        await manager.connect(websocket)  # type: ignore[arg-type]

        await manager.send_ui_state_update(
            page='地图页面',
            stack=('主页面', '地图页面'),
            phase='FIGHT_PERIOD',
            substate='出征/2-3',
        )

        self.assertEqual(
            websocket.payloads,
            [
                {
                    'type': 'ui_state_update',
                    'page': '地图页面',
                    'stack': ['主页面', '地图页面'],
                    'phase': 'FIGHT_PERIOD',
                    'substate': '出征/2-3',
                }
            ],
        )
        await manager.disconnect(websocket)  # type: ignore[arg-type]

    async def test_empty_state_is_still_serializable(self) -> None:
        manager = WebSocketManager('test')
        websocket = _FakeWebSocket()
        await manager.connect(websocket)  # type: ignore[arg-type]
        await manager.send_ui_state_update(page=None, stack=None, phase=None)
        payload = websocket.payloads[0]
        self.assertIsNone(payload['page'])
        self.assertIsNone(payload['phase'])
        self.assertEqual(payload['stack'], [])


class ContextPublishTest(unittest.TestCase):
    """4.5：只在状态变化时推送，且状态字段自洽。"""

    def setUp(self) -> None:
        self.ctx = _context()
        self.payloads: list[dict[str, Any]] = []
        self.ctx.ui_state_sink = self.payloads.append

    def test_dedupes_until_any_field_changes(self) -> None:
        ctx = self.ctx
        ctx.ui_stack.reset(PageName.MAIN.value)
        self.assertTrue(ctx.publish_ui_state(page=PageName.MAIN.value, force=True))
        self.assertEqual(self.payloads[-1]['stack'], ['主页面'])

        # 同状态重复上报：不推。
        self.assertFalse(ctx.publish_ui_state(page=PageName.MAIN.value))
        self.assertEqual(len(self.payloads), 1)

        # 导航栈推进：即使页面已提前上报过，栈变化也要推。
        ctx.ui_stack.push(PageName.MAP.value)
        self.assertTrue(ctx.publish_ui_state(page=PageName.MAP.value))
        self.assertEqual(self.payloads[-1]['page'], '地图页面')
        self.assertEqual(self.payloads[-1]['stack'], ['主页面', '地图页面'])

        # 战斗阶段切换：推；同一阶段重复设置：不推。
        self.assertTrue(ctx.set_combat_phase('FIGHT_PERIOD'))
        self.assertEqual(self.payloads[-1]['phase'], 'FIGHT_PERIOD')
        self.assertFalse(ctx.set_combat_phase('FIGHT_PERIOD'))
        self.assertEqual(len(self.payloads), 3)

        # 子状态变化：推。
        self.assertTrue(ctx.publish_ui_state(page=PageName.MAP.value, substate='出征/2-3'))
        self.assertEqual(self.payloads[-1]['substate'], '出征/2-3')

        # 战斗结束清空阶段：推。
        self.assertTrue(ctx.set_combat_phase(None))
        self.assertIsNone(self.payloads[-1]['phase'])

    def test_unknown_page_keeps_last_confirmed_page(self) -> None:
        ctx = self.ctx
        ctx.observe_page(PageName.MAIN.value)
        pushed = len(self.payloads)
        self.assertFalse(ctx.observe_page(None))
        self.assertEqual(len(self.payloads), pushed)
        self.assertEqual(ctx.ui_current_page, '主页面')

    def test_page_change_clears_stale_substate(self) -> None:
        ctx = self.ctx
        ctx.publish_ui_state(page=PageName.MAP.value, substate='出征/2-3')
        self.assertEqual(ctx.ui_substate, '出征/2-3')
        ctx.publish_ui_state(page=PageName.BATTLE_PREP.value)
        self.assertIsNone(ctx.ui_substate)
        self.assertEqual(ctx.ui_current_page, '出征准备')

    def test_reset_pushes_forced_baseline(self) -> None:
        ctx = self.ctx
        ctx.publish_ui_state(page=PageName.MAP.value, substate='出征/2-3')
        self.assertTrue(ctx.reset_ui_state())
        payload = self.payloads[-1]
        self.assertIsNone(payload['page'])
        self.assertIsNone(payload['substate'])
        self.assertIsNone(payload['phase'])
        # 再 reset 也是强制推送（前端每次任务启动都需要一条基线）。
        self.assertTrue(ctx.reset_ui_state())

    def test_broken_sink_does_not_raise(self) -> None:
        def broken(_payload: dict[str, Any]) -> None:
            raise RuntimeError('ws down')

        self.ctx.ui_state_sink = broken
        self.assertFalse(self.ctx.publish_ui_state(page=PageName.MAIN.value, force=True))


class PageObserverTest(unittest.TestCase):
    """4.5：页面识别 / 子状态入口都会成为推送来源。"""

    def setUp(self) -> None:
        self._registry = dict(ui_page._PAGE_REGISTRY)
        self._overlays = set(ui_page._OVERLAY_PAGES)
        self._always = set(ui_page._ALWAYS_PAGES)
        self.ctx = _context()
        self.payloads: list[dict[str, Any]] = []
        self.ctx.ui_state_sink = self.payloads.append
        self.screen = __import__('numpy').zeros((540, 960, 3), dtype='uint8')

    def tearDown(self) -> None:
        set_page_observer(None)
        ui_page._PAGE_REGISTRY.clear()
        ui_page._PAGE_REGISTRY.update(self._registry)
        ui_page._OVERLAY_PAGES.clear()
        ui_page._OVERLAY_PAGES.update(self._overlays)
        ui_page._ALWAYS_PAGES.clear()
        ui_page._ALWAYS_PAGES.update(self._always)

    def _register(self, name: str) -> None:
        ui_page.register_page(
            name,
            lambda _screen: PageMatch(name=name, matched=True, score=1.0, threshold=0.5),
        )

    def test_get_current_page_notifies_context_and_dedupes(self) -> None:
        self._register('主页面')
        self.ctx.ui_stack.reset('主页面')
        set_page_observer(self.ctx.observe_page)

        first = ui_page.get_current_page(self.screen, candidates={'主页面'})
        second = ui_page.get_current_page(self.screen, candidates={'主页面'})
        self.assertEqual((first, second), ('主页面', '主页面'))
        # 识别两次只推一次：去重在 GameContext，不在识别热点里做状态机。
        self.assertEqual(len(self.payloads), 1)
        self.assertEqual(self.payloads[0]['page'], '主页面')

        # 切到另一页：候选集只给新页，避免两页同分触发 margin 判 UNKNOWN。
        self._register('地图页面')
        self.ctx.ui_stack.push('地图页面')
        third = ui_page.get_current_page(self.screen, candidates={'地图页面'})
        self.assertEqual(third, '地图页面')
        self.assertEqual(self.payloads[-1]['page'], '地图页面')
        self.assertEqual(self.payloads[-1]['stack'], ['主页面', '地图页面'])

    def test_unknown_result_does_not_blink_unknown(self) -> None:
        self._register('主页面')
        self.ctx.ui_stack.reset('主页面')
        set_page_observer(self.ctx.observe_page)
        ui_page.get_current_page(self.screen, candidates={'主页面'})
        pushed = len(self.payloads)

        ui_page.register_page(
            '永不命中',
            lambda _screen: PageMatch(name='永不命中', matched=False, score=0.0),
        )
        result = ui_page.get_current_page(self.screen, candidates={'永不命中'})
        self.assertIsNone(result)
        self.assertEqual(len(self.payloads), pushed)
        self.assertEqual(self.ctx.ui_current_page, '主页面')

    def test_record_substate_publishes_even_if_stack_lags(self) -> None:
        self.ctx.ui_stack.reset(PageName.MAP.value)
        written = record_page_substate(self.ctx, PageName.BATTLE_PREP.value, '出征/2-3')
        self.assertFalse(written)  # 栈仍在地图页，不篡改导航栈
        self.assertEqual(self.payloads[-1]['page'], '出征准备')
        self.assertEqual(self.payloads[-1]['substate'], '出征/2-3')
        self.assertEqual(self.payloads[-1]['stack'], ['地图页面'])

    def test_record_substate_writes_stack_when_page_matches(self) -> None:
        self.ctx.ui_stack.reset(PageName.BATTLE_PREP.value)
        written = record_page_substate(self.ctx, PageName.BATTLE_PREP.value, '快速补给')
        self.assertTrue(written)
        self.assertEqual(self.ctx.ui_stack.substate, '快速补给')
        self.assertEqual(self.payloads[-1]['substate'], '快速补给')


class ThreadBridgeTest(unittest.IsolatedAsyncioTestCase):
    """4.5：worker 线程 → 事件循环 → /ws/task。"""

    async def test_task_manager_publishes_into_running_loop(self) -> None:
        manager = TaskManager()
        manager.set_loop(asyncio.get_running_loop())
        fake_ws = mock.Mock()
        fake_ws.send_ui_state_update = mock.AsyncMock()

        with mock.patch('autowsgr.server.task_manager.task_ws_manager', fake_ws):
            manager.publish_ui_state(
                {
                    'page': '地图页面',
                    'stack': ['主页面', '地图页面'],
                    'phase': 'FIGHT_PERIOD',
                    'substate': None,
                }
            )
            await asyncio.sleep(0.05)

        fake_ws.send_ui_state_update.assert_awaited_once_with(
            page='地图页面',
            stack=['主页面', '地图页面'],
            phase='FIGHT_PERIOD',
            substate=None,
        )

    def test_task_manager_ignores_closed_loop(self) -> None:
        manager = TaskManager()
        loop = asyncio.new_event_loop()
        loop.close()
        manager.set_loop(loop)
        fake_ws = mock.Mock()
        fake_ws.send_ui_state_update = mock.AsyncMock()

        with mock.patch('autowsgr.server.task_manager.task_ws_manager', fake_ws):
            manager.publish_ui_state({'page': '主页面', 'stack': ['主页面']})

        fake_ws.send_ui_state_update.assert_not_called()

    def test_server_binds_and_unbinds_page_observer(self) -> None:
        ctx = _context()
        with mock.patch.object(server_main.task_manager, 'publish_ui_state') as publish:
            server_main.bind_context_observers(ctx)
            observer = get_page_observer()
            self.assertIsNotNone(observer)
            self.assertIs(getattr(observer, '__self__', None), ctx)
            ctx.observe_page(PageName.MAIN.value)
            publish.assert_called_once()
            self.assertEqual(publish.call_args.args[0]['page'], '主页面')

            server_main.unbind_context_observers(ctx)
            self.assertIsNone(get_page_observer())
            self.assertIsNone(ctx.ui_state_sink)


class CombatPhasePushTest(unittest.TestCase):
    """4.5：战斗引擎每个阶段迁移都推送（含本局未出现的 NIGHT_PROMPT）。"""

    def test_reset_and_phase_transition_publish(self) -> None:
        from types import SimpleNamespace

        from autowsgr.combat.engine import CombatEngine
        from autowsgr.combat.plan import CombatMode
        from autowsgr.combat.state import CombatPhase

        ctx = _context()
        payloads: list[dict[str, Any]] = []
        ctx.ui_state_sink = payloads.append

        engine = CombatEngine(ctx)
        engine._reset()
        self.assertEqual(payloads[-1]['phase'], 'START_FIGHT')

        engine._plan = SimpleNamespace(
            mode=CombatMode.NORMAL,
            transitions={
                CombatPhase.FIGHT_PERIOD: [CombatPhase.NIGHT_PROMPT],
                CombatPhase.NIGHT_PROMPT: [],
            },
            end_phase=None,
        )
        engine._phase = CombatPhase.FIGHT_PERIOD
        engine._last_action = 'yes'
        engine._recognizer = mock.Mock()
        engine._recognizer.wait_for_phase.return_value = CombatPhase.NIGHT_PROMPT

        new_phase = engine._update_state()
        self.assertIs(new_phase, CombatPhase.NIGHT_PROMPT)
        self.assertEqual(payloads[-1]['phase'], 'NIGHT_PROMPT')
        # 同一阶段重复设置不重复推送。
        before = len(payloads)
        ctx.set_combat_phase(CombatPhase.NIGHT_PROMPT)
        self.assertEqual(len(payloads), before)
        ctx.set_combat_phase(None)
        self.assertIsNone(payloads[-1]['phase'])


class FrontendBundleTest(unittest.TestCase):
    """4.5：前端订阅、30s stale 与指示器文案。"""

    @classmethod
    def setUpClass(cls) -> None:
        cls.text = _bundle_text()

    def test_ws_dispatch_and_wiring(self) -> None:
        self.assertEqual(self.text.count('msg.type === "ui_state_update"'), 1)
        self.assertEqual(self.text.count('this.applyUiState(msg)'), 1)
        self.assertEqual(self.text.count('onUiStateChange: () => {'), 1)
        self.assertEqual(self.text.count('var UI_STATE_STALE_MS = 3e4;'), 1)
        self.assertIn('id = "nav-ui-state"', self.text)
        self.assertIn('function formatCombatPhaseName(name)', self.text)

    def test_scheduler_stale_and_reset(self) -> None:
        module = _extract_module_body(self.text, 'dist/src/model/scheduler/Scheduler.js')
        script = f"""
const timers = [];
const cleared = [];
let nextTimerId = 1;
globalThis.setTimeout = (fn, ms) => {{ const id = nextTimerId++; timers.push({{ id, fn, ms }}); return id; }};
globalThis.clearTimeout = (id) => {{ cleared.push(id); }};
const exportsObj = {{}};
const factory = new Function(
  'require_Logger', 'require_adapter', 'require_StopConditionChecker', 'require_ExpeditionTimer',
  'require_TaskQueue', 'require_scheduler', 'require_SchedulerTaskPolicy', 'exports',
  {json.dumps(module)}
);
factory(
  () => ({{ Logger: {{ debug() {{}}, info() {{}}, warn() {{}}, error() {{}} }} }}),
  () => ({{ jsonCodec: {{ stringify: JSON.stringify }} }}),
  () => ({{ StopConditionChecker: class {{ updateTracked() {{}} }} }}),
  () => ({{ ExpeditionTimer: class {{ start() {{}} stop() {{}} }} }}),
  () => ({{ TaskQueue: class {{ constructor() {{ this.items = []; }} get length() {{ return 0; }} }} }}),
  () => ({{ TaskPriority: {{ EXPEDITION: 0, USER_TASK: 1, DAILY: 2 }} }}),
  () => ({{ findPriorityInsertionIndex: () => -1, createSchedulerTask: (task) => task }}),
  exportsObj
);
const changes = [];
const scheduler = new exportsObj.Scheduler({{ setCallbacks() {{}} }});
scheduler.setCallbacks({{ onUiStateChange: () => changes.push("change") }});
scheduler.applyUiState({{ type: "ui_state_update", page: "地图页面", stack: ["主页面", "地图页面"], phase: "FIGHT_PERIOD" }});
const first = {{ state: scheduler.uiState, stale: scheduler.uiStateStale, timers: timers.map((t) => t.ms), changes: changes.length }};
timers[timers.length - 1].fn();
const stale = {{ stale: scheduler.uiStateStale, changes: changes.length }};
scheduler.applyUiState({{ page: "出征准备", stack: ["主页面", "地图页面"], phase: "START_FIGHT", substate: "出征/2-3" }});
const second = {{ stale: scheduler.uiStateStale, cleared: cleared.length, page: scheduler.uiState.page, phase: scheduler.uiState.phase, substate: scheduler.uiState.substate }};
scheduler.resetUiState();
const reset = {{ state: scheduler.uiState, stale: scheduler.uiStateStale, cleared: cleared.length }};
scheduler.applyUiState({{ page: null, stack: ["旧路径"], phase: null, substate: null }});
const baseline = {{ state: scheduler.uiState, stale: scheduler.uiStateStale }};
console.log(JSON.stringify({{ first, stale, second, reset, baseline }}));
"""
        result = _run_node(script)
        self.assertEqual(result['first']['state']['page'], '地图页面')
        self.assertEqual(result['first']['state']['stack'], ['主页面', '地图页面'])
        self.assertEqual(result['first']['state']['phase'], 'FIGHT_PERIOD')
        self.assertFalse(result['first']['stale'])
        self.assertEqual(result['first']['timers'], [30000])
        self.assertEqual(result['first']['changes'], 1)
        self.assertTrue(result['stale']['stale'])
        self.assertEqual(result['stale']['changes'], 2)
        self.assertFalse(result['second']['stale'])
        self.assertEqual(result['second']['page'], '出征准备')
        self.assertEqual(result['second']['substate'], '出征/2-3')
        self.assertIsNone(result['reset']['state'])
        self.assertFalse(result['reset']['stale'])
        self.assertGreaterEqual(result['reset']['cleared'], 1)
        self.assertIsNone(result['baseline']['state'])

    def test_view_object_and_indicator(self) -> None:
        rendering = _extract_module_body(
            self.text, 'dist/src/controller/app/rendering.js'
        )
        statusbar = _extract_module_body(self.text, 'dist/src/view/main/StatusBar.js')
        script = f"""
class FakeElement {{
  constructor(tag) {{
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {{}};
    this.style = {{}};
    this.attributes = {{}};
    this.textContent = "";
    this.title = "";
    this.className = "";
    this.listeners = {{}};
    this.parentElement = null;
  }}
  append(...nodes) {{ for (const node of nodes) {{ node.parentElement = this; this.children.push(node); }} }}
  insertBefore(node) {{ node.parentElement = this; this.children.unshift(node); return node; }}
  addEventListener(type, handler) {{ (this.listeners[type] || (this.listeners[type] = [])).push(handler); }}
  setAttribute(name, value) {{ this.attributes[name] = String(value); }}
  get firstChild() {{ return this.children[0] || null; }}
}}
const elements = {{}};
const runtime = new FakeElement("div");
globalThis.document = {{
  getElementById: (id) => (elements[id] || (elements[id] = new FakeElement("div"))),
  createElement: (tag) => new FakeElement(tag),
  querySelector: (selector) => (selector === ".nav-runtime" ? runtime : null)
}};
const renderingExports = {{}};
const renderingFactory = new Function('require_constants', 'exports', {json.dumps(rendering)});
renderingFactory(
  () => ({{ STATUS_TEXT: {{ idle: "空闲", running: "运行中", stopping: "正在停止…", not_connected: "未连接" }}, PRIORITY_LABELS: {{}} }}),
  renderingExports
);
const statusBarExports = {{}};
const statusBarFactory = new Function('require_TaskQueueView', 'exports', {json.dumps(statusbar)});
statusBarFactory(
  () => ({{ resolveTaskProgressPercent: () => 0.5 }}),
  statusBarExports
);
const buildMainViewObject = renderingExports.buildMainViewObject;
const bar = new statusBarExports.StatusBar();
const baseScheduler = {{
  status: "running",
  currentRunningTask: null,
  taskQueue: [],
  waitingTaskList: [],
  deviceLease: null,
  emulatorConnected: true,
  resolutionFallback: false,
  uiState: {{ page: "地图页面", stack: ["主页面", "地图页面"], phase: "FIGHT_PERIOD", substate: "出征/2-3" }},
  uiStateStale: false,
  uiStateStaleAfterMs: 30000
}};
const state = {{ scheduler: baseScheduler, currentFleet: [], currentProgress: "", trackedLoot: "", trackedShip: "", dailySortieStats: {{}}, wsConnected: true, expeditionTimerText: "00:00" }};
const runningVo = buildMainViewObject(state);
bar.renderUiState(runningVo);
const chip = runtime.children[0];
const active = {{ state: chip.dataset.state, text: chip.children[1].textContent, animation: chip.style.animation, active: runningVo.uiStateActive, stale: runningVo.uiStateStale, seconds: runningVo.uiStateStaleAfterSeconds }};
baseScheduler.uiStateStale = true;
const staleVo = buildMainViewObject(state);
bar.renderUiState(staleVo);
const stale = {{ state: chip.dataset.state, text: chip.children[1].textContent, animation: chip.style.animation, title: chip.title }};
baseScheduler.status = "idle";
const idleVo = buildMainViewObject(state);
bar.renderUiState(idleVo);
const idle = {{ state: chip.dataset.state, text: chip.children[1].textContent, active: idleVo.uiStateActive }};
console.log(JSON.stringify({{ active, stale, idle }}));
"""
        result = _run_node(script)
        self.assertTrue(result['active']['active'])
        self.assertFalse(result['active']['stale'])
        self.assertEqual(result['active']['seconds'], 30)
        self.assertEqual(result['active']['state'], 'active')
        self.assertIn('地图页面', result['active']['text'])
        self.assertIn('出征/2-3', result['active']['text'])
        self.assertIn('战斗中', result['active']['text'])
        self.assertEqual(result['active']['animation'], '')
        self.assertTrue(result['stale']['state'] == 'stale')
        self.assertIn('30s 无变化', result['stale']['text'])
        self.assertIn('pulse', result['stale']['animation'])
        self.assertIn('主页面 → 地图页面', result['stale']['title'])
        self.assertIn('可能卡住', result['stale']['title'])
        self.assertEqual(result['idle']['state'], 'idle')
        self.assertIn('空闲', result['idle']['text'])
        self.assertFalse(result['idle']['active'])

    def test_node_check_and_packed_asar(self) -> None:
        completed = subprocess.run(
            ['node', '--check', str(RENDERER)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)

        files = _asar_files()
        _meta, packed = files['dist/renderer.bundle.js']
        self.assertEqual(packed, RENDERER.read_bytes(), '前端改动必须重打包 app.asar')
        packed_text = packed.decode('utf-8')
        self.assertIn('ui_state_update', packed_text)
        self.assertIn('nav-ui-state', packed_text)

        _map_meta, packed_map = files['dist/renderer.bundle.js.map']
        self.assertEqual(packed_map, SOURCE_MAP.read_bytes())
        map_payload = json.loads(packed_map.decode('utf-8'))
        self.assertIn('src/view/main/StatusBar.js', map_payload['sources'])

        # 4.5 真机验收时暴露的 7b 打包遗漏：main.js 调 resourceDataRoot()，
        # 但 asar 里的 AppPaths.js 仍是旧版 → 每次启动后端都
        # "appPaths.resourceDataRoot is not a function"。这里锁住打包结果。
        _app_meta, app_paths = files['dist/electron/services/AppPaths.js']
        self.assertEqual(app_paths, (WORK / 'dist/electron/services/AppPaths.js').read_bytes())
        self.assertIn('resourceDataRoot()', app_paths.decode('utf-8'))
        script = f"""
const {{ AppPaths }} = require({json.dumps((WORK / 'dist/electron/services/AppPaths.js').as_posix())});
const paths = new AppPaths({{
  isPackaged: () => true,
  getResourcesPath: () => 'C:/install/resources',
  getPath: (name) => (name === 'exe' ? 'C:/install/AutoWSGR.exe' : 'C:/userdata'),
  moduleDirectory: 'C:/install/resources/app.asar/dist/electron'
}});
console.log(JSON.stringify({{ dataRoot: paths.resourceDataRoot(), resourceRoot: paths.resourceRoot() }}));
"""
        result = _run_node(script)
        self.assertEqual(Path(result['resourceRoot']).as_posix(), 'C:/install/resources')
        self.assertEqual(
            Path(result['dataRoot']).as_posix(),
            'C:/install/resources/resource',
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
