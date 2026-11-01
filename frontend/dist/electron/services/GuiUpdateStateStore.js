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
exports.GuiUpdateStateStore = void 0;
/**
 * 持久化 GUI 更新下载和安装状态，供应用重启前后的启动门禁使用。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const INSTALLING_STATE_TIMEOUT_MS = 30 * 60 * 1000;
const INSTALLER_EXIT_GRACE_MS = 5 * 60 * 1000;
function defaultProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
/** 管理用户数据目录中的单个 GUI 更新状态文件。 */
class GuiUpdateStateStore {
    constructor(filePath, atomicFiles, dependencies = {
        now: () => Date.now(),
        isProcessRunning: defaultProcessRunning,
    }) {
        this.filePath = filePath;
        this.atomicFiles = atomicFiles;
        this.dependencies = dependencies;
    }
    /** 读取并校验状态；损坏或不完整的内容不会阻塞 GUI 启动。 */
    read() {
        const target = this.filePath();
        if (!fs.existsSync(target))
            return null;
        try {
            const value = JSON.parse(fs.readFileSync(target, 'utf-8'));
            return this.normalize(value);
        }
        catch {
            return null;
        }
    }
    /** 记录 electron-updater 已下载并校验完成的安装包。 */
    saveDownloaded(input) {
        const state = {
            status: 'downloaded',
            sourceVersion: input.sourceVersion,
            targetVersion: input.targetVersion,
            downloadedFile: path.resolve(input.downloadedFile),
            sha512: input.sha512,
            isAdminRightsRequired: input.isAdminRightsRequired === true,
            downloadedAt: new Date(this.dependencies.now()).toISOString(),
        };
        this.write(state);
        return state;
    }
    /** 在启动安装器前写入安装锁，避免重复启动进入旧版 GUI。 */
    markInstalling() {
        const current = this.requireState();
        const state = {
            ...current,
            status: 'installing',
            installingAt: new Date(this.dependencies.now()).toISOString(),
            installerPid: undefined,
        };
        this.write(state);
        return state;
    }
    /** 安装器成功创建后保存 PID，供后续重复启动判断。 */
    saveInstallerPid(pid) {
        const current = this.requireState();
        const state = {
            ...current,
            status: 'installing',
            installerPid: pid,
        };
        this.write(state);
        return state;
    }
    /** 安装器启动失败时恢复为待安装状态。 */
    restoreDownloaded() {
        const current = this.requireState();
        const state = {
            ...current,
            status: 'downloaded',
            installingAt: undefined,
            installerPid: undefined,
        };
        this.write(state);
        return state;
    }
    /** 根据当前应用版本和安装器进程决定启动前应执行的动作。 */
    resolveStartup(currentVersion) {
        const state = this.read();
        if (!state)
            return { action: 'continue' };
        if (currentVersion !== state.sourceVersion) {
            this.clear();
            return { action: 'cleanup', state };
        }
        if (state.status === 'downloaded') {
            return { action: 'install', state };
        }
        if (this.isInstallationActive(state)) {
            return { action: 'wait', state };
        }
        return {
            action: 'install',
            state: this.restoreDownloaded(),
        };
    }
    /** 判断旧版本对应的安装器是否仍处于有效安装时间内。 */
    isInstallationActive(state) {
        if (state.status !== 'installing')
            return false;
        const startedAt = Date.parse(state.installingAt ?? '');
        if (!Number.isFinite(startedAt)
            || this.dependencies.now() - startedAt
                > INSTALLING_STATE_TIMEOUT_MS) {
            return false;
        }
        return state.installerPid === undefined
            || this.dependencies.isProcessRunning(state.installerPid)
            || this.dependencies.now() - startedAt
                <= INSTALLER_EXIT_GRACE_MS;
    }
    clear() {
        fs.rmSync(this.filePath(), { force: true });
    }
    requireState() {
        const state = this.read();
        if (!state) {
            throw new Error('没有可用的 GUI 待安装更新');
        }
        return state;
    }
    write(state) {
        const target = this.filePath();
        fs.mkdirSync(path.dirname(target), { recursive: true });
        this.atomicFiles.write(target, `${JSON.stringify(state, null, 2)}\n`);
    }
    normalize(value) {
        if (!value || typeof value !== 'object')
            return null;
        const state = value;
        if ((state.status !== 'downloaded'
            && state.status !== 'installing')
            || typeof state.sourceVersion !== 'string'
            || typeof state.targetVersion !== 'string'
            || typeof state.downloadedFile !== 'string'
            || typeof state.sha512 !== 'string'
            || typeof state.downloadedAt !== 'string') {
            return null;
        }
        return {
            status: state.status,
            sourceVersion: state.sourceVersion,
            targetVersion: state.targetVersion,
            downloadedFile: path.resolve(state.downloadedFile),
            sha512: state.sha512,
            isAdminRightsRequired: state.isAdminRightsRequired === true,
            downloadedAt: state.downloadedAt,
            installingAt: typeof state.installingAt === 'string'
                ? state.installingAt
                : undefined,
            installerPid: Number.isInteger(state.installerPid)
                && Number(state.installerPid) > 0
                ? Number(state.installerPid)
                : undefined,
        };
    }
}
exports.GuiUpdateStateStore = GuiUpdateStateStore;
