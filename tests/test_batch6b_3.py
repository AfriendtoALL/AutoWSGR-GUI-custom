"""批次 6b-3 离线回归：6.6 设备列表/错误透传、6.7 安装确认/取消/进度/完整日志、
6.12 队列快照与启动恢复。

运行::

    .\\python\\python.exe tests\\test_batch6b_3.py -v
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.workbuddy' / 'asar_work'
RENDERER = WORK / 'dist' / 'renderer.bundle.js'
MAIN = WORK / 'dist' / 'electron' / 'main.js'
PRELOAD = WORK / 'dist' / 'electron' / 'preload.js'
ENV_IPC = WORK / 'dist' / 'electron' / 'ipc' / 'EnvironmentIpc.js'
INSTALLER = WORK / 'dist' / 'electron' / 'pythonEnv' / 'installer.js'
ENV_SERVICE = WORK / 'dist' / 'electron' / 'services' / 'PythonEnvironmentService.js'
INDEX = WORK / 'src' / 'view' / 'index.html'
NODE = 'node'


def _text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def _run_node(script: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'harness.cjs'
        result_path = Path(tmp) / 'result.json'
        path.write_text(script, encoding='utf-8', newline='\n')
        completed = subprocess.run(
            [NODE, str(path), str(result_path)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120,
        )
        if completed.returncode != 0:
            debug_path = Path(tempfile.gettempdir()) / 'failed_harness_6b3.cjs'
            debug_path.write_text(script, encoding='utf-8')
            raise AssertionError(
                f'node harness failed ({completed.returncode}) [saved {debug_path}]:\n'
                f'{completed.stderr[-6000:]}'
            )
        return json.loads(result_path.read_text(encoding='utf-8'))


class StaticContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.renderer = _text(RENDERER)
        cls.main = _text(MAIN)
        cls.preload = _text(PRELOAD)
        cls.env_ipc = _text(ENV_IPC)
        cls.installer = _text(INSTALLER)
        cls.env_service = _text(ENV_SERVICE)
        cls.index = _text(INDEX)

    def test_66_device_list_ui_and_error_propagation(self) -> None:
        self.assertIn('cfg-adb-device-list', self.index)
        for marker in (
            'collectAdbDevices',
            'applyDeviceSelection',
            'listEmulatorDevices',
            'setAdbDevices',
            'lastStartError',
            'startPromise',
            'async startInternal(configPath)',
            'onSystemStartFailure',
            'handleSystemStartFailure',
        ):
            self.assertIn(marker, self.renderer)
        self.assertIn('\\u5DF2\\u5217\\u51FA', self.renderer)
        self.assertNotIn('是否将第一个设备填入 serial', self.renderer)
        # 一键选择后必须走 saveConfig，进而同步 patchRuntimeSettings。
        self.assertIn('await this.host.saveConfig();', self.renderer)
        self.assertIn('listEmulatorDevices: () => this.listEmulatorDevices()', self.renderer)

    def test_66_start_reuses_inflight_promise(self) -> None:
        start = self.renderer.index('start(configPath) {\n          if (this.startPromise)')
        body = self.renderer[start:start + 400]
        self.assertIn('return this.startPromise;', body)
        self.assertIn('this.startPromise = this.startInternal(configPath).finally(', body)

    def test_67_preload_and_ipc_contract(self) -> None:
        self.assertIn("'cancel-install-deps'", self.env_ipc)
        self.assertIn("'install-deps-offline'", self.env_ipc)
        self.assertIn("ipc.handle('cancel-install-deps'", self.env_ipc)
        self.assertIn("ipc.handle('install-deps-offline'", self.env_ipc)
        self.assertIn("ipcRenderer.invoke('cancel-install-deps')", self.preload)
        self.assertIn("ipcRenderer.invoke('install-deps-offline', directory)", self.preload)
        self.assertIn("subscribe('install-deps-progress'", self.preload)
        for method in ('cancelInstallDeps', 'installDepsOffline', 'onInstallDepsProgress'):
            self.assertIn(f"'{method}'", self.preload)
        self.assertIn('sendInstallProgress', self.main)
        self.assertIn('installDependenciesFromDirectory: pythonEnv_1.installDependenciesFromDirectory', self.main)
        self.assertIn('cancelInstallDependencies: pythonEnv_1.cancelDependencies', self.main)

    def test_67_installer_cancel_progress_full_output(self) -> None:
        for marker in (
            'cancelDependencies',
            'installDependenciesFromDirectory',
            'sendInstallProgress',
            '--no-index',
            '--find-links',
            'activePipCanceled',
        ):
            self.assertIn(marker, self.installer)
        self.assertNotIn('slice(-500)', self.installer)
        self.assertNotIn('slice(-200)', self.renderer)
        self.assertIn('Logger_1.Logger.logToFile(fullOutput)', self.renderer)
        self.assertIn('fullOutput', self.renderer)

    def test_67_renderer_confirm_progress_and_single_flight(self) -> None:
        for marker in (
            'showInstallChoice',
            'createInstallProgressView',
            '立即安装',
            '离线导入',
            '取消（本次不安装）',
            'cancelInstallDeps',
            'installResult?.canceled',
        ):
            self.assertIn(marker, self.renderer)
        self.assertIn('if (envCheckInFlight)', self.renderer)
        self.assertIn('envCheckInFlight = null;', self.renderer)
        self.assertIn('var SelectorDialog_1 = require_SelectorDialog();', self.renderer)
        self.assertIn('SelectorDialog_1.showSelector', self.renderer)
        self.assertNotIn('DialogHelper_1.showSelector', self.renderer)
        # 选择器必须在 body 级，否则从主页面触发确认框时会被隐藏的 #page-plan 吞掉。
        self.assertGreater(self.index.index('id="plan-selector-dialog"'), self.index.index('</main>'))

    def test_612_snapshot_wiring(self) -> None:
        for marker in (
            'QUEUE_SNAPSHOT_FILE = "queue_state.json"',
            'QUEUE_SNAPSHOT_THROTTLE_MS = 1000',
            'QueueSnapshotStore',
            'persistQueueSnapshot',
            'restoreQueueSnapshot',
            'queueSnapshotReady',
            'queueSnapshotStore.flush()',
            'queueSnapshotStore.dispose()',
            'replaceAll(tasks)',
            'async restoreQueueSnapshot()',
        ):
            self.assertIn(marker, self.renderer)
        self.assertIn('interrupted: true', self.renderer)
        self.assertIn('上次运行中断', self.renderer)
        self.assertIn('restoreQueueSnapshot: () => this.restoreQueueSnapshot()', self.renderer)
        self.assertIn('await this.host.restoreQueueSnapshot?.();', self.renderer)


class DeviceHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        text = _text(RENDERER)
        start = text.index('        setAdbDevices(devices, onSelect, selectedSerial = "") {')
        end = text.index('        setCudaValidateLoading(', start)
        cls.method = text[start:end]

    def test_set_adb_devices_renders_buttons(self) -> None:
        script = (
            "'use strict';\n"
            "const METHOD = __METHOD__;\n"
            "const fakeDoc = { createElement: () => { const el = { className: '', textContent: '', type: '', title: '', disabled: false, addEventListener: (name, fn) => { el['on' + name] = fn; } }; return el; } };\n"
            "const factory = new Function('document', 'return ({' + METHOD + '});');\n"
            "const view = factory(fakeDoc);\n"
            "const container = { children: [], replaceChildren() { this.children = []; }, appendChild(el) { this.children.push(el); } };\n"
            "let picked = null;\n"
            "view.setAdbDevices.call({ adbDeviceList: container }, [\n"
            "  { serial: '127.0.0.1:16384', status: 'device' },\n"
            "  { serial: '127.0.0.1:16416', status: 'offline' }\n"
            "], (serial) => { picked = serial; }, '127.0.0.1:16384');\n"
            "const first = container.children[0];\n"
            "const second = container.children[1];\n"
            "first.onclick();\n"
            "require('fs').writeFileSync(process.argv[2], JSON.stringify({\n"
            "  count: container.children.length,\n"
            "  firstText: first.textContent, firstDisabled: first.disabled, firstClass: first.className,\n"
            "  secondText: second.textContent, secondDisabled: second.disabled,\n"
            "  picked\n"
            "}));\n"
        ).replace('__METHOD__', json.dumps(self.method))
        out = _run_node(script)
        self.assertEqual(out['count'], 2)
        self.assertIn('使用 127.0.0.1:16384', out['firstText'])
        self.assertFalse(out['firstDisabled'])
        self.assertIn('btn-primary', out['firstClass'])
        self.assertTrue(out['secondDisabled'])
        self.assertEqual(out['picked'], '127.0.0.1:16384')


class EnvCheckHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        text = _text(RENDERER)
        marker = '    "dist/src/controller/startup/envAndUpdates.js"(exports) {'
        start = text.index(marker) + len(marker)
        end = text.index('\n    }\n  });', start)
        cls.module = text[start:end]

    def test_confirm_cancel_full_log_and_single_flight(self) -> None:
        script = (
            "'use strict';\n"
            "const out = {};\n"
            "const fileLogs = [];\n"
            "const LoggerInner = { info() {}, error() {}, debug() {}, warn() {}, logLevel() {}, logToFile: (text) => { fileLogs.push(String(text)); } };\n"
            "let pickerIndex = 2;\n"
            "global.require_IpcAdapter = () => ({ getRuntimeSettings: () => ({}), bindIpcSubscription: () => {}, getBridge: () => ({}) });\n"
            "global.require_StorageAdapter = () => ({ browserStorageStore: { get: () => null } });\n"
            "global.require_Logger = () => ({ Logger: LoggerInner });\n"
            "global.require_DialogHelper = () => ({\n"
            "  showSelector: async () => ({ index: pickerIndex, times: 1 }),\n"
            "  showAlert: async () => {},\n"
            "});\n"
            "global.require_SelectorDialog = () => ({ showSelector: async () => ({ index: pickerIndex, times: 1 }) });\n"
            "const __mod = { exports: {} };\n"
            "(function (exports) {\n"
            "/*__MODULE__*/\n"
            "})(__mod.exports);\n"
            "const api = __mod.exports;\n"
            "const tick = () => new Promise((resolve) => setTimeout(resolve, 5));\n"
            "(async () => {\n"
            "  let calls = 0;\n"
            "  global.document = {};\n"
            "  const cancelBridge = {\n"
            "    onBackendLog: undefined,\n"
            "    checkEnvironment: async () => ({ pythonCmd: 'py', allReady: false, missingPackages: ['scipy'] }),\n"
            "    installDeps: async () => { calls += 1; return { success: true }; },\n"
            "  };\n"
            "  out.cancel = await api.checkAndPrepareEnv(cancelBridge);\n"
            "  out.cancelCalls = calls;\n"
            "  delete global.document;\n"
            "  pickerIndex = 0;\n"
            "  const envs = [\n"
            "    { pythonCmd: 'py', allReady: false, missingPackages: ['scipy'] },\n"
            "    { pythonCmd: 'py', allReady: true, missingPackages: [] },\n"
            "  ];\n"
            "  calls = 0;\n"
            "  const installBridge = {\n"
            "    onBackendLog: undefined,\n"
            "    checkEnvironment: async () => envs.shift(),\n"
            "    installDeps: async () => { calls += 1; return { success: true, output: 'ok' }; },\n"
            "  };\n"
            "  out.install = await api.checkAndPrepareEnv(installBridge);\n"
            "  out.installCalls = calls;\n"
            "  const longOutput = 'x'.repeat(3000);\n"
            "  calls = 0;\n"
            "  const failBridge = {\n"
            "    onBackendLog: undefined,\n"
            "    checkEnvironment: async () => ({ pythonCmd: 'py', allReady: false, missingPackages: ['scipy'] }),\n"
            "    installDeps: async () => { calls += 1; return { success: false, output: longOutput }; },\n"
            "  };\n"
            "  out.fail = await api.checkAndPrepareEnv(failBridge);\n"
            "  out.failCalls = calls;\n"
            "  out.fullLogLength = fileLogs.length ? fileLogs[fileLogs.length - 1].length : 0;\n"
            "  calls = 0;\n"
            "  const delayedEnvs = [\n"
            "    { pythonCmd: 'py', allReady: false, missingPackages: ['scipy'] },\n"
            "    { pythonCmd: 'py', allReady: true, missingPackages: [] },\n"
            "  ];\n"
            "  const delayedBridge = {\n"
            "    onBackendLog: undefined,\n"
            "    checkEnvironment: async () => delayedEnvs.shift(),\n"
            "    installDeps: () => { calls += 1; return new Promise((resolve) => setTimeout(() => resolve({ success: true, output: 'ok' }), 20)); },\n"
            "  };\n"
            "  const p1 = api.checkAndPrepareEnv(delayedBridge);\n"
            "  const p2 = api.checkAndPrepareEnv(delayedBridge);\n"
            "  out.samePromise = p1 === p2;\n"
            "  out.singleFlight = await p1;\n"
            "  await p2;\n"
            "  out.singleFlightCalls = calls;\n"
            "  require('fs').writeFileSync(process.argv[2], JSON.stringify(out));\n"
            "})().catch((error) => { process.stderr.write(String(error && error.stack || error)); process.exit(1); });\n"
        ).replace('/*__MODULE__*/', self.module)
        out = _run_node(script)
        self.assertFalse(out['cancel'])
        self.assertEqual(out['cancelCalls'], 0)
        self.assertTrue(out['install'])
        self.assertEqual(out['installCalls'], 1)
        self.assertFalse(out['fail'])
        self.assertEqual(out['failCalls'], 1)
        self.assertEqual(out['fullLogLength'], 3000)
        self.assertTrue(out['samePromise'])
        self.assertTrue(out['singleFlight'])
        self.assertEqual(out['singleFlightCalls'], 1)


class EnvironmentServiceHarnessTests(unittest.TestCase):
    def test_single_flight_and_cancel_delegate(self) -> None:
        source = _text(ENV_SERVICE)
        script = (
            "'use strict';\n"
            "const mod = { exports: {} };\n"
            "const factory = new Function('require', 'exports', 'module', __SOURCE__);\n"
            "factory(require, mod.exports, mod);\n"
            "const Service = mod.exports.PythonEnvironmentService;\n"
            "let findCalls = 0;\n"
            "let installCalls = 0;\n"
            "let resolveInstall = null;\n"
            "let cancelCalls = 0;\n"
            "const service = new Service({\n"
            "  findPython: async () => { findCalls += 1; return 'py'; },\n"
            "  beforeInstall: async () => {},\n"
            "  afterInstall: async () => {},\n"
            "  onDependenciesInstalled: () => {},\n"
            "  installDependencies: (py) => { installCalls += 1; return new Promise((resolve) => { resolveInstall = resolve; }); },\n"
            "  installDependenciesFromDirectory: async () => { installCalls += 1; return { success: true, output: 'dir' }; },\n"
            "  cancelInstallDependencies: () => { cancelCalls += 1; return true; },\n"
            "});\n"
            "(async () => {\n"
            "  const p1 = service.installDependencies();\n"
            "  const p2 = service.installDependencies();\n"
            "  const same = p1 === p2;\n"
            "  await new Promise((resolve) => setTimeout(resolve, 0));\n"
            "  const callsBeforeResolve = installCalls;\n"
            "  resolveInstall({ success: true, output: 'ok' });\n"
            "  await p1;\n"
            "  const afterClear = service.installPromise === null;\n"
            "  const p3 = service.installDependencies();\n"
            "  await new Promise((resolve) => setTimeout(resolve, 0));\n"
            "  const callsAfterSecond = installCalls;\n"
            "  resolveInstall({ success: true, output: 'ok2' });\n"
            "  await p3;\n"
            "  const canceled = service.cancelInstallDependencies();\n"
            "  require('fs').writeFileSync(process.argv[2], JSON.stringify({ same, callsBeforeResolve, afterClear, callsAfterSecond, canceled, cancelCalls, findCalls }));\n"
            "})().catch((error) => { process.stderr.write(String(error && error.stack || error)); process.exit(1); });\n"
        ).replace('__SOURCE__', json.dumps(source))
        out = _run_node(script)
        self.assertTrue(out['same'])
        self.assertEqual(out['callsBeforeResolve'], 1)
        self.assertTrue(out['afterClear'])
        self.assertEqual(out['callsAfterSecond'], 2)
        self.assertTrue(out['canceled'])
        self.assertEqual(out['cancelCalls'], 1)
        self.assertEqual(out['findCalls'], 2)


class InstallerHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        text = _text(INSTALLER)
        start = text.index('let activePip = null;')
        end = text.index('/** 自动安装依赖；安装目标由统一 Python 环境描述决定。 */')
        cls.helpers = text[start:end]

    def test_run_pip_progress_cancel_and_offline_args(self) -> None:
        script = (
            "'use strict';\n"
            "const EventEmitter = require('events');\n"
            "const progress = [];\n"
            "const spawned = [];\n"
            "const fakeSpawn = (cmd, args) => {\n"
            "  const proc = new EventEmitter();\n"
            "  proc.pid = 100 + spawned.length;\n"
            "  proc.stdout = new EventEmitter();\n"
            "  proc.stderr = new EventEmitter();\n"
            "  proc.killed = false;\n"
            "  proc.kill = () => { proc.killed = true; };\n"
            "  spawned.push({ cmd, args, proc });\n"
            "  return proc;\n"
            "};\n"
            "const fakeCp = { spawn: fakeSpawn };\n"
            "const ctx = { sendProgress: () => {}, sendInstallProgress: (payload) => progress.push(payload) };\n"
            "const fakeCtx = { getCtx: () => ctx };\n"
            "const fakeEnv = { buildPythonProcessEnv: () => ({}) };\n"
            "const factory = new Function('child_process_1', 'context_1', 'environment_1', __HELPERS__ + '\\nreturn { runPip, cancelDependencies, parsePipPercent, withOfflineArgs };');\n"
            "const api = factory(fakeCp, fakeCtx, fakeEnv);\n"
            "const tick = () => new Promise((resolve) => setTimeout(resolve, 0));\n"
            "(async () => {\n"
            "  const resultPromise = api.runPip('py', ['-m', 'pip', 'install'], '.', {}, '后端依赖', 1, 3);\n"
            "  const first = spawned[0].proc;\n"
            "  first.stdout.emit('data', 'Downloading 45%\\n');\n"
            "  await tick();\n"
            "  first.emit('close', 0);\n"
            "  const result = await resultPromise;\n"
            "  const cancelPromise = api.runPip('py', ['-m', 'pip', 'install'], '.', {}, '后端依赖', 2, 3);\n"
            "  const second = spawned.filter((entry) => entry.cmd !== 'taskkill').slice(-1)[0].proc;\n"
            "  const canceled = api.cancelDependencies();\n"
            "  second.emit('close', 1);\n"
            "  const cancelResult = await cancelPromise;\n"
            "  require('fs').writeFileSync(process.argv[2], JSON.stringify({\n"
            "    output: result.output,\n"
            "    canceledFlag: result.canceled,\n"
            "    percent: progress.filter((entry) => entry.percent === 45).length,\n"
            "    cancelReturned: canceled,\n"
            "    cancelResult: cancelResult.canceled,\n"
            "    taskkill: spawned.some((entry) => entry.cmd === 'taskkill'),\n"
            "    offline: api.withOfflineArgs(['-m', 'pip', 'install', '--upgrade'], 'C:/wheels'),\n"
            "    parse45: api.parsePipPercent('45%'),\n"
            "  }));\n"
            "})().catch((error) => { process.stderr.write(String(error && error.stack || error)); process.exit(1); });\n"
        ).replace('__HELPERS__', json.dumps(self.helpers))
        out = _run_node(script)
        self.assertIn('Downloading 45%', out['output'])
        self.assertFalse(out['canceledFlag'])
        self.assertEqual(out['percent'], 1)
        self.assertTrue(out['cancelReturned'])
        self.assertTrue(out['cancelResult'])
        self.assertTrue(out['taskkill'])
        self.assertEqual(out['offline'][:5], ['-m', 'pip', 'install', '--no-index', '--find-links'])
        self.assertEqual(out['parse45'], 45)


class QueueSnapshotHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        text = _text(RENDERER)
        start = text.index('var QueueSnapshotStore = class {')
        end = text.index('      var AppController = class {', start)
        cls.class_text = text[start:end].strip()

    def test_snapshot_throttle_and_dispose(self) -> None:
        script = (
            "'use strict';\n"
            "const FILE = 'queue_state.json';\n"
            "const THROTTLE = 40;\n"
            "const saves = [];\n"
            "const repo = {\n"
            "  read: null,\n"
            "  async readFile() { return repo.read; },\n"
            "  async saveFile(path, content) { saves.push(JSON.parse(content)); },\n"
            "};\n"
            "const IpcAdapter_1 = { rendererFileRepository: repo };\n"
            "const factory = new Function('QUEUE_SNAPSHOT_FILE', 'QUEUE_SNAPSHOT_THROTTLE_MS', 'IpcAdapter_1', __CLASS__ + '\\nreturn QueueSnapshotStore;');\n"
            "const Store = factory(FILE, THROTTLE, IpcAdapter_1);\n"
            "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\n"
            "(async () => {\n"
            "  const store = new Store();\n"
            "  store.schedule({ n: 1 });\n"
            "  await sleep(5);\n"
            "  const immediate = saves.length;\n"
            "  store.schedule({ n: 2 });\n"
            "  store.schedule({ n: 3 });\n"
            "  await sleep(80);\n"
            "  const trailing = saves.length ? saves[saves.length - 1].n : null;\n"
            "  const beforeDispose = saves.length;\n"
            "  store.dispose();\n"
            "  store.schedule({ n: 4 });\n"
            "  await sleep(60);\n"
            "  const afterDispose = saves.length;\n"
            "  repo.read = JSON.stringify({ version: 1, queue: [] });\n"
            "  const loaded = await store.load();\n"
            "  repo.read = 'not-json';\n"
            "  const malformed = await store.load();\n"
            "  require('fs').writeFileSync(process.argv[2], JSON.stringify({ immediate, trailing, beforeDispose, afterDispose, loaded, malformed }));\n"
            "})().catch((error) => { process.stderr.write(String(error && error.stack || error)); process.exit(1); });\n"
        ).replace('__CLASS__', json.dumps(self.class_text))
        out = _run_node(script)
        self.assertEqual(out['immediate'], 1)
        self.assertEqual(out['trailing'], 3)
        self.assertEqual(out['beforeDispose'], out['afterDispose'])
        self.assertEqual(out['loaded']['version'], 1)
        self.assertIsNone(out['malformed'])


class SchedulerRestoreHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        text = _text(RENDERER)
        start = text.index('        serializeTask(task) {')
        end = text.index('        notifyQueueChange() {', start)
        cls.methods = text[start:end]

    def test_restore_marks_running_interrupted(self) -> None:
        script = (
            "'use strict';\n"
            "let seq = 0;\n"
            "const TaskQueue_1 = { generateTaskId: () => 'generated_' + (++seq) };\n"
            "const factory = new Function('TaskQueue_1', 'return class {' + __METHODS__ + '};');\n"
            "const Ctx = factory(TaskQueue_1);\n"
            "const queue = { items: [], replaceAll(tasks) { this.items = tasks; } };\n"
            "const ctx = new Ctx();\n"
            "ctx.currentTask = null;\n"
            "ctx.waitingTasks = new Map();\n"
            "ctx.waitingTaskList = [];\n"
            "ctx._taskQueue = queue;\n"
            "ctx.statusChanges = [];\n"
            "ctx.setStatus = (status) => { ctx.statusChanges.push(status); };\n"
            "ctx.notifyQueueChange = () => {};\n"
            "const snapshot = {\n"
            "  version: 1,\n"
            "  savedAt: '2026-10-29T00:00:00.000Z',\n"
            "  running: { id: 'run', name: 'running', type: 'normal_fight', request: { type: 'normal_fight' }, remainingTimes: 2, totalTimes: 3, backendTaskId: 'backend' },\n"
            "  queue: [{ id: 'queued', name: 'queued', type: 'exercise', request: { type: 'exercise' }, remainingTimes: 1, totalTimes: 1, interrupted: true, interruptedAt: '2026-10-29T00:00:00.000Z' }],\n"
            "  waiting: [{ task: { id: 'wait', name: 'wait', type: 'normal_fight', request: { type: 'normal_fight' }, remainingTimes: 1, totalTimes: 2 }, reason: 'gap' }],\n"
            "};\n"
            "const restored = ctx.restoreSnapshot(snapshot);\n"
            "const exportSnapshot = ctx.exportSnapshot();\n"
            "require('fs').writeFileSync(process.argv[2], JSON.stringify({\n"
            "  restored,\n"
            "  currentTask: ctx.currentTask,\n"
            "  ids: queue.items.map((task) => task.id),\n"
            "  firstInterrupted: queue.items[0] && queue.items[0].interrupted === true,\n"
            "  secondInterrupted: queue.items[1] && queue.items[1].interrupted === true,\n"
            "  firstBackend: queue.items[0] && Object.prototype.hasOwnProperty.call(queue.items[0], 'backendTaskId'),\n"
            "  statusChanges: ctx.statusChanges,\n"
            "  exportVersion: exportSnapshot.version,\n"
            "  exportCount: exportSnapshot.queue.length,\n"
            "  invalid: ctx.restoreSnapshot({ version: 99 }),\n"
            "}));\n"
        ).replace('__METHODS__', json.dumps(self.methods))
        out = _run_node(script)
        self.assertTrue(out['restored']['interrupted'])
        self.assertEqual(out['restored']['restored'], 3)
        self.assertIsNone(out['currentTask'])
        self.assertEqual(out['ids'], ['run', 'queued', 'wait'])
        self.assertTrue(out['firstInterrupted'])
        self.assertTrue(out['secondInterrupted'])
        self.assertFalse(out['firstBackend'])
        self.assertEqual(out['statusChanges'], ['not_connected'])
        self.assertEqual(out['exportVersion'], 1)
        self.assertEqual(out['exportCount'], 3)
        self.assertEqual(out['invalid']['restored'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
