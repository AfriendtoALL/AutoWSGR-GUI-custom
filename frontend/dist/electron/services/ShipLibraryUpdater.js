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
exports.ShipLibraryUpdater = void 0;
/**
 * 互斥运行舰船资料库更新并解析进度。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/** 启动更新脚本、解析进度并保护单实例更新状态。 */
class ShipLibraryUpdater {
    constructor(library, dependencies) {
        this.library = library;
        this.dependencies = dependencies;
        this.running = false;
    }
    /** 执行一次互斥的舰船资料库更新。 */
    async update() {
        if (this.running) {
            return {
                success: false,
                error: '舰船资料库正在更新，请稍候',
            };
        }
        this.running = true;
        try {
            return await this.run();
        }
        finally {
            this.running = false;
        }
    }
    /** 只读核对 GUI 船库与当前后端舰名库。 */
    async getBackendSyncStatus() {
        const pythonCmd = await this.dependencies.findPython();
        if (!pythonCmd) {
            throw new Error('找不到可用的 Python 3.12 或 3.13');
        }
        return this.dependencies.compareShipNames(pythonCmd);
    }
    /** 不访问 Wiki，只把当前 GUI 舰名增量同步到后端。 */
    async syncBackend() {
        if (this.running) {
            return {
                success: false,
                error: '舰船资料库正在更新，请稍候',
            };
        }
        this.running = true;
        try {
            const pythonCmd = await this.dependencies.findPython();
            if (!pythonCmd) {
                return {
                    success: false,
                    error: '找不到可用的 Python 3.12 或 3.13',
                };
            }
            this.dependencies.sendProgress('正在同步后端舰名库…');
            const syncResult = this.dependencies.syncShipNames(pythonCmd);
            return {
                success: true,
                ship_count: syncResult.totalRecords,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `后端舰名同步失败: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            this.running = false;
        }
    }
    /** 启动 Python 更新脚本并解析机器可读输出。 */
    async run() {
        const pythonCmd = await this.dependencies.findPython();
        if (!pythonCmd) {
            return {
                success: false,
                error: '找不到可用的 Python 3.12 或 3.13',
            };
        }
        const updaterPath = this.library.updaterPath();
        if (!fs.existsSync(updaterPath)) {
            return {
                success: false,
                error: `找不到舰船资料库更新程序: ${updaterPath}`,
            };
        }
        const updateResult = await new Promise((resolve) => {
            const spawnProcess = this.dependencies.spawnProcess ?? child_process_1.spawn;
            // 便携版 Python 的 ._pth 隔离模式不会自动加入脚本目录。
            const bootstrap = [
                'import runpy, sys',
                `sys.path.insert(0, ${JSON.stringify(path.dirname(updaterPath))})`,
                'script = sys.argv[1]',
                'sys.argv = sys.argv[1:]',
                'runpy.run_path(script, run_name="__main__")',
            ].join('; ');
            const child = spawnProcess(pythonCmd, [
                '-c',
                bootstrap,
                updaterPath,
                '--output',
                this.library.directory(),
                '--workers',
                '8',
                '--force-assets',
            ], {
                cwd: this.dependencies.appRoot(),
                windowsHide: true,
            });
            let stdoutBuffer = '';
            let stderr = '';
            let result = null;
            const handleLine = (rawLine) => {
                const line = rawLine.trim();
                if (!line)
                    return;
                if (line.startsWith('PROGRESS sources')) {
                    this.dependencies.sendProgress('正在获取舰R百科数据…');
                }
                else {
                    const records = line.match(/^PROGRESS records parsed=(\d+)$/);
                    const assets = line.match(/^PROGRESS assets (\d+)\/(\d+) downloaded=(\d+) failed=(\d+)$/);
                    if (records) {
                        this.dependencies.sendProgress(`已读取 ${records[1]} 艘舰船，正在检查本地资源…`);
                    }
                    else if (assets) {
                        this.dependencies.sendProgress(`正在检查资源 ${assets[1]}/${assets[2]}，已下载 ${assets[3]}，失败 ${assets[4]}`);
                    }
                }
                if (line.startsWith('RESULT_JSON=')) {
                    try {
                        result = JSON.parse(line.slice('RESULT_JSON='.length));
                    }
                    catch {
                        result = {
                            success: false,
                            error: '更新程序返回了无效结果',
                        };
                    }
                }
            };
            child.stdout.setEncoding('utf-8');
            child.stdout.on('data', (chunk) => {
                stdoutBuffer += chunk;
                const lines = stdoutBuffer.split(/\r?\n/);
                stdoutBuffer = lines.pop() ?? '';
                lines.forEach(handleLine);
            });
            child.stderr.setEncoding('utf-8');
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });
            child.once('error', (error) => {
                resolve({
                    success: false,
                    error: `更新程序启动失败: ${error.message}`,
                });
            });
            child.once('close', (code) => {
                if (stdoutBuffer)
                    handleLine(stdoutBuffer);
                resolve(result ?? {
                    success: false,
                    error: stderr.trim()
                        || `更新程序异常退出（代码 ${code ?? 'unknown'}）`,
                });
            });
        });
        if (!updateResult.success)
            return updateResult;
        this.dependencies.sendProgress('正在同步后端舰名库…');
        try {
            this.dependencies.syncShipNames(pythonCmd);
            return updateResult;
        }
        catch (error) {
            return {
                ...updateResult,
                shipnames_sync_error: error instanceof Error
                    ? error.message
                    : String(error),
            };
        }
    }
}
exports.ShipLibraryUpdater = ShipLibraryUpdater;
