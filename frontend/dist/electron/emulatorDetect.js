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
exports.readRegistryValue = readRegistryValue;
exports.readRegistrySubKeys = readRegistrySubKeys;
exports.detectEmulator = detectEmulator;
/**
 * 通过 Windows 注册表检测已安装的模拟器。
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
/** 读取注册表中的单个值。 */
function readRegistryValue(keyPath, valueName) {
    try {
        const output = (0, child_process_1.execSync)(`reg query "${keyPath}" /v "${valueName}"`, { encoding: 'utf-8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        // reg query 输出格式为“名称、类型、值”。
        const match = output.match(new RegExp(`${valueName}\\s+REG_\\w+\\s+(.+)`));
        return match ? match[1].trim() : null;
    }
    catch {
        return null;
    }
}
/** 读取注册表下的直接子键。 */
function readRegistrySubKeys(keyPath) {
    try {
        const output = (0, child_process_1.execSync)(`reg query "${keyPath}"`, { encoding: 'utf-8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        return output
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.startsWith('HKEY'));
    }
    catch {
        return [];
    }
}
/** 按 MuMu、雷电、蓝叠的顺序检测模拟器。 */
function detectEmulator() {
    if (process.platform !== 'win32')
        return null;
    // MuMu 12
    // 用单次 reg query /s 递归搜索 Uninstall 下的 UninstallString，
    // 再从输出中筛选含 MuMu 的条目，避免逐键启动子进程。
    const uninstallBase = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
    try {
        const output = (0, child_process_1.execSync)(`reg query "${uninstallBase}" /s /v UninstallString`, { encoding: 'utf-8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
        // 输出由注册表键路径和 UninstallString 值交替组成。
        for (const line of output.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('HKEY')) {
                // 当前检测不需要具体键名。
                continue;
            }
            if (/UninstallString/i.test(trimmed) && /MuMu/i.test(trimmed)) {
                const valMatch = trimmed.match(/UninstallString\s+REG_\w+\s+(.+)/i);
                if (valMatch) {
                    const uninstall = valMatch[1].trim();
                    const root = path.dirname(uninstall.replace(/"/g, ''));
                    const shellDir = path.join(root, 'shell');
                    const playerExe = path.join(shellDir, 'MuMuPlayer.exe');
                    const adbExe = path.join(shellDir, 'adb.exe');
                    if (fs.existsSync(playerExe)) {
                        return {
                            type: 'MuMu',
                            path: playerExe,
                            serial: '127.0.0.1:16384',
                            adbPath: fs.existsSync(adbExe) ? adbExe : '',
                        };
                    }
                }
            }
        }
    }
    catch { /* 扫描失败时继续检测其他模拟器。 */ }
    // 雷电模拟器
    try {
        const leidianSubs = readRegistrySubKeys('HKLM\\SOFTWARE\\leidian');
        for (const subKey of leidianSubs) {
            const installDir = readRegistryValue(subKey, 'InstallDir');
            if (installDir) {
                const exePath = path.join(installDir, 'dnplayer.exe');
                const adbExe = path.join(installDir, 'adb.exe');
                if (fs.existsSync(exePath)) {
                    return {
                        type: '雷电',
                        path: exePath,
                        serial: 'emulator-5554',
                        adbPath: fs.existsSync(adbExe) ? adbExe : '',
                    };
                }
            }
        }
    }
    catch { /* 未安装时继续检测。 */ }
    // 蓝叠
    for (const regKey of ['HKLM\\SOFTWARE\\BlueStacks_nxt_cn', 'HKLM\\SOFTWARE\\BlueStacks_nxt']) {
        const installDir = readRegistryValue(regKey, 'InstallDir');
        if (installDir) {
            const exePath = path.join(installDir, 'HD-Player.exe');
            const adbExe = path.join(installDir, 'HD-Adb.exe');
            if (fs.existsSync(exePath)) {
                return {
                    type: '蓝叠',
                    path: exePath,
                    serial: '127.0.0.1:5555',
                    adbPath: fs.existsSync(adbExe) ? adbExe : '',
                };
            }
        }
    }
    return null;
}
