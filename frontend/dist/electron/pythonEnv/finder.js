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
exports.isAllowedPythonVersion = isAllowedPythonVersion;
exports.findPython = findPython;
/**
 * 按用户配置、便携版、系统全局的顺序查找 Python。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const context_1 = require("./context");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/** 判断 Python 版本是否为 3.12 或 3.13。 */
function isAllowedPythonVersion(versionOutput) {
    const m = versionOutput.match(/(\d+)\.(\d+)/);
    if (!m)
        return false;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    return major === 3 && (minor === 12 || minor === 13);
}
/** 异步查找并缓存兼容的 Python 可执行文件。 */
async function findPython() {
    if ((0, context_1.getCachedPythonCmd)() !== undefined)
        return (0, context_1.getCachedPythonCmd)();
    const ctx = (0, context_1.getCtx)();
    let found = null;
    // 优先使用配置页指定的 Python。
    const configured = ctx.getConfiguredPythonPath();
    if (configured && fs.existsSync(configured)) {
        try {
            const { stdout, stderr } = await execAsync(`"${configured}" --version`, { windowsHide: true });
            const verStr = stdout || stderr;
            if (isAllowedPythonVersion(verStr))
                found = configured;
            else
                ctx.sendProgress(`WARNING 用户配置的 Python 版本不兼容: ${verStr.trim()}（需要 3.12 或 3.13），回退自动检测`);
        }
        catch {
            ctx.sendProgress('WARNING 用户配置的 Python 路径无法执行，回退自动检测');
        }
    }
    else if (configured) {
        ctx.sendProgress('WARNING 用户配置的 Python 路径不存在，回退自动检测');
    }
    // 其次使用本地便携版 Python。
    const localPython = path.join(ctx.appRoot(), 'python', 'python.exe');
    if (!found && fs.existsSync(localPython)) {
        try {
            const { stdout, stderr } = await execAsync(`"${localPython}" --version`, { windowsHide: true });
            const verStr = stdout || stderr;
            if (isAllowedPythonVersion(verStr))
                found = localPython;
            else
                ctx.sendProgress(`WARNING 本地 Python 版本不兼容: ${verStr.trim()}（需要 3.12 或 3.13）`);
        }
        catch { /* 本地 Python 不可用时继续查找。 */ }
    }
    if (!found) { // 用户配置和本地 Python 均不可用时回退系统 Python
        // 最后回退到系统 Python；需解析真实 exe，避免 spawn 无法执行 .bat shim。
        for (const cmd of ['python', 'python3']) {
            try {
                const { stdout: verOut, stderr: verErr } = await execAsync(`${cmd} --version`, { windowsHide: true });
                if (!isAllowedPythonVersion(verOut || verErr))
                    continue;
                // 通过 Python 自身解析真实可执行文件。
                const { stdout } = await execAsync(`${cmd} -c "import sys; print(sys.executable)"`, { windowsHide: true });
                const resolved = stdout.trim();
                found = (resolved && fs.existsSync(resolved)) ? resolved : cmd;
                break;
            }
            catch { /* 当前命令不可用时继续查找。 */ }
        }
    }
    (0, context_1.setCachedPythonCmd)(found);
    return found;
}
