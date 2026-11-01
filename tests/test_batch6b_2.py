"""批次 6b-2 离线回归：日志定时器/缓冲/退避（6.9）、HTTP 超时定时器（6.10）、
sendSync→invoke 与启动链（6.11）、环境检查单飞（6.11a）。

覆盖验收路径：

1. ``Logger`` 的 ``dispose()`` 清掉周期定时器与退避定时器，之后不留句柄；
2. 写盘失败时 buffer 上限 5000 条、丢最旧，退避 1s→2s→4s…封顶 30s；
3. ``createHttpTransport`` 成功 / HTTP 失败 / 网络异常 / abort 四条路径都清定时器，
   高频请求压测后无残留定时器增长；
4. ``preload.js`` 13 个同步 getter 全部改 invoke，白名单方法名不变，``sendSync`` 为 0；
5. ``ConfigurationIpc.js`` 用 ``ipc.handle`` 注册同名通道，不再有 ``event.returnValue``；
6. 渲染层用 ``Promise.all`` 并行预取运行时配置、构造控制器前完成，且首屏骨架
   先于 bundle 绘制、首次渲染后移除；
7. ``checkAndPrepareEnv`` 单飞/幂等，「正在检查运行环境…」只剩一条来源。

运行::

    .\\python\\python.exe tests\\test_batch6b_2.py -v
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASAR = ROOT / '.workbuddy' / 'asar_work' / 'dist'
RENDERER = ASAR / 'renderer.bundle.js'
PRELOAD = ASAR / 'electron' / 'preload.js'
CONFIG_IPC = ASAR / 'electron' / 'ipc' / 'ConfigurationIpc.js'
INDEX_HTML = ROOT / '.workbuddy' / 'asar_work' / 'src' / 'view' / 'index.html'

NODE = 'node'

SYNC_CHANNELS = [
    'get-app-version-sync',
    'get-backend-port-sync',
    'get-gui-log-root-sync',
    'get-backend-startup-mode-sync',
    'get-backend-repo-path-sync',
    'get-ocr-gpu-mode-sync',
    'get-cuda-path-sync',
    'get-save-backend-screenshots-sync',
    'get-window-preferences-sync',
    'get-update-mode-sync',
    'get-backend-update-mode-sync',
    'get-allow-test-updates-sync',
    'get-python-path-sync',
]

ENV_NOTICE = '正在检查运行环境…'


def _bundle_text() -> str:
    return RENDERER.read_text(encoding='utf-8')


def _extract_module(text: str, module_path: str) -> str:
    """从 bundle 里取出单个 ``__commonJS`` 工厂的函数体。"""

    marker = f'    "{module_path}"(exports) {{'
    start = text.index(marker) + len(marker)
    end = text.index('\n    }\n  });', start)
    body = text[start:end]
    assert 'exports.' in body, module_path
    return body


def _run_node(script: str) -> dict:
    """把生成的 harness 写进临时文件并取回它写出的 JSON。"""

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'harness.cjs'
        result_path = Path(tmp) / 'result.json'
        path.write_text(script, encoding='utf-8', newline='\n')
        completed = subprocess.run(
            [NODE, str(path), str(result_path)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=180,
        )
        if completed.returncode != 0:
            raise AssertionError(
                f'node harness failed ({completed.returncode}):\n'
                f'{completed.stderr[-4000:]}'
            )
        return json.loads(result_path.read_text(encoding='utf-8'))


LOGGER_HARNESS = '''\
'use strict';
// 6.9/R32 行为压测：定时器全部走假实现，便于断言「dispose 后无残留」与退避序列。
const timers = { intervals: new Map(), timeouts: new Map() };
let seq = 0;
global.setInterval = (fn, ms) => { const id = ++seq; timers.intervals.set(id, { fn, ms }); return id; };
global.clearInterval = (id) => { timers.intervals.delete(id); };
global.setTimeout = (fn, ms) => { const id = ++seq; timers.timeouts.set(id, { fn, ms }); return id; };
global.clearTimeout = (id) => { timers.timeouts.delete(id); };

const __mod = { exports: {} };
(function (exports) {
/*__MODULE__*/
})(__mod.exports);

const Logger = __mod.exports.Logger;
// 每个场景用独立实例，避免上一场景卡在 flushInFlight 影响下一场景。
const LoggerImpl = Logger.constructor;
const makeLogger = (appendGuiLog) => {
  const logger = new LoggerImpl();
  logger.init({ appendGuiLog, uiCallback: () => {} });
  return logger;
};
const out = {};
const tick = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  // A) init 建 1 个周期定时器，dispose 后归零
  const a = makeLogger(() => Promise.resolve());
  a.info('one');
  out.intervalsAfterInit = timers.intervals.size;
  out.intervalMs = [...timers.intervals.values()][0].ms;
  await a.dispose();
  out.intervalsAfterDispose = timers.intervals.size;
  out.timeoutsAfterDispose = timers.timeouts.size;
  out.flushTimerAfterDispose = a.flushTimer;
  out.retryTimerAfterDispose = a.retryTimer;
  out.disposedAfterDispose = a.disposed;

  // B) 写盘卡死（永不 resolve）时 buffer 封顶 5000 且丢最旧
  const b = makeLogger(() => new Promise(() => {}));
  for (let i = 0; i < 100000; i += 1) b.logLevel('info', 'line-' + i);
  await tick();
  out.bufferLength = b.buffer.length;
  out.bufferLast = b.buffer[b.buffer.length - 1];
  out.bufferFirst = b.buffer[0];
  void b.dispose();

  // C) 写盘失败 → 退避 1s/2s/4s…封顶 30s
  const c = makeLogger(() => Promise.reject(new Error('disk full (ENOSPC)')));
  c.info('fail-me');
  await c.flush();
  const delays = [];
  for (let round = 0; round < 8; round += 1) {
    const entries = [...timers.timeouts.entries()];
    if (entries.length === 0) break;
    const [id, timer] = entries[0];
    delays.push(timer.ms);
    timers.timeouts.delete(id);
    timer.fn();
    await tick();
    await tick();
    await tick();
  }
  out.retryDelays = delays;
  out.pendingRetryTimers = timers.timeouts.size;

  // D) 恢复成功后清退避状态
  c.opts.appendGuiLog = () => Promise.resolve();
  await c.flush();
  out.timeoutsAfterSuccess = timers.timeouts.size;
  out.retryDelayMsAfterSuccess = c.retryDelayMs;

  await c.dispose();
  out.finalIntervals = timers.intervals.size;
  out.finalTimeouts = timers.timeouts.size;
  require('fs').writeFileSync(process.argv[2], JSON.stringify(out));
})().catch((error) => {
  process.stderr.write('harness error: ' + (error && error.stack || error) + '\\n');
  process.exit(1);
});
'''

TRANSPORT_HARNESS = '''\
'use strict';
// 6.10/R33 行为压测：假定时器记录未清理的超时句柄，覆盖成功/HTTP 失败/网络异常/abort。
const timers = { timeouts: new Map() };
let seq = 0;
global.setTimeout = (fn, ms) => { const id = ++seq; timers.timeouts.set(id, { fn, ms }); return id; };
global.clearTimeout = (id) => { timers.timeouts.delete(id); };
global.window = {};

let fetchMode = 'ok';
let aborts = 0;
global.AbortController = class {
  constructor() { this.signal = { aborted: false }; }
  abort() { aborts += 1; this.signal.aborted = true; }
};
global.fetch = async (_url, _init) => {
  if (fetchMode === 'reject') throw new Error('network down');
  if (fetchMode === 'abort') {
    const timer = timers.timeouts.values().next().value;
    if (timer) timer.fn();
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  }
  if (fetchMode === 'http500') return { ok: false, status: 500, json: async () => ({ detail: 'boom' }) };
  return { ok: true, status: 200, json: async () => ({ success: true }) };
};

const __mod = { exports: {} };
(function (exports) {
/*__MODULE__*/
})(__mod.exports);

const transport = __mod.exports.createHttpTransport('http://localhost:8438');
const out = {};

(async () => {
  for (const mode of ['ok', 'http500', 'reject', 'abort']) {
    fetchMode = mode;
    try {
      const result = await transport.request('GET', '/api/x', undefined, 5000);
      out[mode + '_result'] = result && result.success === false ? 'failure-object' : 'payload';
    } catch (error) {
      out[mode + '_result'] = 'threw:' + (error && error.name);
    }
    out[mode + '_pending'] = timers.timeouts.size;
  }
  // 请求进行中确实挂着一个超时句柄（否则「清理」恒真）
  fetchMode = 'ok';
  let pendingDuringFetch = -1;
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    pendingDuringFetch = timers.timeouts.size;
    return realFetch(url, init);
  };
  await transport.request('GET', '/api/x', undefined, 5000);
  out.pendingDuringFetch = pendingDuringFetch;

  // 高频压测：500 次混合成功/失败，结束时不得有残留句柄
  let pendingMax = 0;
  let networkErrors = 0;
  for (let i = 0; i < 500; i += 1) {
    fetchMode = i % 5 === 0 ? 'reject' : 'ok';
    try {
      await transport.request('GET', '/api/x', undefined, 100);
    } catch (error) {
      networkErrors += 1;
    }
    pendingMax = Math.max(pendingMax, timers.timeouts.size);
  }
  out.pendingMax = pendingMax;
  out.finalPending = timers.timeouts.size;
  out.networkErrors = networkErrors;
  out.aborts = aborts;
  require('fs').writeFileSync(process.argv[2], JSON.stringify(out));
})().catch((error) => {
  process.stderr.write('harness error: ' + (error && error.stack || error) + '\\n');
  process.exit(1);
});
'''


class LoggerTimerTests(unittest.TestCase):
    """6.9/R32：dispose / buffer 上限 / 失败退避（行为级）。"""

    @classmethod
    def setUpClass(cls) -> None:
        body = _extract_module(_bundle_text(), 'dist/src/utils/Logger.js')
        cls.result = _run_node(LOGGER_HARNESS.replace('/*__MODULE__*/', body))

    def test_timer_is_created_once_per_init(self) -> None:
        self.assertEqual(self.result['intervalsAfterInit'], 1)
        self.assertEqual(self.result['intervalMs'], 2000)

    def test_dispose_clears_every_timer(self) -> None:
        self.assertEqual(self.result['intervalsAfterDispose'], 0)
        self.assertEqual(self.result['timeoutsAfterDispose'], 0)
        self.assertIsNone(self.result['flushTimerAfterDispose'])
        self.assertIsNone(self.result['retryTimerAfterDispose'])
        self.assertTrue(self.result['disposedAfterDispose'])

    def test_buffer_is_capped_and_drops_oldest(self) -> None:
        self.assertEqual(self.result['bufferLength'], 5000)
        self.assertTrue(self.result['bufferLast'].endswith('line-99999\n'))
        self.assertTrue(self.result['bufferFirst'].endswith('line-95000\n'))

    def test_write_failure_backs_off_to_cap(self) -> None:
        self.assertEqual(
            self.result['retryDelays'],
            [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000],
        )
        self.assertLessEqual(self.result['pendingRetryTimers'], 1)

    def test_success_resets_backoff(self) -> None:
        self.assertEqual(self.result['timeoutsAfterSuccess'], 0)
        self.assertEqual(self.result['retryDelayMsAfterSuccess'], 0)

    def test_dispose_after_failures_leaves_nothing(self) -> None:
        self.assertEqual(self.result['finalIntervals'], 0)
        self.assertEqual(self.result['finalTimeouts'], 0)


class HttpTimeoutTimerTests(unittest.TestCase):
    """6.10/R33：超时定时器在成功/失败/abort 三条路径都清理（行为级）。"""

    @classmethod
    def setUpClass(cls) -> None:
        body = _extract_module(_bundle_text(), 'dist/src/adapter/ApiAdapter.js')
        cls.result = _run_node(TRANSPORT_HARNESS.replace('/*__MODULE__*/', body))

    def test_timer_exists_while_request_runs(self) -> None:
        self.assertEqual(self.result['pendingDuringFetch'], 1)

    def test_timer_cleared_on_every_path(self) -> None:
        for mode in ('ok', 'http500', 'reject', 'abort'):
            with self.subTest(mode=mode):
                self.assertEqual(self.result[f'{mode}_pending'], 0, mode)

    def test_abort_path_actually_aborts(self) -> None:
        self.assertEqual(self.result['abort_result'], 'threw:AbortError')
        self.assertEqual(self.result['aborts'], 1)

    def test_high_frequency_requests_leave_no_timers(self) -> None:
        self.assertEqual(self.result['pendingMax'], 0)
        self.assertEqual(self.result['finalPending'], 0)
        # 500 次里每 5 次一次网络异常，异常照旧上抛（由 ApiClient 归一化），但句柄不残留
        self.assertEqual(self.result['networkErrors'], 100)


class PreloadContractTests(unittest.TestCase):
    """6.11/R36：13 个同步 getter 改 invoke，白名单语义不变。"""

    def setUp(self) -> None:
        self.preload = PRELOAD.read_text(encoding='utf-8')

    def test_no_send_sync_left(self) -> None:
        self.assertNotIn('sendSync', self.preload)

    def test_all_channels_use_invoke(self) -> None:
        for channel in SYNC_CHANNELS:
            with self.subTest(channel=channel):
                self.assertEqual(
                    self.preload.count(f"ipcRenderer.invoke('{channel}')"), 1
                )

    def test_bridge_method_names_are_unchanged(self) -> None:
        for name in (
            'getAppVersion',
            'getBackendPort',
            'getGuiLogRoot',
            'getBackendStartupMode',
            'getBackendRepoPath',
            'getOcrGpuMode',
            'getCudaPath',
            'getSaveBackendScreenshots',
            'getWindowPreferences',
            'getUpdateMode',
            'getBackendUpdateMode',
            'getAllowTestUpdates',
            'getPythonPath',
        ):
            with self.subTest(name=name):
                self.assertEqual(self.preload.count(f'    {name}: ('), 1)

    def test_whitelists_still_exposed(self) -> None:
        self.assertIn('electronBridge.settings = pickMethods(SETTINGS_METHODS)', self.preload)
        self.assertIn('electronBridge.plans = pickMethods(PLANS_METHODS)', self.preload)
        # 6.7 新增 install-deps-progress 订阅，6 → 7。
        self.assertEqual(self.preload.count('return subscribe('), 7)
        self.assertIn('onInstallDepsProgress: (callback) => {', self.preload)

    def test_dead_methods_are_still_absent(self) -> None:
        for name in (
            'setWindowPreferences',
            'setDecisivePlanSettings',
            'setBackendPort',
            'setBackendStartupMode',
            'setOcrGpuMode',
            'setSaveBackendScreenshots',
            'setUpdateMode',
            'pickUserTeamPlan',
            'prepareCombatPlanExecution',
            'saveFileDialog',
        ):
            with self.subTest(name=name):
                self.assertNotIn(f'\n    {name}: (', self.preload)


class MainProcessIpcTests(unittest.TestCase):
    """6.11/R36：主进程同名通道改 handle，不再用 sendSync 语义。"""

    def setUp(self) -> None:
        self.source = CONFIG_IPC.read_text(encoding='utf-8')

    def test_sync_channels_registered_as_handle(self) -> None:
        for channel in SYNC_CHANNELS:
            with self.subTest(channel=channel):
                self.assertIn(f"ipc.handle('{channel}'", self.source)

    def test_no_return_value_writes(self) -> None:
        self.assertNotIn('event.returnValue', self.source)
        self.assertNotIn("ipc.on('", '\n'.join(
            line for line in self.source.splitlines() if line.endswith('-sync\');')
        ))

    def test_other_handlers_survive(self) -> None:
        for channel in (
            'commit-gui-settings',
            'get-gui-automation-settings',
            'get-decisive-plan-settings',
            'validate-cuda-path',
            'validate-python',
        ):
            with self.subTest(channel=channel):
                self.assertIn(f"ipc.handle('{channel}'", self.source)


class RendererStartupContractTests(unittest.TestCase):
    """6.11/R36 + 6.11a：启动链并行预取、骨架先绘制、环境检查单飞。"""

    def setUp(self) -> None:
        self.text = _bundle_text()

    def test_runtime_settings_are_prefetched_in_parallel(self) -> None:
        self.assertIn('function loadRuntimeSettings(bridge)', self.text)
        self.assertIn('function getRuntimeSettings()', self.text)
        start = self.text.index('async function loadRuntimeSettings(bridge)')
        end = self.text.index('exports.getRuntimeSettings', start)
        body = self.text[start:end]
        self.assertIn('await Promise.all([', body)
        # 13 个 getter 全部在这一处并发取回
        for name in (
            'getAppVersion',
            'getBackendPort',
            'getGuiLogRoot',
            'getBackendStartupMode',
            'getBackendRepoPath',
            'getOcrGpuMode',
            'getCudaPath',
            'getSaveBackendScreenshots',
            'getWindowPreferences',
            'getUpdateMode',
            'getBackendUpdateMode',
            'getAllowTestUpdates',
            'getPythonPath',
        ):
            with self.subTest(name=name):
                self.assertIn(f'target.{name}?.()', body)

    def test_controller_is_built_after_prefetch(self) -> None:
        # 6.11b：启动顺序变为「等主进程迁移 → 预取运行时配置 → 让一帧 → 建控制器」。
        tail = self.text[self.text.index('exports.AppController = AppController;'):]
        wait = tail.index('(0, IpcAdapter_1.waitStartupReady)()')
        prefetch = tail.index('(0, IpcAdapter_1.loadRuntimeSettings)()')
        controller = tail.index('var app = new AppController();')
        self.assertLess(wait, prefetch)
        self.assertLess(prefetch, controller)
        self.assertIn('requestAnimationFrame', tail)

    def test_no_sync_gateway_reads_remain(self) -> None:
        import re

        pattern = re.compile(
            r'this\.(gateway|runtimeGateway)\??\.(getAppVersion|getBackendPort|getGuiLogRoot'
            r'|getBackendStartupMode|getBackendRepoPath|getOcrGpuMode|getCudaPath'
            r'|getSaveBackendScreenshots|getWindowPreferences|getUpdateMode'
            r'|getBackendUpdateMode|getAllowTestUpdates|getPythonPath)\b'
        )
        self.assertEqual(pattern.findall(self.text), [])

    def test_render_config_reads_cached_settings(self) -> None:
        start = self.text.index('        renderConfig() {')
        end = self.text.index('        async saveConfig() {', start)
        body = self.text[start:end]
        self.assertIn('(0, IpcAdapter_1.getRuntimeSettings)()', body)
        for field in (
            'runtime.backendPort',
            'runtime.backendStartupMode',
            'runtime.backendRepoPath',
            'runtime.ocrGpuMode',
            'runtime.cudaPath',
            'runtime.saveBackendScreenshots',
            'runtime.pythonPath',
            'runtime.guiLogRoot',
            'runtime.updateMode',
            'runtime.backendUpdateMode',
            'runtime.allowTestUpdates',
            'runtime.windowPreferences',
        ):
            with self.subTest(field=field):
                self.assertIn(field, body)

    def test_save_config_refreshes_cache(self) -> None:
        start = self.text.index('        async saveConfig() {')
        end = self.text.index('        refreshNormalFightRemaining() {', start)
        body = self.text[start:end]
        self.assertIn('(0, IpcAdapter_1.patchRuntimeSettings)({', body)
        self.assertIn('backendPort: collected.backendPort', body)
        self.assertIn('guiLogRoot: collected.guiLogRoot', body)

    def test_skeleton_is_removed_when_data_ready(self) -> None:
        self.assertIn('function removeBootSkeleton() {', self.text)
        self.assertIn('logFirstPaint();', self.text)
        # 首次 renderMain 之后先打点、不摘骨架（保留到「数据到齐」）
        self.assertIn(
            '          this.renderMain();\n          logFirstPaint();\n',
            self.text,
        )
        ready = self.text.index('loadModelsAndRender: async (b) => {')
        end = self.text.index('hideBootSkeleton: () => removeBootSkeleton(),', ready)
        self.assertIn('removeBootSkeleton();', self.text[ready:end])
        # 首启向导与启动异常两条路径都必须能摘掉骨架，否则界面被盖住
        self.assertIn('this.host.hideBootSkeleton?.();', self.text)
        self.assertIn('            removeBootSkeleton();\n            this.configCtrl.renderConfig();', self.text)

    def test_env_check_is_single_flight(self) -> None:
        self.assertIn('var envCheckInFlight = null;', self.text)
        self.assertIn('if (envCheckInFlight)', self.text)
        self.assertIn('envCheckInFlight = runEnvCheck(bridge).finally(() => {', self.text)
        # 「正在检查运行环境…」在渲染层只剩兜底一处，主进程 sendProgress 是唯一常规来源
        self.assertEqual(self.text.count(ENV_NOTICE), 1)

    def test_logger_dispose_is_wired_into_exit(self) -> None:
        self.assertIn('await Logger_1.Logger.dispose();', self.text)
        self.assertIn('var MAX_BUFFER_ENTRIES = 5000;', self.text)
        self.assertIn('var FLUSH_RETRY_BASE_MS = 1e3;', self.text)
        self.assertIn('var FLUSH_RETRY_MAX_MS = 3e4;', self.text)

    def test_http_timeout_uses_finally(self) -> None:
        start = self.text.index('async request(method, path, body, timeoutMs) {')
        end = self.text.index('      exports.webSocketTransport = {', start)
        body = self.text[start:end]
        self.assertIn('timeoutTimer = setTimeout(() => controller.abort(), timeoutMs)', body)
        self.assertIn('} finally {', body)
        self.assertIn('clearTimeout(timeoutTimer);', body)
        self.assertNotIn('setTimeout(() => controller.abort(), timeoutMs);\n            }\n            const response', body)


class SkeletonMarkupTests(unittest.TestCase):
    """6.11/R36：骨架必须先于 bundle 绘制。"""

    def setUp(self) -> None:
        self.html = INDEX_HTML.read_text(encoding='utf-8')

    def test_skeleton_markup_and_style_present(self) -> None:
        self.assertIn('id="boot-skeleton"', self.html)
        self.assertIn('@keyframes bs-shimmer', self.html)

    def test_skeleton_precedes_bundle(self) -> None:
        self.assertLess(
            self.html.index('id="boot-skeleton"'),
            self.html.index('<script src="../../dist/renderer.bundle.js">'),
        )

    def test_skeleton_style_is_in_head(self) -> None:
        self.assertLess(self.html.index('<style>'), self.html.index('</head>'))

    def test_no_inline_script_added(self) -> None:
        head = self.html[: self.html.index('</head>')]
        self.assertNotIn('<script', head)


if __name__ == '__main__':
    unittest.main(verbosity=2)
