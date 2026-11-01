"""批次 6b-2a / 6.11b 离线回归：两段式启动顺序、启动就绪门、骨架/模态时序。

覆盖验收路径：

1. 主窗口在迁移/旧计划迁移之前创建（shell），迁移与后端更新恢复后移；
2. ``handleStartupUpdate`` 仍在建窗前，单实例/token/CSP/preload/contextIsolation 未后移；
3. ``wait-startup-ready`` 在渲染层读 ``gui_settings`` 之前 await，避免读到迁移前旧值；
4. 迁移冲突弹窗打开前先摘骨架（修复 6.11 遗留的 z-index 遮挡）；
5. ``boot.html`` 是极简 shell（骨架 + 启动文案，无脚本），``WindowService`` 支持
   shell→index.html 同一窗口导航、关窗前 app 页就绪判定；
6. ``repack_asar.py`` 能把新增的 boot.html 补进 asar header。

运行::

    .\\python\\python.exe tests\\test_batch6b_2a.py -v
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASAR_WORK = ROOT / '.workbuddy' / 'asar_work'
MAIN = ASAR_WORK / 'dist' / 'electron' / 'main.js'
WINDOW = ASAR_WORK / 'dist' / 'electron' / 'services' / 'WindowService.js'
PRELOAD = ASAR_WORK / 'dist' / 'electron' / 'preload.js'
RENDERER = ASAR_WORK / 'dist' / 'renderer.bundle.js'
INDEX = ASAR_WORK / 'src' / 'view' / 'index.html'
BOOT = ASAR_WORK / 'src' / 'view' / 'boot.html'
REPACK = ROOT / '.workbuddy' / 'repack_asar.py'
VERIFY = ROOT / '.workbuddy' / 'verify_6b_2a_asar.py'

NODE = 'node'


def _text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def _extract_module(text: str, module_path: str) -> str:
    marker = f'    "{module_path}"(exports) {{'
    start = text.index(marker) + len(marker)
    end = text.index('\n    }\n  });', start)
    body = text[start:end]
    assert 'exports.' in body, module_path
    return body


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
            timeout=60,
        )
        if completed.returncode != 0:
            raise AssertionError(
                f'node harness failed ({completed.returncode}):\n'
                f'{completed.stderr[-4000:]}'
            )
        return json.loads(result_path.read_text(encoding='utf-8'))


class StartupOrderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.main = _text(MAIN)
        cls.window = _text(WINDOW)
        cls.preload = _text(PRELOAD)
        cls.renderer = _text(RENDERER)
        cls.index = _text(INDEX)
        cls.boot = _text(BOOT)
        cls.repack = _text(REPACK)
        cls.verify = _text(VERIFY)

    def test_window_created_before_migration(self) -> None:
        main = self.main
        create = main.index("windowService.createWindow({ initialPage: 'shell' })")
        prep_call = main.index('const preparation = runStartupPreparation();')
        migration = main.index('legacyPlanMigration.migrate(migrationSelection)')
        self.assertLess(create, prep_call, 'shell 窗口应在启动准备调用之前创建')
        self.assertLess(main.index('const runStartupPreparation = async () => {'), migration,
                        '迁移应在 runStartupPreparation 内')
        self.assertLess(main.index('await handleStartupUpdate()'), create,
                        '待安装 GUI 更新检查必须仍在建窗前')

    def test_startup_ready_gate(self) -> None:
        main = self.main
        self.assertIn("ipcMain.handle('wait-startup-ready'", main)
        self.assertIn('settleStartup(', main)
        self.assertIn('startupUserDecisionPending', main)
        # 渲染层必须在读运行时配置之前 await 启动就绪。
        wait = self.renderer.index('IpcAdapter_1.waitStartupReady')
        load = self.renderer.index('IpcAdapter_1.loadRuntimeSettings')
        self.assertLess(wait, load, 'waitStartupReady 必须在 loadRuntimeSettings 之前')
        self.assertIn('function waitStartupReady()', self.renderer)

    def test_deferred_steps_are_inside_prep(self) -> None:
        main = self.main
        start = main.index('const runStartupPreparation = async () => {')
        end = main.index('    electron_1.app.whenReady().then', start)
        prep = main[start:end]
        for marker in (
            'initPythonEnv',
            'initBackend',
            'migratePresetInventory',
            'legacyPlanMigration.migrate(migrationSelection)',
            'prepareAfterMigration',
            'recoverAndApplyOnStartup',
            'hideBootSkeleton',
            'legacyMigrationPrompt.show()',
        ):
            self.assertIn(marker, prep, f'{marker} 应在窗口可见后的启动准备里')
        self.assertNotIn("windowService.createWindow({ initialPage: 'shell' })", prep)

    def test_security_preconditions_stay(self) -> None:
        main = self.main
        self.assertLess(main.index('singleInstanceService.acquire()'),
                        main.index("windowService.createWindow({ initialPage: 'shell' })"))
        self.assertIn("ipcMain.handle('get-api-token'", main)
        self.assertIn("ipcRenderer.invoke('wait-startup-ready')", self.preload)
        self.assertIn('contextIsolation: true', self.window)
        self.assertIn('nodeIntegration: false', self.window)
        self.assertIn("preload: path.join(this.dependencies.moduleDirectory, 'preload.js')", self.window)
        self.assertIn("object-src 'none'", self.window)
        self.assertIn("base-uri 'none'", self.window)
        self.assertIn("frame-ancestors 'none'", self.window)


class SkeletonModalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.main = _text(MAIN)
        cls.window = _text(WINDOW)
        cls.preload = _text(PRELOAD)
        cls.renderer = _text(RENDERER)
        cls.index = _text(INDEX)
        cls.boot = _text(BOOT)
        cls.repack = _text(REPACK)
        cls.verify = _text(VERIFY)

    def test_boot_shell_shape(self) -> None:
        self.assertIn('id="boot-skeleton"', self.boot)
        self.assertIn('class="bs-status"', self.boot)
        self.assertIn('正在启动', self.boot)
        self.assertNotIn('<script', self.boot.lower())
        self.assertIn('boot.html', self.window)

    def test_shell_navigation_and_close_guard(self) -> None:
        self.assertIn('initialPage === \'shell\'', self.window)
        self.assertIn('async loadApp()', self.window)
        self.assertIn('isAppPageReady()', self.window)
        self.assertIn('__autowsgrAppPageReady', self.window)
        self.assertIn('__autowsgrAppPageReady !== true', self.main)
        self.assertIn("app:hide-boot-skeleton", self.window)
        self.assertIn("ipcRenderer.on('app:hide-boot-skeleton'", self.preload)

    def test_boot_loading_hides_real_ui_until_remove(self) -> None:
        self.assertIn('class="boot-loading"', self.index)
        self.assertIn('body.boot-loading > :not(#boot-skeleton)', self.index)
        self.assertIn('document.body.classList.remove("boot-loading")', self.renderer)
        self.assertIn('class="bs-status"', self.index)

    def test_conflict_modal_hides_skeleton_first(self) -> None:
        self.assertIn('async reviewPending(onBeforeOpen)', self.renderer)
        self.assertIn('onBeforeOpen();', self.renderer)
        self.assertIn(
            'reviewPending(() => removeBootSkeleton())',
            self.renderer,
        )

    def test_preload_getter_contract(self) -> None:
        self.assertIn("waitStartupReady: () => {", self.preload)
        self.assertIn("'waitStartupReady',", self.preload)
        self.assertEqual(self.preload.count('sendSync'), 0)

    def test_repack_adds_new_boot_file(self) -> None:
        self.assertIn('src/view/boot.html', self.repack)
        self.assertIn('NEW_FILES', self.repack)
        self.assertIn('added new file', self.repack)
        self.assertIn('len(entries) == 430', self.verify)


class WaitStartupReadyHarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        text = _text(RENDERER)
        cls.module_body = _extract_module(text, 'dist/src/adapter/IpcAdapter.js')

    def test_wait_startup_ready_behavior(self) -> None:
        script = (
            "'use strict';\n"
            "const __mod = { exports: {} };\n"
            "global.window = { electronBridge: {} };\n"
            "(function (exports) {\n"
            "/*__MODULE__*/\n"
            "})(__mod.exports);\n"
            "const api = __mod.exports;\n"
            "const out = {};\n"
            "(async () => {\n"
            "  let calls = 0;\n"
            "  global.window = { electronBridge: { waitStartupReady: () => { calls += 1; return Promise.resolve('ok'); } } };\n"
            "  await api.waitStartupReady();\n"
            "  out.calls = calls;\n"
            "  global.window = { electronBridge: {} };\n"
            "  await api.waitStartupReady();\n"
            "  out.missingResolved = true;\n"
            "  global.window = { electronBridge: { waitStartupReady: () => Promise.reject(new Error('boom')) } };\n"
            "  await api.waitStartupReady();\n"
            "  out.rejectedResolved = true;\n"
            "  require('fs').writeFileSync(process.argv[2], JSON.stringify(out));\n"
            "})().catch((error) => { process.stderr.write(String(error && error.stack || error)); process.exit(1); });\n"
        ).replace('/*__MODULE__*/', self.module_body)
        out = _run_node(script)
        self.assertEqual(out['calls'], 1)
        self.assertTrue(out['missingResolved'])
        self.assertTrue(out['rejectedResolved'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
