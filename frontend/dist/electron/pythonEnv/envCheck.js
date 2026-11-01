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
exports.ENV_READY_MARKER = void 0;
exports.invalidateEnvMarker = invalidateEnvMarker;
exports.buildAutoUpdateDeps = buildAutoUpdateDeps;
exports.checkEnvironment = checkEnvironment;
/**
 * 检查 VC++、Python、依赖包和环境就绪标记。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const context_1 = require("./context");
const finder_1 = require("./finder");
const utils_1 = require("./utils");
const updater_1 = require("./updater");
const environment_1 = require("./environment");
const backendContractProbe_1 = require("./backendContractProbe");
const dependencies_1 = require("./dependencies");
const backendRequirement_1 = require("./backendRequirement");
const AtomicFileStore_1 = require("../services/AtomicFileStore");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const envMarkerFiles = new AtomicFileStore_1.AtomicFileStore();
// VC++ Redistributable
/** 检查并安装 VC++ Redistributable。 */
async function ensureVCRedist() {
    const ctx = (0, context_1.getCtx)();
    // system32 中存在 vcruntime140.dll 即视为已安装。
    const systemRoot = process.env.SystemRoot
        || process.env.SYSTEMROOT
        || process.env.WINDIR;
    if (systemRoot
        && fs.existsSync(path.join(systemRoot, 'System32', 'vcruntime140.dll'))) {
        return;
    }
    ctx.sendProgress('Microsoft Visual C++ Redistributable is not installed, this may lead to the DLL load failure.');
    const redistExe = path.join(ctx.appRoot(), 'redist', 'vc_redist.x64.exe');
    if (!fs.existsSync(redistExe)) {
        ctx.sendProgress(`It can be downloaded at https://aka.ms/vs/17/release/vc_redist.x64.exe`);
        return;
    }
    ctx.sendProgress('正在安装 Visual C++ Redistributable…');
    try {
        await execAsync(`"${redistExe}" /install /quiet /norestart`, { windowsHide: true, timeout: 120000 });
        ctx.sendProgress('Visual C++ Redistributable 安装完成 ✓');
    }
    catch {
        ctx.sendProgress('WARNING VC++ Redistributable 安装失败，请手动运行 redist\\vc_redist.x64.exe');
    }
}
// 环境就绪标记 (.env_ready)
/** 返回环境就绪标记路径。 */
const ENV_READY_MARKER = () => path.join((0, context_1.getCtx)().appRoot(), '.env_ready');
exports.ENV_READY_MARKER = ENV_READY_MARKER;
const ENVIRONMENT_MARKER_KEYS = [
    'pythonCmd',
    'pythonVersion',
    'autowsgrVersion',
    'environmentIdentity',
    'backendRequirement',
];
/** 使环境检测缓存失效，同时保留同文件中的后端更新状态。 */
function invalidateEnvMarker() {
    const target = (0, exports.ENV_READY_MARKER)();
    try {
        const value = JSON.parse(fs.readFileSync(target, 'utf-8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            fs.rmSync(target, { force: true });
            return;
        }
        const document = value;
        for (const key of ENVIRONMENT_MARKER_KEYS)
            delete document[key];
        if (Object.keys(document).length === 0) {
            fs.rmSync(target, { force: true });
            return;
        }
        envMarkerFiles.write(target, `${JSON.stringify(document, null, 2)}\n`);
    }
    catch {
        try {
            fs.rmSync(target, { force: true });
        }
        catch {
            // 标记失效失败不阻断环境修复。
        }
    }
}
/** 返回当前 GUI 通道固定的 managed 后端来源。 */
function managedBackendRequirement() {
    return (0, backendRequirement_1.buildManagedAutowsgrRequirement)((0, backendRequirement_1.resolveBackendDistribution)((0, context_1.getCtx)().allowTestUpdates()));
}
/** 读取环境标记；当前模式、解释器或仓库变化时返回 null。 */
function readEnvMarker() {
    const ctx = (0, context_1.getCtx)();
    try {
        const data = JSON.parse(fs.readFileSync((0, exports.ENV_READY_MARKER)(), 'utf-8'));
        if (data
            && data.pythonCmd
            && data.autowsgrVersion
            && data.environmentIdentity) {
            // 标记中的 Python 路径必须仍然存在。
            if (!fs.existsSync(data.pythonCmd))
                return null;
            // Python 路径变化后旧标记失效。
            const configured = ctx.getConfiguredPythonPath();
            if (configured && configured !== data.pythonCmd)
                return null;
            const environment = (0, environment_1.resolvePythonEnvironment)(data.pythonCmd);
            if (environment.identity !== data.environmentIdentity)
                return null;
            if (environment.startupMode === 'managed'
                && data.backendRequirement !== managedBackendRequirement()) {
                return null;
            }
            return { ...data, environment };
        }
    }
    catch { /* 标记缺失或损坏时重新检查。 */ }
    return null;
}
/** 写入环境就绪标记。 */
function writeEnvMarker(environment, pythonVersion, autowsgrVersion) {
    try {
        let existing = {};
        try {
            const value = JSON.parse(fs.readFileSync((0, exports.ENV_READY_MARKER)(), 'utf-8'));
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                existing = value;
            }
        }
        catch {
            // 首次写入或旧标记损坏时从空对象重建。
        }
        envMarkerFiles.write((0, exports.ENV_READY_MARKER)(), JSON.stringify({
            ...existing,
            pythonCmd: environment.pythonCmd,
            pythonVersion,
            autowsgrVersion,
            environmentIdentity: environment.identity,
            backendRequirement: environment.startupMode === 'managed'
                ? managedBackendRequirement()
                : null,
        }, null, 2));
    }
    catch { /* 标记写入失败不阻断启动。 */ }
}
// autowsgr 更新桥接
/** 构造 autoUpdateAutowsgr 的依赖对象。 */
function buildAutoUpdateDeps(sendProgress) {
    const ctx = (0, context_1.getCtx)();
    return {
        sendProgress: sendProgress ?? ctx.sendProgress,
        getTempDir: ctx.getTempDir,
        appRoot: ctx.appRoot,
        localSitePackages: utils_1.localSitePackages,
        pipEnv: utils_1.pipEnv,
        ensurePip: utils_1.ensurePip,
        backendRequirement: managedBackendRequirement,
    };
}
async function updateManagedBackend(pythonCmd, forceInstall = false) {
    const ctx = (0, context_1.getCtx)();
    await ctx.beforeManagedBackendInstall?.();
    try {
        const updatedVer = await (0, updater_1.autoUpdateAutowsgr)(pythonCmd, buildAutoUpdateDeps(), forceInstall);
        if (forceInstall && updatedVer) {
            ctx.onManagedBackendInstalled?.();
        }
        return updatedVer;
    }
    finally {
        ctx.afterManagedBackendInstall?.();
    }
}
function shouldAutoUpdate(environment) {
    const ctx = (0, context_1.getCtx)();
    const updateMode = ctx.allowTestUpdates()
        ? ctx.getBackendUpdateMode()
        : ctx.getUpdateMode();
    return environment.startupMode === 'managed'
        && updateMode !== 'manual';
}
/** 发行包在安装器清除环境标记后必须重新安装一次指定后端。 */
function shouldForceManagedBackendInstall(environment) {
    return (environment.startupMode === 'managed'
        && (0, backendRequirement_1.resolveBackendDistribution)((0, context_1.getCtx)().allowTestUpdates()).forceUpdateOnInstall);
}
function autoUpdateSkipMessage(environment) {
    return environment.startupMode === 'external'
        ? '本地后端调试模式：跳过 autowsgr 自动更新检查'
        : '手动后端更新模式：跳过 autowsgr 自动更新检查';
}
/** 检查核心依赖及 scipy._lib 是否可导入。 */
async function probeCoreDependencies(environment) {
    const ctx = (0, context_1.getCtx)();
    const { backendRoot, pythonCmd, useLocalSite } = environment;
    const expectedRoot = backendRoot || environment.localSite;
    const pythonPath = (value) => value
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'");
    const checkScript = path.join(ctx.getTempDir(), 'autowsgr_depcheck.py');
    const scriptLines = [
        'import json, sys, site',
        ...(useLocalSite
            ? [
                `sp = '${pythonPath((0, utils_1.localSitePackages)())}'`,
                'sys.path.insert(0, sp)',
                'site.addsitedir(sp)',
            ]
            : []),
        ...(backendRoot
            ? [
                `repo = '${pythonPath(backendRoot)}'`,
                'sys.path.insert(0, repo)',
            ]
            : []),
        'r = {}',
        `checks = ${JSON.stringify(dependencies_1.PYTHON_DEPENDENCY_SPECS.map(dependency => [dependency.key, dependency.importName]))}`,
        'for key, mod in checks:',
        '    try:',
        '        __import__(mod); r[key] = True',
        '    except Exception:',
        '        r[key] = False',
        'try:',
        '    import autowsgr',
        '    r["autowsgr"] = getattr(autowsgr, "__version__", "source")',
        '    r["autowsgr_path"] = autowsgr.__file__',
        'except Exception:',
        '    r["autowsgr"] = None',
        '    r["autowsgr_path"] = None',
        ...(0, backendContractProbe_1.buildBackendRuntimeContractProbeLines)(),
        'try:',
        '    _verify_gui_runtime_contract()',
        '    r["backend_runtime_contract"] = True',
        'except Exception:',
        '    r["backend_runtime_contract"] = False',
        'print(json.dumps(r))',
    ];
    fs.writeFileSync(checkScript, scriptLines.join('\n'), 'utf-8');
    try {
        const { stdout: depOut } = await execAsync(`"${pythonCmd}" "${checkScript}"`, {
            windowsHide: true,
            timeout: 30000,
            env: (0, environment_1.buildPythonProcessEnv)(environment),
        });
        const depResult = JSON.parse(depOut.trim());
        const autowsgrPath = typeof depResult.autowsgr_path === 'string'
            ? path.resolve(depResult.autowsgr_path)
            : '';
        const relativePath = autowsgrPath
            ? path.relative(path.resolve(expectedRoot), autowsgrPath)
            : '';
        const usesExpectedAutowsgr = autowsgrPath !== ''
            && relativePath !== '..'
            && !relativePath.startsWith(`..${path.sep}`)
            && !path.isAbsolute(relativePath);
        if (depResult.autowsgr != null && !usesExpectedAutowsgr) {
            ctx.sendProgress(`WARNING 忽略来源不正确的 autowsgr: ${autowsgrPath}`);
        }
        return {
            uvicorn: Boolean(depResult.uvicorn),
            fastapi: Boolean(depResult.fastapi),
            scipy: Boolean(depResult.scipy),
            requests: Boolean(depResult.requests),
            beautifulSoup: Boolean(depResult.beautifulSoup),
            maafw: Boolean(depResult.maafw),
            autowsgr: depResult.autowsgr == null || !usesExpectedAutowsgr
                ? null
                : String(depResult.autowsgr),
            backendRuntimeContract: (usesExpectedAutowsgr
                && depResult.backend_runtime_contract === true),
        };
    }
    catch {
        return null;
    }
    finally {
        try {
            fs.unlinkSync(checkScript);
        }
        catch { /* 忽略清理失败。 */ }
    }
}
// 环境检查主流程
function environmentSourceMessage(environment) {
    return `运行环境来源: 后端 ${environment.startupMode}, Python ${environment.pythonSource} (${environment.pythonCmd})`;
}
/** 检查 Python 环境和所需包。 */
async function checkEnvironment() {
    const ctx = (0, context_1.getCtx)();
    ctx.sendProgress('正在检查运行环境…');
    await ensureVCRedist();
    // 有效标记可跳过重量级依赖检查。
    const marker = readEnvMarker();
    if (marker) {
        (0, context_1.setCachedPythonCmd)(marker.pythonCmd);
        ctx.sendProgress(environmentSourceMessage(marker.environment));
        const certFile = await (0, utils_1.ensureSslCertForPython)(marker.pythonCmd);
        if (certFile)
            ctx.sendProgress(`TLS 证书已就绪: ${certFile}`);
        else
            ctx.sendProgress('WARNING 未检测到 TLS 根证书，后续联网操作可能失败');
        const markerProbe = await probeCoreDependencies(marker.environment);
        const markerBrokenDeps = [];
        if (!markerProbe) {
            markerBrokenDeps.push('dep-check');
        }
        else {
            for (const dependency of dependencies_1.PYTHON_DEPENDENCY_SPECS) {
                if (!markerProbe[dependency.key]) {
                    markerBrokenDeps.push(dependency.packageName);
                }
            }
            if (markerProbe.autowsgr == null)
                markerBrokenDeps.push('autowsgr');
            if (!markerProbe.backendRuntimeContract) {
                markerBrokenDeps.push('autowsgr-runtime-contract');
            }
        }
        if (markerBrokenDeps.length === 0) {
            // 自动模式下每次启动检查 autowsgr 更新。
            const markerAutowsgrVersion = markerProbe?.autowsgr ?? marker.autowsgrVersion;
            let finalVer = markerAutowsgrVersion;
            if (shouldAutoUpdate(marker.environment)) {
                const updatedVer = await updateManagedBackend(marker.pythonCmd);
                finalVer = updatedVer ?? markerAutowsgrVersion;
                if (updatedVer && updatedVer !== markerAutowsgrVersion) {
                    writeEnvMarker(marker.environment, marker.pythonVersion, finalVer);
                }
            }
            else {
                ctx.sendProgress(autoUpdateSkipMessage(marker.environment));
            }
            ctx.sendProgress(`环境就绪 (${marker.pythonVersion}, autowsgr ${finalVer}) ✓`);
            return {
                pythonCmd: marker.pythonCmd,
                pythonVersion: marker.pythonVersion,
                missingPackages: [],
                allReady: true,
            };
        }
        ctx.sendProgress(`检测到依赖异常 (${markerBrokenDeps.join(', ')})，重新执行完整检查…`);
        invalidateEnvMarker();
    }
    // 标记无效时执行完整检查。
    ctx.sendProgress('正在检查 Python 环境…');
    const pythonCmd = await (0, finder_1.findPython)();
    if (!pythonCmd) {
        ctx.sendProgress('WARNING 未找到兼容的 Python（需要 3.12 或 3.13）');
        return { pythonCmd: null, pythonVersion: null, missingPackages: [], allReady: false };
    }
    let environment;
    try {
        environment = (0, environment_1.resolvePythonEnvironment)(pythonCmd);
    }
    catch (error) {
        ctx.sendProgress(`ERROR ${error instanceof Error ? error.message : String(error)}`);
        return {
            pythonCmd,
            pythonVersion: null,
            missingPackages: ['autowsgr'],
            allReady: false,
        };
    }
    ctx.sendProgress(environmentSourceMessage(environment));
    if (environment.useLocalSite)
        (0, utils_1.ensurePthFile)();
    const certFile = await (0, utils_1.ensureSslCertForPython)(pythonCmd);
    if (certFile)
        ctx.sendProgress(`TLS 证书已就绪: ${certFile}`);
    else
        ctx.sendProgress('WARNING 未检测到 TLS 根证书，后续联网操作可能失败');
    let pythonVersion = null;
    try {
        const { stdout } = await execAsync(`"${pythonCmd}" --version`, { windowsHide: true });
        pythonVersion = stdout.trim();
        ctx.sendProgress(`${pythonVersion} ✓`);
    }
    catch { /* 版本读取失败时保留空值。 */ }
    ctx.sendProgress('正在检查依赖包…');
    const missingPackages = [];
    let autowsgrVersion = '';
    try {
        const depResult = await probeCoreDependencies(environment);
        if (!depResult) {
            throw new Error('依赖探测失败');
        }
        for (const dependency of dependencies_1.PYTHON_DEPENDENCY_SPECS) {
            if (depResult[dependency.key]) {
                ctx.sendProgress(`  ${dependency.packageName} \u2713`);
            }
            else {
                missingPackages.push(dependency.packageName);
                ctx.sendProgress(`  ${dependency.packageName} \u2717`);
            }
        }
        if (depResult.autowsgr != null) {
            const ver = String(depResult.autowsgr);
            ctx.sendProgress(`  autowsgr ${ver} \u2713`);
            autowsgrVersion = ver;
        }
        else {
            missingPackages.push('autowsgr');
            ctx.sendProgress(`  autowsgr \u2717`);
        }
        if (depResult.backendRuntimeContract) {
            ctx.sendProgress('  AutoWSGR GUI 运行契约 ✓');
        }
        else {
            missingPackages.push('autowsgr-runtime-contract');
            ctx.sendProgress('  AutoWSGR GUI 运行契约 ✗  请更新后端版本');
        }
    }
    catch {
        missingPackages.push(...dependencies_1.PYTHON_DEPENDENCY_SPECS.map(dependency => dependency.packageName), 'autowsgr');
        ctx.sendProgress('  依赖检查失败');
    }
    const forceBackendInstall = shouldForceManagedBackendInstall(environment);
    const allReady = missingPackages.length === 0;
    if (!allReady && forceBackendInstall) {
        ctx.sendProgress('覆盖安装后正在增量更新后端及依赖…');
        const updatedVer = await updateManagedBackend(pythonCmd, true);
        if (updatedVer) {
            writeEnvMarker(environment, pythonVersion || '', updatedVer);
            ctx.sendProgress(`环境增量更新完成 (autowsgr ${updatedVer}) ✓`);
            return {
                pythonCmd,
                pythonVersion,
                missingPackages: [],
                allReady: true,
            };
        }
        ctx.sendProgress('WARNING 增量更新未完成，将尝试修复缺失依赖');
    }
    if (allReady) {
        ctx.sendProgress('依赖检查通过 ✓');
        // 检查 ADB 可用性。
        const adbDir = path.join(ctx.appRoot(), 'adb');
        const builtinAdb = path.join(adbDir, 'adb.exe');
        if (fs.existsSync(builtinAdb)) {
            ctx.sendProgress('ADB (内置) ✓');
        }
        else {
            ctx.sendProgress('ADB (内置) ✗  将使用模拟器自带 ADB');
        }
        // 自动模式下检查并更新 autowsgr。
        let finalVer = autowsgrVersion;
        if (shouldAutoUpdate(environment) || forceBackendInstall) {
            const updatedVer = await updateManagedBackend(pythonCmd, forceBackendInstall);
            finalVer = updatedVer || autowsgrVersion;
            if (forceBackendInstall && !updatedVer) {
                ctx.sendProgress('WARNING 当前通道后端强制更新未完成，下次启动将重试');
                return {
                    pythonCmd,
                    pythonVersion,
                    missingPackages: [],
                    allReady: true,
                };
            }
        }
        else {
            ctx.sendProgress(autoUpdateSkipMessage(environment));
        }
        writeEnvMarker(environment, pythonVersion || '', finalVer);
    }
    return {
        pythonCmd,
        pythonVersion,
        missingPackages,
        allReady,
    };
}
