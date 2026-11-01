"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBackendRuntimeEnvironment = void 0;
exports.initBackend = initBackend;
exports.getBackendProcess = getBackendProcess;
exports.isBackendTracebackBoundary = isBackendTracebackBoundary;
exports.runSetupScript = runSetupScript;
exports.startBackend = startBackend;
exports.stopBackend = stopBackend;
/**
 * 管理 Python 后端的环境、进程和日志。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const pythonEnv_1 = require("../pythonEnv");
const BackendRuntimeContract_1 = require("./BackendRuntimeContract");
const BackendShutdownService_1 = require("./BackendShutdownService");
var pythonEnv_2 = require("../pythonEnv");
Object.defineProperty(exports, "buildBackendRuntimeEnvironment", { enumerable: true, get: function () { return pythonEnv_2.buildBackendRuntimeEnvironment; } });
let ctx;
let backendProcess = null;
let backendStopPromise = null;
/** 注入 Electron 运行时能力。 */
function initBackend(context) {
    ctx = context;
}
/** 返回当前后端进程；未启动或已退出时返回 null。 */
function getBackendProcess() {
    return backendProcess;
}
/** 判断后端 stderr 中 Python traceback 的起始边界。 */
function isBackendTracebackBoundary(line) {
    const trimmed = line.trim();
    return trimmed === 'Traceback (most recent call last):'
        || trimmed === 'During handling of the above exception, another exception occurred:';
}
function readGuiSettings() {
    try {
        const settingsPath = path.join(ctx.userDataRoot(), 'gui_settings.json');
        if (!fs.existsSync(settingsPath))
            return {};
        return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    catch {
        return {};
    }
}
function readOcrGpuModeFromSettings() {
    const value = readGuiSettings().ocr_gpu_mode;
    if (value === 'cpu' || value === 'cuda')
        return value;
    return 'auto';
}
function readCudaPathFromSettings() {
    const value = readGuiSettings().cuda_path;
    const cudaRoot = (0, pythonEnv_1.resolveConfiguredCudaRoot)(value);
    if (typeof value === 'string'
        && value.trim()
        && !cudaRoot) {
        console.warn(`[Backend] 忽略 cuda_path（未找到 Toolkit 或 CUDA Runtime DLL）: ${path.resolve(value.trim())}`);
    }
    return cudaRoot;
}
function readSaveBackendScreenshotsFromSettings() {
    return readGuiSettings().save_backend_screenshots === true;
}
/** 7.1/7.5：强化快照依赖的数据路径；数据根由 AppPaths.resourceDataRoot() 决定。 */
function buildIntensifyDataEnvironment(dataRoot) {
    const environment = {
        AUTOWSGR_RESOURCE_ROOT: dataRoot,
        AUTOWSGR_STRENGTHEN_DATA: path.join(dataRoot, 'strengthen.json'),
        AUTOWSGR_SHIP_LIBRARY: path.join(dataRoot, 'ship-library'),
    };
    const nccDir = path.join(dataRoot, 'wsg-ncc');
    if (fs.existsSync(nccDir)) {
        environment.AUTOWSGR_WSG_NCC_DATA = nccDir;
    }
    return environment;
}
/** 使用后端实际运行环境解析 OCR 的自动/强制 CUDA 模式。 */
function resolveBackendOcrGpuMode(pythonCommand, requestedMode, cwd, processEnv) {
    if (requestedMode === 'cpu')
        return Promise.resolve('cpu');
    const probe = [
        'import json',
        'try:',
        '    import torch',
        '    result = {',
        '        "available": bool(torch.cuda.is_available()),',
        '        "torch_version": str(torch.__version__),',
        '        "cuda_version": getattr(torch.version, "cuda", None),',
        '    }',
        'except Exception as exc:',
        '    result = {"available": False, "error": str(exc)}',
        'print(json.dumps(result, ensure_ascii=False))',
    ].join('\n');
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)(pythonCommand, ['-X', 'utf8', '-c', probe], {
            cwd,
            windowsHide: true,
            timeout: 20000,
            encoding: 'utf8',
            env: processEnv,
        }, (error, stdout, stderr) => {
            let detail = String(stderr || error?.message || '').trim();
            let available = false;
            if (!error) {
                try {
                    const output = String(stdout)
                        .trim()
                        .split(/\r?\n/)
                        .filter(Boolean)
                        .at(-1);
                    const result = JSON.parse(output || '{}');
                    available = result.available === true;
                    detail = result.error
                        ?? `PyTorch ${result.torch_version ?? 'unknown'}, CUDA ${result.cuda_version ?? '不可用'}`;
                }
                catch (parseError) {
                    detail = parseError instanceof Error
                        ? parseError.message
                        : String(parseError);
                }
            }
            try {
                resolve((0, BackendRuntimeContract_1.selectBackendOcrGpuMode)(requestedMode, available));
            }
            catch {
                reject(new Error(`已强制使用 CUDA，但后端运行环境未检测到可用 CUDA：${detail || '无检测结果'}`));
                return;
            }
            if (!available) {
                console.warn(`[Backend] 未检测到可用 CUDA，OCR 自动切换为 CPU: ${detail || '无检测结果'}`);
            }
        });
    });
}
/** 启动前验证后端来源、服务入口和正式运行设置契约。 */
function verifyBackendRuntimeContract(pythonCommand, environment, cwd, processEnv) {
    const probe = (0, BackendRuntimeContract_1.buildBackendCapabilityProbe)(environment);
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)(pythonCommand, ['-X', 'utf8', '-c', probe], {
            cwd,
            windowsHide: true,
            timeout: 30000,
            encoding: 'utf8',
            env: processEnv,
        }, (error, stdout, stderr) => {
            if (!error) {
                const message = String(stdout).trim();
                if (message)
                    console.log(`[Backend] ${message}`);
                resolve();
                return;
            }
            const detail = String(stderr || stdout || error.message)
                .trim()
                .slice(-2000);
            reject(new Error(`后端版本或能力不兼容，已阻止启动：${detail || error.message}`));
        });
    });
}
/** 运行 setup.bat 安装环境。 */
function runSetupScript() {
    return new Promise((resolve) => {
        let setupPath = path.join(ctx.resourceRoot(), 'setup.bat');
        if (!fs.existsSync(setupPath)) {
            setupPath = path.join(ctx.appRoot(), 'setup.bat');
        }
        if (!fs.existsSync(setupPath)) {
            resolve({ success: false, output: '找不到 setup.bat' });
            return;
        }
        const proc = (0, child_process_1.spawn)('cmd.exe', ['/c', setupPath], {
            cwd: ctx.appRoot(),
            windowsHide: false,
            stdio: 'pipe',
        });
        let output = '';
        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
            ctx.sendToRenderer('setup-log', text);
        });
        proc.stderr?.on('data', (data) => {
            const text = data.toString();
            output += text;
            ctx.sendToRenderer('setup-log', text);
        });
        proc.on('close', (code) => {
            resolve({ success: code === 0, output: output.slice(-1000) });
        });
        proc.on('error', (error) => {
            resolve({ success: false, output: error.message });
        });
    });
}
/** 使用当前唯一 Python 环境启动 AutoWSGR 后端。 */
async function startBackend() {
    const pythonCmd = await (0, pythonEnv_1.findPython)();
    if (!pythonCmd) {
        throw new Error('找不到兼容的 Python（需要 3.12 或 3.13）');
    }
    const environment = (0, pythonEnv_1.resolvePythonEnvironment)(pythonCmd);
    if (environment.useLocalSite)
        (0, pythonEnv_1.ensurePthFile)();
    const certFile = await (0, pythonEnv_1.ensureSslCertForPython)(pythonCmd);
    if (certFile)
        console.log(`[Backend] TLS cert: ${certFile}`);
    else {
        console.warn('[Backend] WARNING 未检测到 TLS 根证书，HTTPS 请求可能失败');
    }
    const cwd = ctx.appRoot();
    const localBackendRepo = environment.backendRoot;
    const requestedOcrGpuMode = readOcrGpuModeFromSettings();
    const configuredCudaRoot = readCudaPathFromSettings();
    const saveBackendScreenshots = readSaveBackendScreenshotsFromSettings();
    const resourceDataRoot = typeof ctx.resourceDataRoot === 'function'
        ? ctx.resourceDataRoot()
        : path.join(ctx.resourceRoot(), 'resource');
    const intensifyEnv = buildIntensifyDataEnvironment(resourceDataRoot);
    const strengthenExists = fs.existsSync(intensifyEnv.AUTOWSGR_STRENGTHEN_DATA);
    ctx.sendToRenderer('backend-log', `[GUI] 强化数据: ${intensifyEnv.AUTOWSGR_STRENGTHEN_DATA}${strengthenExists ? '' : '（缺失）'}`);
    ctx.sendToRenderer('backend-log', `[GUI] 舰船库: ${intensifyEnv.AUTOWSGR_SHIP_LIBRARY}`);
    if (!strengthenExists) {
        console.warn(`[Backend] 未找到强化数据文件: ${intensifyEnv.AUTOWSGR_STRENGTHEN_DATA}`);
    }
    const bootstrap = (0, BackendRuntimeContract_1.buildBackendBootstrap)(environment, ctx.BACKEND_PORT);
    if (localBackendRepo) {
        console.log(`[Backend] 使用本地后端仓库: ${localBackendRepo}`);
        ctx.sendToRenderer('backend-log', `[GUI] 使用本地后端仓库: ${localBackendRepo}`);
    }
    else {
        ctx.sendToRenderer('backend-log', '[GUI] 未启用本地后端仓库覆盖，使用 site-packages 中的 autowsgr');
    }
    ctx.sendToRenderer('backend-log', `[GUI] CUDA 路径: ${configuredCudaRoot ?? '系统自动检测'}`);
    ctx.sendToRenderer('backend-log', `[GUI] 保存识别异常截图: ${saveBackendScreenshots ? '开启' : '关闭'}`);
    const adbDir = path.join(ctx.appRoot(), 'adb');
    const cudaEnv = (0, pythonEnv_1.buildBackendRuntimeEnvironment)(environment, configuredCudaRoot);
    const envPath = cudaEnv.PATH || '';
    const pathWithAdb = fs.existsSync(adbDir)
        ? `${adbDir}${path.delimiter}${envPath}`
        : envPath;
    const runtimeEnv = {
        ...cudaEnv,
        ...intensifyEnv,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PATH: pathWithAdb,
    };
    const resolvedOcrGpuMode = await resolveBackendOcrGpuMode(pythonCmd, requestedOcrGpuMode, cwd, runtimeEnv);
    ctx.sendToRenderer('backend-log', `[GUI] OCR 加速模式: ${requestedOcrGpuMode}${requestedOcrGpuMode === 'auto'
        ? ` -> ${resolvedOcrGpuMode}`
        : ''}`);
    const backendEnv = (0, BackendRuntimeContract_1.applyBackendRuntimeSettings)(runtimeEnv, {
        ocrGpuMode: resolvedOcrGpuMode,
        saveImages: saveBackendScreenshots,
    });
    await verifyBackendRuntimeContract(pythonCmd, environment, cwd, backendEnv);
    ctx.sendToRenderer('backend-log', '[GUI] 后端运行契约验证通过');
    // MuMu 多开实例不会自动被 ADB 发现，因此启动前主动连接。
    try {
        const cfgPath = path.join(ctx.userDataRoot(), 'usersettings.yaml');
        if (fs.existsSync(cfgPath)) {
            const cfgText = fs.readFileSync(cfgPath, 'utf-8');
            const serialMatch = cfgText.match(/serial:\s*(\S+)/);
            if (serialMatch) {
                const serial = serialMatch[1];
                const adbExe = path.join(adbDir, 'adb.exe');
                const adbCmd = fs.existsSync(adbExe) ? adbExe : 'adb';
                (0, child_process_1.execSync)(`"${adbCmd}" connect ${serial}`, {
                    windowsHide: true,
                    timeout: 5000,
                    stdio: 'pipe',
                });
                console.log(`[Backend] ADB connect ${serial} 完成`);
            }
        }
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.warn(`[Backend] ADB connect 失败 (非致命): ${message}`);
    }
    const spawnedProcess = (0, child_process_1.spawn)(pythonCmd, ['-X', 'utf8', '-c', bootstrap], {
        cwd,
        windowsHide: true,
        stdio: 'pipe',
        env: backendEnv,
    });
    backendProcess = spawnedProcess;
    const CYAN = '\x1b[36m';
    const RED = '\x1b[31m';
    const YELLOW = '\x1b[33m';
    const GREEN = '\x1b[32m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';
    const colorLine = (line) => {
        if (/\bERROR\b/i.test(line))
            return `${RED}${line}${RESET}`;
        if (/\bWARNING\b/i.test(line))
            return `${YELLOW}${line}${RESET}`;
        if (/\bINFO\b/i.test(line))
            return `${GREEN}${line}${RESET}`;
        if (/\bDEBUG\b/i.test(line))
            return `${DIM}${line}${RESET}`;
        return `${CYAN}${line}${RESET}`;
    };
    const LOGURU_LINE_RE = /^\d{2}:\d{2}:\d{2}\.\d{3}\s*\|/;
    let skipMultiline = false;
    const handleOutput = (data) => {
        for (const line of data.toString('utf-8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            console.log(`${CYAN}[Backend]${RESET} ${colorLine(trimmed)}`);
            const isNewEntry = LOGURU_LINE_RE.test(trimmed);
            if (isNewEntry) {
                skipMultiline = /\bDEBUG\b/i.test(trimmed);
            }
            if (isBackendTracebackBoundary(trimmed)) {
                skipMultiline = true;
                continue;
            }
            if (skipMultiline)
                continue;
            if (/"(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+\//.test(trimmed)) {
                continue;
            }
            ctx.sendToRenderer('backend-log', trimmed);
        }
    };
    spawnedProcess.stdout?.on('data', handleOutput);
    spawnedProcess.stderr?.on('data', handleOutput);
    spawnedProcess.on('error', (error) => {
        console.error('[Backend] 启动失败:', error.message);
        if (backendProcess === spawnedProcess)
            backendProcess = null;
    });
    spawnedProcess.on('close', (code) => {
        console.log(`[Backend] 进程退出, code=${code}`);
        if (backendProcess === spawnedProcess)
            backendProcess = null;
    });
}
/** 停止后端任务和完整进程树，并等待操作系统确认进程退出。 */
async function stopBackend() {
    if (backendStopPromise)
        return backendStopPromise;
    const activeProcess = backendProcess;
    if (!activeProcess)
        return;
    if (activeProcess.exitCode !== null
        || activeProcess.signalCode !== null) {
        if (backendProcess === activeProcess)
            backendProcess = null;
        return;
    }
    backendStopPromise = (0, BackendShutdownService_1.shutdownBackendProcess)(activeProcess, { backendPort: ctx.BACKEND_PORT }).finally(() => {
        if (backendProcess === activeProcess
            && (activeProcess.exitCode !== null
                || activeProcess.signalCode !== null)) {
            backendProcess = null;
        }
        backendStopPromise = null;
    });
    return backendStopPromise;
}
