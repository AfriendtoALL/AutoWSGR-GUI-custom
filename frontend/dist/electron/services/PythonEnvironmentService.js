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
exports.PythonEnvironmentService = void 0;
/**
 * 校验 Python 并编排环境检查和依赖安装。
 */
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/** 统一 Python 校验、环境检查和安装入口。 */
class PythonEnvironmentService {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.installPromise = null;
    }
    /** 构造保持原文件检查、命令格式和超时的系统依赖。 */
    static createDependencies(dependencies) {
        return {
            ...dependencies,
            fileExists: filePath => fs.existsSync(filePath),
            readVersion: async (pythonPath) => {
                const { stdout } = await execAsync(`"${pythonPath}" --version`, {
                    windowsHide: true,
                    timeout: 10000,
                });
                return stdout.trim();
            },
        };
    }
    /** 校验指定解释器是否存在且版本兼容。 */
    async validate(pythonPath) {
        if (!pythonPath) {
            return {
                valid: false,
                version: null,
                error: '路径为空',
            };
        }
        if (!this.dependencies.fileExists(pythonPath)) {
            return {
                valid: false,
                version: null,
                error: '文件不存在',
            };
        }
        try {
            const version = await this.dependencies.readVersion(pythonPath);
            if (!this.dependencies.isAllowedVersion(version)) {
                return {
                    valid: false,
                    version,
                    error: `版本不兼容: ${version}（需要 3.12 或 3.13）`,
                };
            }
            return { valid: true, version };
        }
        catch (error) {
            return {
                valid: false,
                version: null,
                error: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    /** 执行现有 Python 环境检查流程。 */
    check() {
        return this.dependencies.checkEnvironment();
    }
    /** 6.7/R20：同一时间只允许一个安装 Promise；重复触发复用进行中的结果。 */
    runInstall(factory) {
        if (this.installPromise) {
            return this.installPromise;
        }
        this.installPromise = Promise.resolve().then(factory).finally(() => {
            this.installPromise = null;
        });
        return this.installPromise;
    }
    /** 查找 Python 后安装后端依赖。 */
    installDependencies() {
        return this.runInstall(async () => {
            try {
                const pythonPath = await this.dependencies.findPython();
                if (!pythonPath) {
                    return { success: false, output: '找不到 Python' };
                }
                await this.dependencies.beforeInstall?.();
                try {
                    const result = await this.dependencies.installDependencies(pythonPath);
                    if (result.success) {
                        this.dependencies.onDependenciesInstalled?.();
                    }
                    return result;
                }
                finally {
                    this.dependencies.afterInstall?.();
                }
            }
            catch (error) {
                return {
                    success: false,
                    output: error instanceof Error ? error.message : String(error),
                };
            }
        });
    }
    /** 6.7：从本地 wheel 目录离线安装。 */
    installDependenciesFromDirectory(directory) {
        return this.runInstall(async () => {
            try {
                const pythonPath = await this.dependencies.findPython();
                if (!pythonPath) {
                    return { success: false, output: '找不到 Python' };
                }
                await this.dependencies.beforeInstall?.();
                try {
                    const result = await this.dependencies.installDependenciesFromDirectory(pythonPath, directory);
                    if (result.success) {
                        this.dependencies.onDependenciesInstalled?.();
                    }
                    return result;
                }
                finally {
                    this.dependencies.afterInstall?.();
                }
            }
            catch (error) {
                return {
                    success: false,
                    output: error instanceof Error ? error.message : String(error),
                };
            }
        });
    }
    /** 6.7：取消当前 pip 安装（终止进程树）。 */
    cancelInstallDependencies() {
        return this.dependencies.cancelInstallDependencies?.() ?? false;
    }
    /** 安装或初始化现有便携 Python。 */
    async installPortablePython() {
        await this.dependencies.beforeInstall?.();
        try {
            return await this.dependencies.installPortablePython();
        }
        finally {
            this.dependencies.afterInstall?.();
        }
    }
}
exports.PythonEnvironmentService = PythonEnvironmentService;
