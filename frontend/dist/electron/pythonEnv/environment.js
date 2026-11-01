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
exports.resolveExternalBackendRoot = resolveExternalBackendRoot;
exports.resolvePythonEnvironment = resolvePythonEnvironment;
exports.backendShipNamesPath = backendShipNamesPath;
exports.buildPythonProcessEnv = buildPythonProcessEnv;
exports.installTargetArgs = installTargetArgs;
/**
 * 统一描述 Python 安装、检查和启动环境。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const context_1 = require("./context");
const utils_1 = require("./utils");
function normalizeIdentityPath(value) {
    if (!value)
        return null;
    const normalized = path.resolve(value);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function isSamePath(left, right) {
    return normalizeIdentityPath(left) === normalizeIdentityPath(right);
}
/** 解析 external 模式的仓库根目录；managed 模式返回 null。 */
function resolveExternalBackendRoot() {
    const ctx = (0, context_1.getCtx)();
    if (ctx.getBackendStartupMode() !== 'external')
        return null;
    const configured = process.env.AUTOWSGR_BACKEND_REPO?.trim()
        || ctx.getBackendRepoPath().trim();
    if (!configured) {
        throw new Error('external 模式未配置 AutoWSGR 本地仓库路径');
    }
    let root = path.resolve(configured);
    if (!fs.existsSync(root)) {
        throw new Error(`external 后端仓库路径不存在: ${root}`);
    }
    const isPackageDirectory = path.basename(root).toLowerCase() === 'autowsgr'
        && fs.existsSync(path.join(root, '__init__.py'))
        && fs.existsSync(path.join(root, 'server', 'main.py'));
    if (isPackageDirectory)
        root = path.dirname(root);
    if (!fs.existsSync(path.join(root, 'autowsgr', 'server', 'main.py'))) {
        throw new Error(`external 后端仓库无效，未找到 autowsgr/server/main.py: ${root}`);
    }
    return root;
}
/** 根据当前设置生成唯一的 Python 环境描述。 */
function resolvePythonEnvironment(pythonCmd) {
    const ctx = (0, context_1.getCtx)();
    const startupMode = ctx.getBackendStartupMode();
    const backendRoot = resolveExternalBackendRoot();
    const localSite = (0, utils_1.localSitePackages)();
    const useLocalSite = startupMode === 'managed' || (0, utils_1.isLocalPython)(pythonCmd);
    const installTarget = useLocalSite ? localSite : null;
    const configuredPython = ctx.getConfiguredPythonPath();
    const bundledPython = path.join(ctx.appRoot(), 'python', 'python.exe');
    const pythonSource = (configuredPython && isSamePath(pythonCmd, configuredPython))
        ? 'configured'
        : isSamePath(pythonCmd, bundledPython)
            ? 'bundled'
            : 'system';
    const identity = JSON.stringify({
        startupMode,
        pythonCmd: normalizeIdentityPath(pythonCmd),
        backendRoot: normalizeIdentityPath(backendRoot),
        installTarget: normalizeIdentityPath(installTarget),
    });
    return {
        startupMode,
        pythonSource,
        pythonCmd,
        backendRoot,
        localSite,
        useLocalSite,
        installTarget,
        identity,
    };
}
/** 返回当前 managed 或 external 后端实际使用的舰名库路径。 */
function backendShipNamesPath(pythonCmd) {
    const environment = resolvePythonEnvironment(pythonCmd);
    const backendRoot = environment.backendRoot ?? environment.localSite;
    return path.join(backendRoot, 'autowsgr', 'data', 'shipnames.yaml');
}
/** 构造子进程环境，并隔离外部解释器与 managed 包目录。 */
function buildPythonProcessEnv(environment, baseEnv = process.env) {
    const result = { ...baseEnv };
    if (environment.useLocalSite) {
        const existing = result.PYTHONPATH || '';
        const entries = existing.split(path.delimiter).filter(Boolean);
        if (!entries.some(entry => isSamePath(entry, environment.localSite))) {
            entries.unshift(environment.localSite);
        }
        result.PYTHONPATH = entries.join(path.delimiter);
        result.PYTHONUSERBASE = path.join((0, context_1.getCtx)().appRoot(), 'python');
        return result;
    }
    const entries = (result.PYTHONPATH || '')
        .split(path.delimiter)
        .filter(entry => entry && !isSamePath(entry, environment.localSite));
    if (entries.length > 0)
        result.PYTHONPATH = entries.join(path.delimiter);
    else
        delete result.PYTHONPATH;
    const managedUserBase = path.join((0, context_1.getCtx)().appRoot(), 'python');
    if (result.PYTHONUSERBASE
        && isSamePath(result.PYTHONUSERBASE, managedUserBase)) {
        delete result.PYTHONUSERBASE;
    }
    return result;
}
/** 返回 pip 安装目标参数；外部解释器使用自身环境时返回空数组。 */
function installTargetArgs(environment) {
    return environment.installTarget
        ? ['--target', environment.installTarget]
        : [];
}
