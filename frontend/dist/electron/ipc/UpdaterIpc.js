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
exports.registerUpdaterIpc = registerUpdaterIpc;
/**
 * 连接 GUI 自动更新 IPC 与 electron-updater。
 */
const path = __importStar(require("path"));
const electron_updater_1 = require("electron-updater");
const GuiUpdatePolicy_1 = require("../services/GuiUpdatePolicy");
function updateFileName(file) {
    try {
        const url = new URL(file.url, 'https://update.invalid');
        return path.basename(decodeURIComponent(url.pathname));
    }
    catch {
        return path.basename(file.url);
    }
}
function downloadedFileMetadata(info) {
    const downloadedName = path.basename(info.downloadedFile);
    const file = info.files.find(candidate => updateFileName(candidate) === downloadedName) ?? info.files[0];
    return {
        sha512: file?.sha512 ?? info.sha512,
        isAdminRightsRequired: file?.isAdminRightsRequired === true,
    };
}
/** 注册 GUI 更新检查；下载和安装决定均由主进程系统弹窗控制。 */
function registerUpdaterIpc(ipc, context) {
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = false;
    electron_updater_1.autoUpdater.allowDowngrade = true;
    electron_updater_1.autoUpdater.logger = context.logger;
    let updatePolicy = (0, GuiUpdatePolicy_1.resolveGuiUpdateSelectionPolicy)(context.getAppVersion(), context.allowTestUpdates());
    const applyUpdatePolicy = () => {
        updatePolicy = (0, GuiUpdatePolicy_1.resolveGuiUpdateSelectionPolicy)(context.getAppVersion(), context.allowTestUpdates());
        electron_updater_1.autoUpdater.setFeedURL({
            provider: 'github',
            owner: updatePolicy.repository.owner,
            repo: updatePolicy.repository.repo,
            channel: updatePolicy.channel,
        });
        electron_updater_1.autoUpdater.channel = updatePolicy.channel;
        electron_updater_1.autoUpdater.allowDowngrade = true;
        electron_updater_1.autoUpdater.allowPrerelease = updatePolicy.allowPrerelease;
    };
    applyUpdatePolicy();
    let approvedUpdateVersion = null;
    let declinedUpdateVersion = null;
    let downloadPromise = null;
    let checkPromise = null;
    let choosingRestartTiming = false;
    const reportError = (message) => {
        context.logger.error(message);
        context.sendToRenderer('update-status', {
            status: 'error',
            message,
        });
    };
    const beginDownload = (version) => {
        if (downloadPromise)
            return downloadPromise;
        context.logger.info(`User approved background download for GUI v${version}`);
        context.sendToRenderer('update-status', {
            status: 'downloading',
        });
        downloadPromise = electron_updater_1.autoUpdater.downloadUpdate()
            .then(() => undefined)
            .catch((error) => {
            const message = error instanceof Error
                ? error.message
                : String(error);
            reportError(message);
        })
            .finally(() => {
            downloadPromise = null;
        });
        return downloadPromise;
    };
    const offerDownload = async (version) => {
        const pending = context.updateStates.read();
        if (pending?.targetVersion === version) {
            context.sendToRenderer('update-status', {
                status: 'deferred',
                version,
            });
            return;
        }
        if (declinedUpdateVersion === version || downloadPromise)
            return;
        const choice = await context.chooseDownload(version);
        if (choice === 'later') {
            declinedUpdateVersion = version;
            context.logger.info(`User deferred GUI v${version} download until next launch`);
            return;
        }
        void beginDownload(version);
    };
    const offerRestart = async (version) => {
        if (choosingRestartTiming)
            return;
        choosingRestartTiming = true;
        try {
            const timing = await context.chooseRestartTiming(version);
            if (timing === 'restart') {
                context.sendToRenderer('update-status', {
                    status: 'installing',
                    message: '正在安全停止任务并准备后台更新',
                });
                await context.installDownloadedUpdate();
                return;
            }
            context.logger.info(`GUI v${version} will install before next window opens`);
            context.sendToRenderer('update-status', {
                status: 'deferred',
                version,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            reportError(`GUI 更新安装准备失败：${message}`);
        }
        finally {
            choosingRestartTiming = false;
        }
    };
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        context.sendToRenderer('update-status', {
            status: 'checking',
        });
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        const mismatch = (0, GuiUpdatePolicy_1.validateGuiUpdateCandidate)(updatePolicy, info.version);
        if (mismatch) {
            approvedUpdateVersion = null;
            reportError(mismatch);
            return;
        }
        approvedUpdateVersion = info.version;
        context.sendToRenderer('update-status', {
            status: 'available',
            version: info.version,
            releaseNotes: typeof info.releaseNotes === 'string'
                ? info.releaseNotes
                : '',
        });
    });
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        approvedUpdateVersion = null;
        context.sendToRenderer('update-status', {
            status: 'up-to-date',
        });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        const mismatch = (0, GuiUpdatePolicy_1.validateGuiUpdateCandidate)(updatePolicy, info.version);
        if (mismatch) {
            reportError(mismatch);
            return;
        }
        try {
            const metadata = downloadedFileMetadata(info);
            if (!metadata.sha512) {
                throw new Error('更新元数据缺少 SHA-512 校验值');
            }
            context.updateStates.saveDownloaded({
                sourceVersion: context.getAppVersion(),
                targetVersion: info.version,
                downloadedFile: info.downloadedFile,
                sha512: metadata.sha512,
                isAdminRightsRequired: metadata.isAdminRightsRequired,
            });
            context.logger.info(`GUI v${info.version} downloaded and persisted: `
                + info.downloadedFile);
            context.sendToRenderer('update-status', {
                status: 'downloaded',
                version: info.version,
            });
            void offerRestart(info.version);
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            reportError(message);
        }
    });
    electron_updater_1.autoUpdater.on('error', (error) => {
        approvedUpdateVersion = null;
        reportError(error.message);
    });
    ipc.handle('check-gui-updates', async () => {
        if (checkPromise)
            return checkPromise;
        checkPromise = (async () => {
            try {
                applyUpdatePolicy();
                const result = await electron_updater_1.autoUpdater.checkForUpdates();
                const classified = (0, GuiUpdatePolicy_1.classifyGuiUpdateCheck)(updatePolicy, result);
                approvedUpdateVersion = classified.status === 'available'
                    ? classified.version
                    : null;
                if (classified.status === 'available'
                    && approvedUpdateVersion) {
                    await offerDownload(approvedUpdateVersion);
                }
                return classified;
            }
            catch (error) {
                approvedUpdateVersion = null;
                const message = error instanceof Error
                    ? error.message
                    : String(error);
                reportError(message);
                return {
                    status: 'error',
                    message,
                };
            }
        })();
        try {
            return await checkPromise;
        }
        finally {
            checkPromise = null;
        }
    });
    ipc.handle('check-backend-updates', () => {
        return context.backendUpdates.check();
    });
    ipc.handle('auto-check-backend-updates', () => {
        return context.backendUpdates.autoCheckIfEnabled(context.getBackendUpdateMode());
    });
    ipc.handle('prepare-backend-update', async (_event, commit) => {
        try {
            await context.backendUpdates.prepare(commit);
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            context.logger.error(`后端独立更新准备失败: ${message}`);
            context.sendToRenderer('backend-update-status', {
                status: 'error',
                message,
            });
            throw error;
        }
    });
}
