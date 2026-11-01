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
exports.installPortablePython = installPortablePython;
exports.checkForUpdates = checkForUpdates;
exports.buildDependencyInstallPlan = buildDependencyInstallPlan;
exports.installDependencies = installDependencies;
exports.installDependenciesFromDirectory = installDependenciesFromDirectory;
exports.cancelDependencies = cancelDependencies;
/**
 * Python 安装、依赖安装与更新操作。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const context_1 = require("./context");
const finder_1 = require("./finder");
const utils_1 = require("./utils");
const envCheck_1 = require("./envCheck");
const environment_1 = require("./environment");
const dependencies_1 = require("./dependencies");
const backendRequirement_1 = require("./backendRequirement");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// 6.7/R20：当前正在运行的 pip 子进程；取消时按进程树终止。
let activePip = null;
let activePipCanceled = false;
// 便携版 Python 安装
/** 安装或初始化便携版 Python。 */
async function installPortablePython() {
    const ctx = (0, context_1.getCtx)();
    (0, context_1.setCachedPythonCmd)(undefined); // 安装后需重新检测
    const pythonDir = path.join(ctx.appRoot(), 'python');
    const pythonExe = path.join(pythonDir, 'python.exe');
    if (!fs.existsSync(pythonExe)) {
        // 打包产物缺失时尝试在线下载。
        ctx.sendProgress('WARNING 未找到内置 Python，尝试在线下载…');
        return downloadPortablePython();
    }
    // 确保 ._pth 配置正确。
    (0, utils_1.ensurePthFile)();
    // 检查 pip 是否可用。
    try {
        await execAsync(`"${pythonExe}" -m pip --version`, { windowsHide: true, timeout: 15000 });
        const certFile = await (0, utils_1.ensureSslCertForPython)(pythonExe);
        if (certFile)
            ctx.sendProgress(`TLS 证书已就绪: ${certFile}`);
        ctx.sendProgress('内置 Python + pip 就绪 ✓');
        return { success: true };
    }
    catch { /* pip 不可用时继续安装。 */ }
    // pip 缺失时执行安装。
    ctx.sendProgress('正在安装 pip…');
    const getPipPath = path.join(ctx.getTempDir(), 'get-pip.py');
    try {
        await execAsync(`curl -sSL -o "${getPipPath}" "https://bootstrap.pypa.io/get-pip.py"`, { windowsHide: true, timeout: 60000 });
        await execAsync(`"${pythonExe}" "${getPipPath}"`, { windowsHide: true, timeout: 120000 });
        try {
            fs.unlinkSync(getPipPath);
        }
        catch { /* 忽略清理失败。 */ }
        const certFile = await (0, utils_1.ensureSslCertForPython)(pythonExe);
        if (certFile)
            ctx.sendProgress(`TLS 证书已就绪: ${certFile}`);
        else
            ctx.sendProgress('WARNING 未检测到 TLS 根证书，后续联网操作可能失败');
        ctx.sendProgress('pip 安装完成 ✓');
        return { success: true };
    }
    catch {
        ctx.sendProgress('ERROR pip 安装失败');
        return { success: false };
    }
}
/** 在内置 Python 缺失时在线下载便携版。 */
async function downloadPortablePython() {
    const ctx = (0, context_1.getCtx)();
    const pythonDir = path.join(ctx.appRoot(), 'python');
    const pythonExe = path.join(pythonDir, 'python.exe');
    const version = '3.12.8';
    const zipUrl = `https://www.python.org/ftp/python/${version}/python-${version}-embed-amd64.zip`;
    const zipPath = path.join(ctx.getTempDir(), 'python-embed.zip');
    ctx.sendProgress(`正在下载 Python ${version} 便携版…`);
    try {
        await execAsync(`curl -L -o "${zipPath}" "${zipUrl}"`, { windowsHide: true, timeout: 180000 });
    }
    catch {
        ctx.sendProgress('ERROR Python 下载失败，请检查网络');
        return { success: false };
    }
    ctx.sendProgress('正在解压 Python…');
    try {
        if (!fs.existsSync(pythonDir))
            fs.mkdirSync(pythonDir, { recursive: true });
        await execAsync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${pythonDir}' -Force"`, { windowsHide: true, timeout: 30000 });
    }
    catch {
        ctx.sendProgress('ERROR Python 解压失败');
        return { success: false };
    }
    (0, utils_1.ensurePthFile)();
    // 安装 pip。
    ctx.sendProgress('正在安装 pip…');
    const getPipPath = path.join(ctx.getTempDir(), 'get-pip.py');
    try {
        await execAsync(`curl -sSL -o "${getPipPath}" "https://bootstrap.pypa.io/get-pip.py"`, { windowsHide: true, timeout: 60000 });
        await execAsync(`"${pythonExe}" "${getPipPath}"`, { windowsHide: true, timeout: 120000 });
        const certFile = await (0, utils_1.ensureSslCertForPython)(pythonExe);
        if (certFile)
            ctx.sendProgress(`TLS 证书已就绪: ${certFile}`);
        else
            ctx.sendProgress('WARNING 未检测到 TLS 根证书，后续联网操作可能失败');
    }
    catch {
        ctx.sendProgress('ERROR pip 安装失败');
        return { success: false };
    }
    try {
        fs.unlinkSync(zipPath);
    }
    catch { /* 忽略清理失败。 */ }
    try {
        fs.unlinkSync(getPipPath);
    }
    catch { /* 忽略清理失败。 */ }
    ctx.sendProgress(`Python ${version} 便携版安装完成 ✓`);
    return { success: true };
}
/** 比较本地与 PyPI 的 autowsgr 版本。 */
async function checkForUpdates() {
    const result = {
        gitAvailable: false,
        hasUpdates: false,
        currentBranch: '',
        behindCount: 0,
        remoteUrl: 'https://pypi.org/project/autowsgr/',
    };
    const pythonCmd = await (0, finder_1.findPython)();
    if (!pythonCmd)
        return result;
    result.gitAvailable = true; // 复用字段表示可检查更新。
    try {
        // 获取已安装版本。
        const { stdout: localVer } = await execAsync(`"${pythonCmd}" -c "import autowsgr; print(autowsgr.__version__)"`, { windowsHide: true, env: (0, utils_1.pipEnv)() });
        result.currentBranch = localVer.trim(); // 复用字段保存当前版本。
        // 获取 PyPI 最新版本。
        const { stdout: pipOut } = await execAsync(`"${pythonCmd}" -m pip index versions autowsgr`, { windowsHide: true, timeout: 15000, env: (0, utils_1.pipEnv)() });
        const m = pipOut.match(/LATEST:\s*(\S+)/i) || pipOut.match(/versions:\s*(\S+)/i);
        if (m) {
            const latestVer = m[1].replace(/,$/, '');
            result.hasUpdates = latestVer !== result.currentBranch;
        }
    }
    catch { /* 检查失败时返回默认结果。 */ }
    return result;
}
/** 生成与运行环境一致的 pip 参数，供回归测试直接验证。 */
function buildDependencyInstallPlan(environment, backendRequirement) {
    const targetArgs = (0, environment_1.installTargetArgs)(environment);
    return {
        buildArgs: [
            '-m', 'pip', 'install',
            '--upgrade',
            ...targetArgs,
            'setuptools',
            'hatchling',
            'hatch-vcs',
        ],
        toolArgs: [
            '-m', 'pip', 'install',
            '--upgrade',
            ...targetArgs,
            ...dependencies_1.SHIP_LIBRARY_REQUIREMENTS,
            ...dependencies_1.BACKEND_RUNTIME_REQUIREMENTS,
        ],
        backendArgs: [
            '-m', 'pip', 'install',
            '--upgrade',
            '--no-build-isolation',
            ...targetArgs,
            backendRequirement,
        ],
    };
}
/** 解析 pip 输出中的百分比，用于进度条。 */
function parsePipPercent(line) {
    const match = String(line).match(/(\d{1,3})\s*%/);
    if (!match)
        return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}
/** 把 --no-index/--find-links 插到 pip install 的参数里。 */
function withOfflineArgs(args, offlineDir) {
    if (!offlineDir)
        return args;
    const insertAt = args[0] === '-m' && args[1] === 'pip' && args[2] === 'install' ? 3 : 1;
    return [...args.slice(0, insertAt), '--no-index', '--find-links', offlineDir, ...args.slice(insertAt)];
}
/** 运行一个 pip 阶段：流式转发日志/进度，并支持取消。 */
function runPip(pythonCmd, args, cwd, environment, stage, index, total) {
    return new Promise((resolve) => {
        const ctx = (0, context_1.getCtx)();
        activePipCanceled = false;
        ctx.sendInstallProgress?.({
            stage,
            index,
            total,
            percent: 0,
            message: `开始${stage}…`,
        });
        const proc = (0, child_process_1.spawn)(pythonCmd, args, {
            cwd,
            windowsHide: true,
            stdio: 'pipe',
            env: (0, environment_1.buildPythonProcessEnv)(environment),
        });
        activePip = proc;
        let output = '';
        let lastPercent = null;
        const emit = (data) => {
            const text = data.toString();
            output += text;
            for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                ctx.sendProgress?.(trimmed);
                const percent = parsePipPercent(trimmed);
                if (percent !== null)
                    lastPercent = percent;
                ctx.sendInstallProgress?.({
                    stage,
                    index,
                    total,
                    percent: lastPercent,
                    message: trimmed,
                });
            }
        };
        proc.stdout?.on('data', emit);
        proc.stderr?.on('data', emit);
        proc.on('close', (code) => {
            const canceled = activePipCanceled;
            activePip = null;
            activePipCanceled = false;
            resolve({ code: code ?? 1, output, canceled });
        });
        proc.on('error', (err) => {
            const canceled = activePipCanceled;
            activePip = null;
            activePipCanceled = false;
            resolve({ code: 1, output: `${output}${err.message}`, canceled });
        });
    });
}
/** 终止当前 pip 进程树；返回是否有可取消的进程。 */
function cancelDependencies() {
    if (!activePip)
        return false;
    activePipCanceled = true;
    const pid = activePip.pid;
    try {
        if (process.platform === 'win32' && pid) {
            (0, child_process_1.spawn)('taskkill', ['/pid', String(pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore',
            });
        }
        else {
            activePip.kill('SIGTERM');
        }
        return true;
    }
    catch {
        return false;
    }
}
/** 自动安装依赖；安装目标由统一 Python 环境描述决定。 */
async function installDependencies(pythonCmd, options = {}) {
    const ctx = (0, context_1.getCtx)();
    let environment;
    try {
        environment = (0, environment_1.resolvePythonEnvironment)(pythonCmd);
    }
    catch (error) {
        return {
            success: false,
            output: error instanceof Error ? error.message : String(error),
        };
    }
    const backendRequirement = environment.backendRoot
        ?? (0, backendRequirement_1.buildManagedAutowsgrRequirement)((0, backendRequirement_1.resolveBackendDistribution)(ctx.allowTestUpdates()));
    const installPlan = buildDependencyInstallPlan(environment, backendRequirement);
    const offlineDir = options.offlineDir ? path.resolve(String(options.offlineDir)) : null;
    if (offlineDir) {
        try {
            if (!fs.statSync(offlineDir).isDirectory()) {
                return { success: false, output: `离线依赖目录不是文件夹: ${offlineDir}` };
            }
        }
        catch {
            return { success: false, output: `离线依赖目录不可用: ${offlineDir}` };
        }
    }
    // 安装后使环境检测缓存失效，但保留后端更新状态。
    (0, envCheck_1.invalidateEnvMarker)();
    const certFile = await (0, utils_1.ensureSslCertForPython)(pythonCmd);
    if (certFile)
        ctx.sendProgress(`TLS 证书已就绪: ${certFile}`);
    else
        ctx.sendProgress('WARNING 未检测到 TLS 根证书，后续联网操作可能失败');
    // 确保 pip 可用。
    if (!(await (0, utils_1.ensurePip)(pythonCmd))) {
        return { success: false, output: 'pip 安装失败，无法安装依赖' };
    }
    const cwd = ctx.appRoot();
    if (environment.installTarget
        && !fs.existsSync(environment.installTarget)) {
        fs.mkdirSync(environment.installTarget, { recursive: true });
    }
    ctx.sendProgress('正在安装后端构建依赖…');
    const buildDeps = await runPip(pythonCmd, withOfflineArgs(installPlan.buildArgs, offlineDir), cwd, environment, '后端构建依赖', 1, 3);
    if (buildDeps.canceled) {
        return { success: false, canceled: true, output: buildDeps.output };
    }
    if (buildDeps.code !== 0) {
        ctx.sendProgress('ERROR 后端构建依赖安装失败');
        return { success: false, output: buildDeps.output };
    }
    ctx.sendProgress('正在安装工具与后端运行依赖…');
    const toolDeps = await runPip(pythonCmd, withOfflineArgs(installPlan.toolArgs, offlineDir), cwd, environment, '工具与运行依赖', 2, 3);
    if (toolDeps.canceled) {
        return { success: false, canceled: true, output: toolDeps.output };
    }
    if (toolDeps.code !== 0) {
        ctx.sendProgress('ERROR 舰船资料库更新依赖安装失败');
        return { success: false, output: toolDeps.output };
    }
    const installLocation = environment.installTarget
        ? 'GUI 项目目录'
        : '当前 Python 环境';
    ctx.sendProgress(`正在安装后端依赖到${installLocation}…`);
    const install = await runPip(pythonCmd, withOfflineArgs(installPlan.backendArgs, offlineDir), cwd, environment, '后端依赖', 3, 3);
    if (install.code === 0)
        ctx.sendProgress('后端依赖安装完成 ✓');
    else
        ctx.sendProgress('ERROR 依赖安装失败');
    return {
        success: install.code === 0,
        canceled: install.canceled === true,
        output: install.output,
    };
}
/** 6.7：从包含 wheel 的离线目录安装（--no-index --find-links）。 */
async function installDependenciesFromDirectory(pythonCmd, directory) {
    return installDependencies(pythonCmd, { offlineDir: directory });
}
