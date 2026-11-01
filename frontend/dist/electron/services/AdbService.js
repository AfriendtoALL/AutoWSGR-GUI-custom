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
exports.AdbService = void 0;
/**
 * 管理 ADB 设备发现、连接和断开。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/** 执行 ADB 设备查询和连接状态确认。 */
class AdbService {
    constructor(appPaths, dependencies = {
        execute: async (executable, args, options) => {
            const result = await execFileAsync(executable, args, options);
            return {
                stdout: result.stdout,
                stderr: result.stderr,
            };
        },
    }) {
        this.appPaths = appPaths;
        this.dependencies = dependencies;
    }
    bundledExecutable() {
        return path.join(this.appPaths.appRoot(), 'adb', 'adb.exe');
    }
    /** 返回内置 ADB；不存在时继续使用系统命令。 */
    executable() {
        const bundledAdb = this.bundledExecutable();
        return fs.existsSync(bundledAdb) ? bundledAdb : 'adb';
    }
    /** 仅停止由 GUI 目录内置 adb.exe 启动的 server。 */
    async stopServer() {
        const bundledAdb = this.bundledExecutable();
        if (!fs.existsSync(bundledAdb))
            return false;
        const escapedPath = bundledAdb.replace(/'/g, "''");
        const processQuery = [
            `$target = [IO.Path]::GetFullPath('${escapedPath}')`,
            '$running = Get-CimInstance Win32_Process'
                + ' -Filter "Name = \'adb.exe\'"'
                + ' -ErrorAction SilentlyContinue'
                + ' | Where-Object {'
                + ' $_.ExecutablePath'
                + ' -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $target'
                + ' }',
            "if ($running) { [Console]::Out.Write('1') }",
        ].join('; ');
        const { stdout } = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', processQuery], {
            windowsHide: true,
            timeout: 5000,
            encoding: 'utf8',
        });
        if (String(stdout).trim() !== '1')
            return false;
        await this.dependencies.execute(bundledAdb, ['kill-server'], {
            windowsHide: true,
            timeout: 5000,
            encoding: 'utf8',
        });
        return true;
    }
    /** 读取并解析 adb devices 的当前设备列表。 */
    async listDevices() {
        const { stdout } = await this.dependencies.execute(this.executable(), ['devices'], {
            windowsHide: true,
            timeout: 5000,
            encoding: 'utf8',
        });
        return String(stdout)
            .split(/\r?\n/)
            .slice(1)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
            const [serial, status] = line.split(/\s+/);
            return {
                serial,
                status: status || 'unknown',
            };
        });
    }
    /** 执行 connect 或 disconnect，并通过设备列表确认结果。 */
    async runDeviceCommand(command, rawSerial) {
        const serial = String(rawSerial ?? '').trim();
        if (!serial || !/^[A-Za-z0-9._:[\]-]+$/.test(serial)) {
            return {
                success: false,
                serial,
                status: 'invalid',
                message: 'ADB 地址格式不正确',
            };
        }
        try {
            const { stdout, stderr } = await this.dependencies.execute(this.executable(), [command, serial], {
                windowsHide: true,
                timeout: 10000,
                encoding: 'utf8',
            });
            const devices = await this.listDevices();
            const status = devices.find(device => device.serial === serial)?.status;
            const success = command === 'connect'
                ? status === 'device'
                : status === undefined;
            return {
                success,
                serial,
                status: status ?? 'disconnected',
                message: [stdout, stderr]
                    .map(value => String(value).trim())
                    .filter(Boolean)
                    .join('\n')
                    || (success
                        ? '操作成功'
                        : '操作后设备状态未达到预期'),
            };
        }
        catch (error) {
            const details = error;
            return {
                success: false,
                serial,
                status: 'error',
                message: [
                    details.stderr,
                    details.stdout,
                    details.message,
                ]
                    .map(value => String(value ?? '').trim())
                    .find(Boolean)
                    || 'ADB 命令执行失败',
            };
        }
    }
}
exports.AdbService = AdbService;
