"""批次 7b 离线回归：7.1 / 7.6 / 7.7。

运行::

    .\\python\\python.exe tests\\test_batch7b.py -v
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'python' / 'site-packages' / 'autowsgr'
ASAR = ROOT / 'resources' / 'app.asar'
WORK = ROOT / '.workbuddy' / 'asar_work'
RENDERER = WORK / 'dist' / 'renderer.bundle.js'
SOURCE_MAP = RENDERER.with_name(RENDERER.name + '.map')
BACKEND_SERVICE = WORK / 'dist' / 'electron' / 'services' / 'BackendService.js'
APP_PATHS = WORK / 'dist' / 'electron' / 'services' / 'AppPaths.js'
MAIN_JS = WORK / 'dist' / 'electron' / 'main.js'

_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'


def _bundle_text() -> str:
    return RENDERER.read_text(encoding='utf-8')


def _asar_header() -> tuple[dict, int, bytes]:
    raw = ASAR.read_bytes()
    _n1, n2, _n3, n4 = struct.unpack('<IIII', raw[:16])
    header = json.loads(raw[16 : 16 + n4].decode('utf-8'))
    return header, 8 + n2, raw


def _asar_files() -> dict[str, tuple[dict, bytes]]:
    header, content_start, raw = _asar_header()
    files: dict[str, tuple[dict, bytes]] = {}

    def walk(node: dict, prefix: str = '') -> None:
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


def _decode_vlq(segment: str) -> list[int]:
    values: list[int] = []
    value = shift = 0
    for char in segment:
        digit = _B64.index(char)
        value += (digit & 31) << shift
        if digit & 32:
            shift += 5
        else:
            values.append(-(value >> 1) if value & 1 else value >> 1)
            value = shift = 0
    return values


def _resolve_mappings(source_map: dict) -> dict[int, tuple[int, int, int]]:
    """按行解码 sourcemap：generated_line(0-based) -> (source, line, col)。"""
    resolved: dict[int, tuple[int, int, int]] = {}
    source = src_line = src_col = 0
    for generated_line, segments in enumerate(source_map['mappings'].split(';')):
        if not segments:
            continue
        gen_col = 0
        for chunk in segments.split(','):
            values = _decode_vlq(chunk)
            gen_col += values[0]
            source += values[1]
            src_line += values[2]
            src_col += values[3]
            resolved[generated_line] = (source, src_line, src_col)
    return resolved


def _run_node(script: str) -> dict:
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / 'harness.js'
        path.write_text(script, encoding='utf-8')
        completed = subprocess.run(
            ['node', str(path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=90,
        )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise AssertionError(f'node 无输出\nstdout={completed.stdout}\nstderr={completed.stderr}')
    return json.loads(lines[-1])


def _extract_module_body(text: str, module_path: str) -> str:
    banner = f'  // {module_path}\n'
    start = text.index(banner) + len(banner)
    open_line = text.index('(exports)', start)
    body_start = text.index('\n', open_line) + 1
    body_end = text.index('\n    }\n  });', body_start)
    body = text[body_start:body_end]
    return '\n'.join(line[6:] if line.startswith('      ') else line for line in body.split('\n'))


class GeometryTest(unittest.TestCase):
    """7.1：1280×720 基准换算。"""

    def test_base_conversion(self) -> None:
        from autowsgr.ui.geometry import (
            BASE_HEIGHT,
            BASE_WIDTH,
            capture_area,
            capture_nx,
            capture_ny,
            px,
            scale_to,
        )

        self.assertEqual((BASE_WIDTH, BASE_HEIGHT), (1280, 720))
        self.assertEqual(px(640, 360), (0.5, 0.5))
        self.assertEqual(scale_to(1280, 720), (1.0, 1.0))
        self.assertEqual(scale_to(1920, 1080), (1.5, 1.5))
        self.assertAlmostEqual(capture_nx(192), 0.1)
        self.assertAlmostEqual(capture_ny(108), 0.1)
        self.assertAlmostEqual(capture_area(1920 * 1080), 1.0)


class IntensifyResolutionTest(unittest.TestCase):
    """7.1：强化网格中心与滑动在两档分辨率误差 ≤ 2px。"""

    ORIGINAL_COLUMNS = (182, 393, 604, 815, 1026, 1237, 1448)
    ORIGINAL_ROWS = (360, 792)

    def test_target_columns(self) -> None:
        from autowsgr.ops.intensify import _COL_CENTERS, _ROW_CENTERS

        self.assertEqual(len(_COL_CENTERS), 7)
        for value, original in zip(_COL_CENTERS, self.ORIGINAL_COLUMNS, strict=True):
            self.assertLessEqual(abs(value * 1920 - original), 2.0)
            self.assertLessEqual(abs(value * 1280 - original * 1280 / 1920), 2.0)
        for value, original in zip(_ROW_CENTERS, self.ORIGINAL_ROWS, strict=True):
            self.assertLessEqual(abs(value * 1080 - original), 2.0)
            self.assertLessEqual(abs(value * 720 - original * 720 / 1080), 2.0)

    def test_swipe_command_scales(self) -> None:
        from autowsgr.ops.intensify import _material_swipe_command

        class FakeDevice:
            def __init__(self, resolution: tuple[int, int]) -> None:
                self.resolution = resolution

        text_1280 = _material_swipe_command(FakeDevice((1280, 720)))
        text_1920 = _material_swipe_command(FakeDevice((1920, 1080)))
        self.assertEqual(text_1920, 'input swipe 500 650 500 218 1000')
        numbers = [int(part) for part in re.findall(r'\d+', text_1280)]
        expected = [
            round(500 * 1280 / 1920),
            round(650 * 720 / 1080),
            round(500 * 1280 / 1920),
            round(218 * 720 / 1080),
            1000,
        ]
        self.assertEqual(numbers, expected)


class MaterialScannerResolutionTest(unittest.TestCase):
    """7.1：素材列坐标归一化，不再运行时除以 1920。"""

    def test_constants_are_normalized(self) -> None:
        from autowsgr.ui.material_inventory_scanner import (
            _CARD_HEIGHT,
            _CARD_WIDTH,
            _COLUMN_LEFTS,
        )

        self.assertLessEqual(abs(_CARD_WIDTH * 1920 - 192), 2.0)
        self.assertLessEqual(abs(_CARD_HEIGHT * 1080 - 405), 2.0)
        originals = (86, 297, 508, 719, 930, 1141, 1352)
        for value, original in zip(_COLUMN_LEFTS, originals, strict=True):
            self.assertLessEqual(abs(value * 1920 - original), 2.0)
            self.assertLessEqual(abs(value * 1280 - original * 1280 / 1920), 2.0)

    def test_column_bounds(self) -> None:
        from autowsgr.ui.material_inventory_scanner import MaterialViewportReader

        for width in (1280, 1920):
            bounds = MaterialViewportReader._column_bounds(width)
            for index, (left, right) in enumerate(bounds):
                expected_left = round((86 + 211 * index) * width / 1920)
                expected_right = round((86 + 211 * index + 192) * width / 1920)
                self.assertLessEqual(abs(left - expected_left), 2)
                self.assertLessEqual(abs(right - expected_right), 2)

    def test_no_runtime_1920_divisions(self) -> None:
        text = (PKG / 'ui' / 'material_inventory_scanner.py').read_text(encoding='utf-8')
        self.assertNotIn('_COLUMN_LEFTS_1920', text)
        self.assertNotIn('_CARD_WIDTH_1920', text)
        self.assertNotIn('_CARD_HEIGHT_1080', text)
        self.assertNotIn('/ 1920', text)
        self.assertNotIn('/ 1080', text)


class BathLayoutTest(unittest.TestCase):
    """7.1：浴室卡片阈值按分辨率换算，点击中心误差 ≤ 2px。"""

    @staticmethod
    def _card_screen(width: int, height: int, scale: float) -> np.ndarray:
        image = np.zeros((height, width, 3), dtype=np.uint8)
        x = round(100 * scale)
        y = round(150 * scale)
        cv2.rectangle(
            image,
            (x, y),
            (x + round(174 * scale), y + round(405 * scale)),
            (255, 255, 255),
            -1,
        )
        return image

    def test_detects_card_at_both_resolutions(self) -> None:
        from autowsgr.ui.bath_page.recognition import _detect_card_rects
        from autowsgr.ui.geometry import scale_to

        for width, height in ((1280, 720), (1920, 1080)):
            sx, sy = scale_to(width, height)
            screen = self._card_screen(width, height, sx)
            bgr = cv2.cvtColor(screen, cv2.COLOR_RGB2BGR)
            cards = _detect_card_rects(bgr, scale_x=sx, scale_y=sy)
            self.assertEqual(len(cards), 1, (width, height, cards))
            x, y, w, h = cards[0]
            self.assertLessEqual(abs(x - round(100 * sx)), 2)
            self.assertLessEqual(abs(w - round(174 * sx)), 2)

    def test_1920_card_rejected_without_scaling(self) -> None:
        from autowsgr.ui.bath_page.recognition import _detect_card_rects

        screen = self._card_screen(1920, 1080, 1.5)
        bgr = cv2.cvtColor(screen, cv2.COLOR_RGB2BGR)
        self.assertEqual(_detect_card_rects(bgr), [])

    def test_click_center_matches_between_resolutions(self) -> None:
        from autowsgr.ui.bath_page.recognition import _ocr_card

        class FakeResult:
            def __init__(self, text: str, bbox: tuple[int, int, int, int], confidence: float = 0.9):
                self.text = text
                self.bbox = bbox
                self.confidence = confidence

        class FakeOcr:
            def __init__(self, scale: float) -> None:
                self.scale = scale

            def recognize(self, image: np.ndarray) -> list[FakeResult]:
                scale = self.scale
                return [
                    FakeResult('胡德', (10, round(120 * scale), 90, round(148 * scale))),
                    FakeResult('01:23:45', (10, round(205 * scale), 120, round(235 * scale))),
                ]

        positions = []
        for width, height, scale in ((1280, 720, 1.0), (1920, 1080, 1.5)):
            card = np.zeros((round(405 * scale), round(174 * scale), 3), dtype=np.uint8)
            info = _ocr_card(
                card,
                FakeOcr(scale),
                round(100 * scale),
                round(174 * scale),
                width,
                scale_y=scale,
            )
            self.assertIsNotNone(info)
            positions.append(info.position)  # type: ignore[union-attr]
        self.assertLessEqual(abs(positions[0][0] - positions[1][0]) * 1920, 2.0)
        self.assertEqual(positions[0][1], positions[1][1])


class ResourcePathTest(unittest.TestCase):
    """7.1：绝对路径清零，资源根走 env/安装布局。"""

    ENV_KEYS = ('AUTOWSGR_RESOURCE_ROOT', 'AUTOWSGR_SHIP_LIBRARY', 'AUTOWSGR_WSG_NCC_DATA')

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

    def test_no_hardcoded_drive_paths(self) -> None:
        for relative in (
            'ops/intensify.py',
            'vision/ship_card_recognizer.py',
        ):
            text = (PKG / relative).read_text(encoding='utf-8')
            self.assertNotIn(r'E:\wsgrgui', text, relative)
            self.assertNotIn('wsgrgui', text, relative)

    def test_install_layout_fallback(self) -> None:
        from autowsgr.infra.paths import resolve_resource_root

        root = resolve_resource_root()
        self.assertIsNotNone(root)
        self.assertTrue((root / 'ship-library').is_dir())
        self.assertEqual(root.name, 'resource')

    def test_env_accepts_resource_parent_or_data_root(self) -> None:
        from autowsgr.infra.paths import resolve_resource_root

        with tempfile.TemporaryDirectory() as temp:
            parent = Path(temp)
            (parent / 'resource' / 'ship-library').mkdir(parents=True)
            os.environ['AUTOWSGR_RESOURCE_ROOT'] = str(parent)
            self.assertEqual(resolve_resource_root(), parent / 'resource')
            os.environ['AUTOWSGR_RESOURCE_ROOT'] = str(parent / 'resource')
            self.assertEqual(resolve_resource_root(), parent / 'resource')

    def test_ship_recognizer_uses_resource_root(self) -> None:
        from autowsgr.vision.ship_card_recognizer import (
            ShipCardRecognitionError,
            load_default_ship_card_recognizer,
        )

        with tempfile.TemporaryDirectory() as temp:
            data_root = Path(temp) / 'resource'
            (data_root / 'wsg-ncc').mkdir(parents=True)
            (data_root / 'ship-library').mkdir(parents=True)
            os.environ['AUTOWSGR_RESOURCE_ROOT'] = str(data_root)
            with self.assertRaises(ShipCardRecognitionError) as raised:
                load_default_ship_card_recognizer()
            self.assertIn(str(data_root / 'wsg-ncc'), str(raised.exception))

    def test_backend_service_injects_resource_root(self) -> None:
        text = BACKEND_SERVICE.read_text(encoding='utf-8')
        self.assertIn('AUTOWSGR_RESOURCE_ROOT: dataRoot', text)
        self.assertIn('resourceDataRoot', text)
        self.assertIn('resourceDataRoot', APP_PATHS.read_text(encoding='utf-8'))
        self.assertIn('resourceDataRoot: () => appPaths.resourceDataRoot()', MAIN_JS.read_text(encoding='utf-8'))


class ThemeSingleSourceTest(unittest.TestCase):
    """7.6：YAML 是主题真值，localStorage 只在 YAML 未就绪时兜底。"""

    def test_python_config_accepts_theme_fields(self) -> None:
        from autowsgr.infra.config import ConfigManager

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'usersettings.yaml'
            path.write_text(
                'emulator:\n'
                '  type: MuMu\n'
                '  serial: 127.0.0.1:16484\n'
                'log:\n'
                '  level: WARNING\n'
                'theme_mode: dark\n'
                'accent_color: "#ABCDEF"\n',
                encoding='utf-8',
            )
            config = ConfigManager.load(path)
            self.assertEqual(config.log.level, 'WARNING')
            self.assertEqual(config.theme_mode, 'dark')
            self.assertEqual(config.accent_color, '#abcdef')

    def test_python_config_defaults_theme(self) -> None:
        from autowsgr.infra import UserConfig

        config = UserConfig()
        self.assertEqual(config.theme_mode, 'light')
        self.assertEqual(config.accent_color, '#0f7dff')

    def test_renderer_contract(self) -> None:
        text = _bundle_text()
        self.assertIn('function setThemeFromYaml(mode, accent) {', text)
        self.assertIn('if (yamlThemeMode !== null)\n          return yamlThemeMode;', text.replace('\r\n', '\n'))
        self.assertIn('themeMode: cfg.theme_mode,', text)
        self.assertIn('accentColor: cfg.accent_color,', text)
        self.assertIn('output.theme_mode = this.settings.theme_mode;', text)
        self.assertIn('this.yamlThemePresent = parsed.theme_mode === "light"', text)
        self.assertIn('await this.applyYamlTheme();', text)
        self.assertIn('Logger_1.Logger.setLevel(Logger_1.LOG_LEVEL_ALIASES[cfg.log.level]', text)

    def test_theme_module_prefers_yaml_over_local_storage(self) -> None:
        body = _extract_module_body(_bundle_text(), 'dist/src/view/theme.js')
        script = f"""
const storage = new Map([['themeMode', 'dark'], ['accentColor', '#ff0000']]);
const StorageAdapter_1 = {{
  browserStorageStore: {{
    get: (key) => storage.has(key) ? storage.get(key) : null,
    set: (key, value) => storage.set(key, value),
  }},
}};
const fakeDocument = {{
  documentElement: {{
    attrs: {{}},
    setAttribute(key, value) {{ this.attrs[key] = value; }},
    style: {{ props: {{}}, setProperty(key, value) {{ this.props[key] = value; }} }},
  }},
}};
const fakeWindow = {{ matchMedia: () => ({{ matches: true, addEventListener() {{}} }}) }};
const exportsObj = {{}};
const factory = new Function('StorageAdapter_1', 'require_StorageAdapter', 'window', 'document', 'exports', {json.dumps(body)});
factory(StorageAdapter_1, () => StorageAdapter_1, fakeWindow, fakeDocument, exportsObj);
const result = {{}};
result.localFallback = exportsObj.getThemeMode();
exportsObj.setThemeFromYaml('light', '#112233');
result.yamlMode = exportsObj.getThemeMode();
result.yamlAccent = exportsObj.getAccentColor();
exportsObj.applyTheme();
result.attribute = fakeDocument.documentElement.attrs['data-theme'];
result.cssAccent = fakeDocument.documentElement.style.props['--accent'];
exportsObj.previewTheme('dark', undefined);
result.preview = exportsObj.getThemeMode();
exportsObj.setThemeFromYaml('system', '#112233');
exportsObj.applyTheme();
result.system = fakeDocument.documentElement.attrs['data-theme'];
console.log(JSON.stringify(result));
process.exit(0);
"""
        result = _run_node(script)
        self.assertEqual(result['localFallback'], 'dark')
        self.assertEqual(result['yamlMode'], 'light')
        self.assertEqual(result['yamlAccent'], '#112233')
        self.assertEqual(result['attribute'], 'light')
        self.assertEqual(result['cssAccent'], '#112233')
        self.assertEqual(result['preview'], 'dark')
        self.assertEqual(result['system'], 'dark')


class SourcemapTest(unittest.TestCase):
    """7.7：外链 sourcemap、全局错误栈、打包完整性。"""

    @classmethod
    def setUpClass(cls) -> None:
        cls.text = _bundle_text()
        cls.lines = cls.text.replace('\r\n', '\n').split('\n')
        cls.source_map = json.loads(SOURCE_MAP.read_text(encoding='utf-8'))
        cls.resolved = _resolve_mappings(cls.source_map)

    def test_bundle_declares_external_map(self) -> None:
        tail = '\n'.join(self.lines[-3:])
        self.assertIn('//# sourceMappingURL=renderer.bundle.js.map', tail)
        self.assertTrue(SOURCE_MAP.is_file())
        self.assertEqual(self.source_map['file'], 'renderer.bundle.js')

    def test_sources_content_present(self) -> None:
        self.assertEqual(len(self.source_map['sources']), len(self.source_map['sourcesContent']))
        self.assertIn('src/view/main/LogView.js', self.source_map['sources'])
        self.assertTrue(any(source.startswith('src/view/') for source in self.source_map['sources']))
        for content in self.source_map['sourcesContent']:
            self.assertIsInstance(content, str)
            self.assertTrue(content)

    def test_line_mapping_matches_source(self) -> None:
        for needle in (
            'var MAX_BUFFER_ENTRIES = 5000;',
            'function setThemeFromYaml(mode, accent) {',
            'var QUEUE_SNAPSHOT_FILE = "queue_state.json";',
        ):
            index = next(i for i, line in enumerate(self.lines) if needle in line)
            source_idx, source_line, _col = self.resolved[index]
            expected = self.lines[index][6:]
            actual = self.source_map['sourcesContent'][source_idx].split('\n')[source_line]
            self.assertEqual(actual, expected)
            self.assertTrue(self.source_map['sources'][source_idx].startswith(('src/', 'node_modules/')))

    def test_real_stack_frame_maps_to_view_source(self) -> None:
        code_path = str(RENDERER).replace('\\', '\\\\')
        script = f"""
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('{code_path}', 'utf8');
global.window = {{
  addEventListener() {{}},
  electronBridge: {{ appendGuiLog() {{}} }},
  matchMedia: () => ({{ matches: false, addEventListener() {{}} }}),
}};
global.document = undefined;
let stack = null;
process.on('unhandledRejection', (reason) => {{
  stack = reason && reason.stack ? reason.stack : String(reason);
}});
process.on('uncaughtException', (error) => {{
  stack = error.stack;
}});
try {{
  vm.runInThisContext(code, {{ filename: 'renderer.bundle.js' }});
}} catch (error) {{
  stack = error.stack;
}}
setTimeout(() => {{
  console.log(JSON.stringify({{ stack }}));
  process.exit(0);
}}, 300);
"""
        result = _run_node(script)
        stack = result['stack']
        self.assertIsInstance(stack, str)
        frames = [
            (int(line), int(column))
            for line, column in re.findall(r'renderer\.bundle\.js:(\d+):(\d+)', stack)
        ]
        self.assertTrue(frames)
        mapped = [self.resolved[line - 1] for line, _column in frames if line - 1 in self.resolved]
        self.assertTrue(mapped)
        view_frames = [
            (source, source_line + 1)
            for source, source_line, _column in mapped
            if self.source_map['sources'][source].startswith('src/view/')
        ]
        self.assertTrue(view_frames, mapped)
        self.assertEqual(self.source_map['sources'][mapped[0][0]], 'src/view/main/LogView.js')

    def test_global_error_handler_records_full_stack(self) -> None:
        text = self.text.replace('\r\n', '\n')
        start = text.index('  function __recordRendererError(kind, error) {')
        end = text.index('\n\n  // dist/src/view/main/LogView.js', start)
        snippet = text[start:end]
        script = f"""
const captured = [];
const consoleErrors = [];
const listeners = {{}};
const fakeWindow = {{
  electronBridge: {{ appendGuiLog: (line) => captured.push(line) }},
  addEventListener: (name, handler) => {{ listeners[name] = handler; }},
  onerror: null,
}};
const fakeConsole = {{ error: (line) => consoleErrors.push(line) }};
const factory = new Function('window', 'console', {json.dumps(snippet)});
factory(fakeWindow, fakeConsole);
const stack = 'Error: boom\\n    at renderSomething (renderer.bundle.js:94:40)\\n    at src/view/main/LogView.js:12:3';
fakeWindow.onerror('boom', 'renderer.bundle.js', 94, 40, {{ stack }});
listeners['unhandledrejection']({{ reason: new Error('promise boom') }});
console.log(JSON.stringify({{ captured, consoleErrors }}));
process.exit(0);
"""
        result = _run_node(script)
        captured = result['captured']
        self.assertEqual(len(captured), 2)
        self.assertIn('[RendererError] error |', captured[0])
        self.assertIn('at renderSomething (renderer.bundle.js:94:40)', captured[0])
        self.assertIn('[RendererError] unhandledrejection |', captured[1])
        self.assertIn('promise boom', captured[1])
        self.assertTrue(result['consoleErrors'])

    def test_asar_contains_map_with_integrity(self) -> None:
        files = _asar_files()
        bundle_path = 'dist/renderer.bundle.js'
        map_path = 'dist/renderer.bundle.js.map'
        self.assertIn(map_path, files)
        for path in (bundle_path, map_path):
            meta, data = files[path]
            self.assertEqual(meta['integrity']['hash'], hashlib.sha256(data).hexdigest())
            self.assertFalse(meta.get('unpacked'))
        _bundle_meta, bundle_data = files[bundle_path]
        _map_meta, map_data = files[map_path]
        self.assertIn(b'//# sourceMappingURL=renderer.bundle.js.map', bundle_data[-256:])
        packed_map = json.loads(map_data.decode('utf-8'))
        self.assertTrue(packed_map['sourcesContent'])
        self.assertIn('src/view/main/LogView.js', packed_map['sources'])
        self.assertGreater(len(packed_map['mappings']), 0)

        # 打包版 map 必须能把 bundle 行解回 src/view 源码行。
        packed_resolved = _resolve_mappings(packed_map)
        bundle_lines = bundle_data.decode('utf-8').replace('\r\n', '\n').split('\n')
        needle = 'e.dataTransfer?.types.includes("application/x-tg-item")'
        generated = next(i for i, line in enumerate(bundle_lines) if needle in line)
        source_idx, source_line, _column = packed_resolved[generated]
        self.assertTrue(packed_map['sources'][source_idx].endswith('src/view/main/TaskQueueView.js'))
        self.assertIn(
            needle,
            packed_map['sourcesContent'][source_idx].split('\n')[source_line],
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
