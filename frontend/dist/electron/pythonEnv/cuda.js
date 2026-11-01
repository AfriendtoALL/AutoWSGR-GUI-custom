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
exports.readCudaVersionFile = readCudaVersionFile;
exports.resolveConfiguredCudaRoot = resolveConfiguredCudaRoot;
exports.buildCudaEnvironment = buildCudaEnvironment;
exports.buildBackendRuntimeEnvironment = buildBackendRuntimeEnvironment;
/**
 * 解析 CUDA 配置并构造 Python 子进程环境。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const environment_1 = require("./environment");
function isRecord(value) {
    return (typeof value === 'object'
        && value !== null
        && !Array.isArray(value));
}
function nestedVersion(root, key) {
    const section = root[key];
    if (!isRecord(section))
        return null;
    const version = section.version;
    return typeof version === 'string' && version.trim()
        ? version.trim()
        : null;
}
/** 读取 CUDA version.json；无效或缺失时由调用方执行目录名回退。 */
function readCudaVersionFile(cudaRoot) {
    try {
        const versionJson = path.join(cudaRoot, 'version.json');
        if (!fs.existsSync(versionJson))
            return null;
        const parsed = JSON.parse(fs.readFileSync(versionJson, 'utf-8').replace(/^\uFEFF/, ''));
        if (!isRecord(parsed))
            return null;
        return nestedVersion(parsed, 'cuda')
            ?? nestedVersion(parsed, 'cuda_cudart');
    }
    catch {
        return null;
    }
}
function normalizeCudaRoot(candidate) {
    const resolved = path.resolve(candidate.trim());
    if (isCudaRuntimeDirectory(resolved))
        return resolved;
    return path.basename(resolved).toLowerCase() === 'bin'
        ? path.dirname(resolved)
        : resolved;
}
function isCudaRuntimeDirectory(candidate) {
    try {
        const names = fs.readdirSync(candidate);
        return names.some(name => /^cudart64.*\.dll$/i.test(name))
            && names.some(name => /^cublas64.*\.dll$/i.test(name));
    }
    catch {
        return false;
    }
}
/** 校验用户配置并返回 CUDA Toolkit 根目录或运行库目录。 */
function resolveConfiguredCudaRoot(value) {
    if (typeof value !== 'string' || !value.trim())
        return null;
    const cudaRoot = normalizeCudaRoot(value);
    const binDir = path.join(cudaRoot, 'bin');
    const runtimeDir = isCudaRuntimeDirectory(cudaRoot)
        ? cudaRoot
        : isCudaRuntimeDirectory(binDir)
            ? binDir
            : null;
    if (!fs.existsSync(path.join(binDir, 'nvcc.exe')) && !runtimeDir) {
        return null;
    }
    return fs.existsSync(path.join(binDir, 'nvcc.exe'))
        ? cudaRoot
        : runtimeDir;
}
/** 在同一个 Python 基础环境上叠加 CUDA 运行变量。 */
function buildCudaEnvironment(baseEnv, configuredCudaRoot) {
    if (!configuredCudaRoot)
        return { ...baseEnv };
    const cudaRoot = normalizeCudaRoot(configuredCudaRoot);
    const isToolkit = fs.existsSync(path.join(cudaRoot, 'bin', 'nvcc.exe'));
    const cudaBin = isToolkit ? path.join(cudaRoot, 'bin') : cudaRoot;
    const existingPath = baseEnv.PATH || baseEnv.Path || '';
    const pathEntries = existingPath.split(path.delimiter).filter(Boolean);
    const withoutDuplicate = pathEntries.filter(entry => path.resolve(entry).toLowerCase()
        !== path.resolve(cudaBin).toLowerCase());
    const env = { ...baseEnv };
    for (const key of Object.keys(env)) {
        if (key.toLowerCase() === 'path')
            delete env[key];
    }
    if (isToolkit) {
        env.CUDA_PATH = cudaRoot;
        env.CUDA_HOME = cudaRoot;
    }
    env.PATH = [cudaBin, ...withoutDuplicate].join(path.delimiter);
    let version = readCudaVersionFile(cudaRoot);
    version ?? (version = path.basename(cudaRoot).match(/v(\d+(?:\.\d+)?)/i)?.[1]
        ?? null);
    const versionMatch = version?.match(/^(\d+)\.(\d+)/);
    if (isToolkit && versionMatch) {
        env[`CUDA_PATH_V${versionMatch[1]}_${versionMatch[2]}`] = cudaRoot;
    }
    return env;
}
/** 构造 CUDA 检测和后端启动共同使用的完整 Python 运行环境。 */
function buildBackendRuntimeEnvironment(environment, configuredCudaRoot, baseEnv = process.env) {
    return buildCudaEnvironment((0, environment_1.buildPythonProcessEnv)(environment, baseEnv), configuredCudaRoot);
}
