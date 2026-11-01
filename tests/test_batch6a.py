"""批次 6a 离线回归：鉴权 / XSS / CSP / IPC 订阅。

覆盖验收路径：

1. ``/api/*`` 没有 Bearer token 一律 401，带正确 token 放行，OPTIONS 预检不拦截；
2. CORS 不再允许 ``*``，只放行 file:// / app:// / 本机回环；
3. 生产构建关闭 ``/docs`` / ``/redoc`` / ``openapi.json``；
4. token 优先取环境变量，其次复用 ``.env_ready``，最后才生成并写盘；
5. 方案列表与选择器不再把不可信文件名拼进 ``innerHTML``；
6. CSP 含 object-src / base-uri / frame-ancestors；
7. preload 的订阅接口返回退订函数、10 个死接口已删除、按域暴露 settings/plans；
8. 渲染层重复初始化时通过 ``bindIpcSubscription`` 先退订旧监听。

运行::

    .\\python\\python.exe tests\\test_batch6a.py -v
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from starlette.requests import Request
from starlette.responses import Response

from autowsgr.infra import config as infra_config
from autowsgr.server import main as server_main


ROOT = Path(__file__).resolve().parents[1]
ASAR = ROOT / '.workbuddy' / 'asar_work' / 'dist'
RENDERER = ASAR / 'renderer.bundle.js'
PRELOAD = ASAR / 'electron' / 'preload.js'
MAIN_JS = ASAR / 'electron' / 'main.js'
WINDOW_SERVICE = ASAR / 'electron' / 'services' / 'WindowService.js'

TOKEN = 'unit-test-token'


def _http_scope(
    path: str,
    method: str = 'GET',
    headers: tuple[tuple[str, str], ...] = (),
) -> dict:
    return {
        'type': 'http',
        'asgi': {'version': '3.0'},
        'http_version': '1.1',
        'method': method,
        'scheme': 'http',
        'server': ('127.0.0.1', 8438),
        'client': ('127.0.0.1', 50000),
        'root_path': '',
        'path': path,
        'raw_path': path.encode(),
        'query_string': b'',
        'headers': [
            (key.lower().encode('latin-1'), value.encode('latin-1'))
            for key, value in headers
        ],
    }


async def _ok_call_next(_request: Request) -> Response:
    return Response('ok', status_code=200)


def _run_guard(scope: dict) -> Response | None:
    """执行鉴权中间件；被放行时返回 None。"""

    async def _run() -> Response | None:
        result = await server_main.require_api_token(Request(scope), _ok_call_next)
        return None if result.status_code == 200 else result

    return asyncio.run(_run())


class TokenResolutionTests(unittest.TestCase):
    """6.1：token 生成/持久化优先级。"""

    def setUp(self) -> None:
        self._env = mock.patch.dict('os.environ', {}, clear=False)
        self._env.start()
        self.addCleanup(self._env.stop)
        import os

        os.environ.pop('AUTOWSGR_API_TOKEN', None)
        self._cache = mock.patch.object(infra_config, '_api_token', None)
        self._cache.start()
        self.addCleanup(self._cache.stop)
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.path = self.tmp / '.env_ready'
        self._path_patch = mock.patch.object(
            infra_config,
            'ready_state_path',
            side_effect=lambda: self.path,
        )
        self._path_patch.start()
        self.addCleanup(self._path_patch.stop)

    def test_env_token_has_priority_and_is_not_persisted(self) -> None:
        self.path.write_text(
            json.dumps({'apiToken': 'persisted', 'pythonCmd': 'py.exe'}),
            encoding='utf-8',
        )
        with mock.patch.dict('os.environ', {'AUTOWSGR_API_TOKEN': TOKEN}):
            self.assertEqual(infra_config.resolve_api_token(), TOKEN)
        payload = json.loads(self.path.read_text(encoding='utf-8'))
        self.assertEqual(payload['apiToken'], 'persisted')
        self.assertEqual(payload['pythonCmd'], 'py.exe')

    def test_persisted_token_is_reused_without_env(self) -> None:
        self.path.write_text(json.dumps({'apiToken': TOKEN}), encoding='utf-8')
        self.assertEqual(infra_config.resolve_api_token(), TOKEN)

    def test_missing_token_is_generated_and_persisted(self) -> None:
        self.path.write_text(json.dumps({'pythonCmd': 'py.exe'}), encoding='utf-8')
        token = infra_config.resolve_api_token()
        self.assertGreaterEqual(len(token), 32)
        payload = json.loads(self.path.read_text(encoding='utf-8'))
        self.assertEqual(payload['apiToken'], token)
        self.assertEqual(payload['pythonCmd'], 'py.exe')
        # 同一进程内必须稳定，否则前端拿到的是上一个 token。
        self.assertEqual(infra_config.resolve_api_token(), token)

    def test_broken_ready_state_falls_back_to_generated_token(self) -> None:
        self.path.write_text('{not json', encoding='utf-8')
        token = infra_config.resolve_api_token()
        self.assertTrue(token)
        self.assertIsInstance(json.loads(self.path.read_text(encoding='utf-8')), dict)


class AuthMiddlewareTests(unittest.TestCase):
    """6.1：/api/* 鉴权、OPTIONS 放行、路径边界。"""

    def setUp(self) -> None:
        self._env = mock.patch.dict('os.environ', {'AUTOWSGR_API_TOKEN': TOKEN})
        self._env.start()
        self.addCleanup(self._env.stop)
        self._cache = mock.patch.object(infra_config, '_api_token', None)
        self._cache.start()
        self.addCleanup(self._cache.stop)

    def test_api_path_detection(self) -> None:
        self.assertTrue(server_main._is_api_path('/api'))
        self.assertTrue(server_main._is_api_path('/api/system/status'))
        self.assertFalse(server_main._is_api_path('/apifoo'))
        self.assertFalse(server_main._is_api_path('/ws/logs'))
        self.assertFalse(server_main._is_api_path('/'))

    def test_missing_header_returns_401_envelope(self) -> None:
        response = _run_guard(_http_scope('/api/system/status'))
        self.assertIsNotNone(response)
        assert response is not None
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers['www-authenticate'], 'Bearer')
        body = json.loads(response.body)
        self.assertFalse(body['success'])
        self.assertEqual(body['error_code'], 'unauthorized')

    def test_wrong_or_malformed_token_returns_401(self) -> None:
        for header in ('Bearer wrong-token', f'Basic {TOKEN}', 'Bearer'):
            with self.subTest(header=header):
                response = _run_guard(
                    _http_scope(
                        '/api/system/status',
                        headers=(('authorization', header),),
                    )
                )
                self.assertIsNotNone(response)
                assert response is not None
                self.assertEqual(response.status_code, 401)

    def test_trailing_whitespace_in_header_is_tolerated(self) -> None:
        response = _run_guard(
            _http_scope(
                '/api/system/status',
                headers=(('authorization', f'bearer  {TOKEN}  '),),
            )
        )
        self.assertIsNone(response)

    def test_valid_token_passes(self) -> None:
        response = _run_guard(
            _http_scope(
                '/api/system/status',
                headers=(('authorization', f'Bearer {TOKEN}'),),
            )
        )
        self.assertIsNone(response)

    def test_options_preflight_is_not_blocked(self) -> None:
        response = _run_guard(
            _http_scope(
                '/api/system/status',
                method='OPTIONS',
                headers=(('origin', 'null'), ('access-control-request-method', 'GET')),
            )
        )
        self.assertIsNone(response)

    def test_non_api_paths_are_not_blocked(self) -> None:
        for path in ('/', '/openapi.json', '/ws/logs'):
            with self.subTest(path=path):
                self.assertIsNone(_run_guard(_http_scope(path)))

    def test_ws_token_query_parameter(self) -> None:
        valid = SimpleNamespace(query_params={'token': TOKEN})
        missing = SimpleNamespace(query_params={})
        wrong = SimpleNamespace(query_params={'token': 'nope'})
        self.assertTrue(server_main.ws_token_valid(valid))
        self.assertFalse(server_main.ws_token_valid(missing))
        self.assertFalse(server_main.ws_token_valid(wrong))


class CorsAndDocsTests(unittest.TestCase):
    """6.1：CORS 收紧 + 生产关闭文档端点。"""

    def test_cors_is_restricted(self) -> None:
        cors = next(
            item
            for item in server_main.app.user_middleware
            if item.cls.__name__ == 'CORSMiddleware'
        )
        options = cors.kwargs
        self.assertNotIn('*', options['allow_origins'])
        self.assertIn('null', options['allow_origins'])
        self.assertIn('file://', options['allow_origins'])
        self.assertIn('app://', options['allow_origins'])
        self.assertFalse(options['allow_credentials'])
        self.assertIn('Authorization', options['allow_headers'])
        self.assertIn('authorization', options['allow_headers'][0].lower())

    def test_docs_are_disabled_in_production(self) -> None:
        self.assertIsNone(server_main.app.docs_url)
        self.assertIsNone(server_main.app.redoc_url)
        self.assertIsNone(server_main.app.openapi_url)

    def test_auth_middleware_is_registered(self) -> None:
        names = [item.cls.__name__ for item in server_main.app.user_middleware]
        self.assertIn('CORSMiddleware', names)
        self.assertIn('BaseHTTPMiddleware', names)


class FrontendContractTests(unittest.TestCase):
    """6.1/6.2/6.3/6.4：前端源码静态契约。"""

    def setUp(self) -> None:
        self.renderer = RENDERER.read_text(encoding='utf-8')
        self.preload = PRELOAD.read_text(encoding='utf-8')

    def test_requests_carry_bearer_token(self) -> None:
        self.assertIn('function readApiToken()', self.renderer)
        self.assertIn('headers.Authorization = `Bearer ${token}`', self.renderer)
        self.assertIn('bridge?.getApiToken?.()', self.renderer)
        self.assertIn('?token=${encodeURIComponent(token)}', self.renderer)

    def test_token_bridge_is_wired_through_main_and_preload(self) -> None:
        preload = PRELOAD.read_text(encoding='utf-8')
        main_js = MAIN_JS.read_text(encoding='utf-8')
        self.assertIn("getApiToken: () => {", preload)
        self.assertIn("ipcRenderer.invoke('get-api-token')", preload)
        self.assertIn('randomBytes(32)', main_js)
        self.assertIn('process.env.AUTOWSGR_API_TOKEN = BACKEND_API_TOKEN', main_js)
        self.assertIn("ipcMain.handle('get-api-token'", main_js)

    def test_plan_list_renders_text_not_html(self) -> None:
        start = self.renderer.index('        renderPlanList(paths) {')
        end = self.renderer.index('\n        }\n', start)
        body = self.renderer[start:end]
        self.assertIn('container.replaceChildren()', body)
        self.assertIn('nameEl.textContent = name', body)
        self.assertIn('nameEl.title = p', body)
        self.assertNotIn('innerHTML =', body)
        self.assertNotIn('<img', body)

    def test_selector_options_are_escaped(self) -> None:
        self.assertIn('${escapeHtml(opt.label)}', self.renderer)
        self.assertIn('${escapeHtml(opt.icon)}', self.renderer)
        self.assertIn('${escapeHtml(s)}', self.renderer)
        self.assertIn('${escapeHtml(label)}', self.renderer)

    def test_csp_is_hardened(self) -> None:
        text = WINDOW_SERVICE.read_text(encoding='utf-8')
        self.assertIn("object-src 'none'", text)
        self.assertIn("base-uri 'none'", text)
        self.assertIn("frame-ancestors 'none'", text)

    def test_preload_subscriptions_return_unsubscribe(self) -> None:
        # 6.7 新增 install-deps-progress 订阅，6 → 7。
        self.assertEqual(self.preload.count('return subscribe('), 7)
        self.assertIn('removeListener(channel, listener)', self.preload)
        self.assertIn('onInstallDepsProgress: (callback) => {', self.preload)

    def test_dead_bridge_methods_are_removed(self) -> None:
        removed = [
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
        ]
        for name in removed:
            with self.subTest(name=name):
                self.assertNotIn(f'\n    {name}: (', self.preload)

    def test_bridge_exposes_settings_and_plans_domains(self) -> None:
        self.assertIn('electronBridge.settings = pickMethods(SETTINGS_METHODS)', self.preload)
        self.assertIn('electronBridge.plans = pickMethods(PLANS_METHODS)', self.preload)
        self.assertIn("getDomainView(\"settings\")", self.renderer)
        self.assertIn("getDomainView(\"plans\")", self.renderer)

    def test_duplicate_subscription_is_disposed(self) -> None:
        self.assertIn('function bindIpcSubscription(key, subscribe)', self.renderer)
        self.assertIn('(0, IpcAdapter_1.bindIpcSubscription)("backend-log"', self.renderer)
        self.assertIn('(0, IpcAdapter_js_1.bindIpcSubscription)("settings-gui-update"', self.renderer)
        self.assertNotIn('\n      function getTemplateRepository() {', self.renderer)


if __name__ == '__main__':
    unittest.main(verbosity=2)
