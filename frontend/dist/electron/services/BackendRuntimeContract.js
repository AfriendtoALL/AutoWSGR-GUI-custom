"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKEND_RUNTIME_CONTRACT = void 0;
exports.selectBackendOcrGpuMode = selectBackendOcrGpuMode;
exports.applyBackendRuntimeSettings = applyBackendRuntimeSettings;
exports.buildBackendCapabilityProbe = buildBackendCapabilityProbe;
exports.buildBackendBootstrap = buildBackendBootstrap;
const backendContractProbe_1 = require("../pythonEnv/backendContractProbe");
exports.BACKEND_RUNTIME_CONTRACT = 'gui-runtime-env-v1';
/** 将 GUI 模式与 CUDA 探测结果转换为后端支持的明确模式。 */
function selectBackendOcrGpuMode(requestedMode, cudaAvailable) {
    if (requestedMode === 'cpu')
        return 'cpu';
    if (cudaAvailable)
        return 'cuda';
    if (requestedMode === 'auto')
        return 'cpu';
    throw new Error('已强制使用 CUDA，但未检测到可用 CUDA');
}
function pythonLiteral(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}
function pythonPathSetup(environment) {
    return [
        'import sys, os, site',
        ...(environment.useLocalSite
            ? [
                `sp = r'${pythonLiteral(environment.localSite)}'`,
                'sys.path.insert(0, sp)',
                'site.addsitedir(sp)',
            ]
            : []),
        ...(environment.backendRoot
            ? [
                `repo = r'${pythonLiteral(environment.backendRoot)}'`,
                'sys.path.insert(0, repo)',
            ]
            : []),
    ];
}
function sourceVerification(environment) {
    const expectedRoot = environment.backendRoot
        ?? environment.localSite;
    return [
        'from pathlib import Path',
        'import autowsgr',
        `_expected_root = Path(r'${pythonLiteral(expectedRoot)}').resolve()`,
        '_autowsgr_file = Path(autowsgr.__file__).resolve()',
        'if not _autowsgr_file.is_relative_to(_expected_root):',
        "    raise RuntimeError('GUI 后端来源错误: ' + str(_autowsgr_file))",
    ];
}
/** 将 GUI 运行设置写入后端已经公开支持的环境变量。 */
function applyBackendRuntimeSettings(baseEnv, settings) {
    return {
        ...baseEnv,
        AUTOWSGR_OCR_GPU_MODE: settings.ocrGpuMode,
        AUTOWSGR_SAVE_IMAGES: settings.saveImages ? 'true' : 'false',
    };
}
/** 生成启动前能力探测脚本；不满足契约时由 Python 明确报错。 */
function buildBackendCapabilityProbe(environment) {
    return [
        ...pythonPathSetup(environment),
        ...sourceVerification(environment),
        ...(0, backendContractProbe_1.buildBackendRuntimeContractProbeLines)(),
        '_verify_gui_runtime_contract()',
        'from autowsgr.server.main import app as _backend_app',
        'import inspect as _inspect',
        'if not callable(_backend_app):',
        "    raise RuntimeError('AutoWSGR server app 不可调用')",
        '_app_call = getattr(_backend_app, "__call__", None)',
        'if not (_inspect.iscoroutinefunction(_backend_app) or _inspect.iscoroutinefunction(_app_call)):',
        "    raise RuntimeError('AutoWSGR server app 不是 ASGI 应用')",
        `print('[Contract] ${exports.BACKEND_RUNTIME_CONTRACT}')`,
        "print('[Contract] autowsgr=' + str(_autowsgr_file))",
    ].join('\n');
}
/** 生成通过能力检查后使用的最小后端启动脚本。 */
function buildBackendBootstrap(environment, port) {
    return [
        ...pythonPathSetup(environment),
        ...sourceVerification(environment),
        "print('[Bootstrap] autowsgr=' + str(_autowsgr_file))",
        "print('[Bootstrap] ocr_gpu_mode=' + os.environ.get('AUTOWSGR_OCR_GPU_MODE', 'cpu'))",
        "print('[Bootstrap] save_backend_screenshots=' + os.environ.get('AUTOWSGR_SAVE_IMAGES', 'false'))",
        'import uvicorn',
        `uvicorn.run('autowsgr.server.main:app', host='127.0.0.1', port=${port})`,
    ].join('\n');
}
