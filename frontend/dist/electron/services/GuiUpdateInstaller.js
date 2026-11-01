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
exports.GuiUpdateInstaller = void 0;
/**
 * 复核已下载安装包，并以静默模式启动 NSIS 更新。
 */
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function defaultUpdaterCacheRoot() {
    const localAppData = process.env.LOCALAPPDATA
        ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'wsgrgui-updater');
}
function hashSha512(filePath) {
    return new Promise((resolve, reject) => {
        const hash = (0, crypto_1.createHash)('sha512');
        const input = fs.createReadStream(filePath);
        input.on('error', reject);
        hash.on('error', reject);
        input.on('data', chunk => hash.update(chunk));
        input.on('end', () => {
            resolve(hash.digest('base64'));
        });
    });
}
function launchDetached(command, args) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            detached: true,
            windowsHide: true,
            stdio: 'ignore',
        });
        child.once('error', reject);
        child.once('spawn', () => {
            const pid = child.pid;
            child.unref();
            if (!pid) {
                reject(new Error('安装器进程没有返回 PID'));
                return;
            }
            resolve(pid);
        });
    });
}
/** 只负责 updater 缓存中的安装包，不处理应用或用户数据目录。 */
class GuiUpdateInstaller {
    constructor(states, logger, resourcesPath, dependencies = {
        fileExists: filePath => fs.existsSync(filePath),
        hashSha512,
        launch: launchDetached,
        updaterCacheRoot: defaultUpdaterCacheRoot(),
    }) {
        this.states = states;
        this.logger = logger;
        this.resourcesPath = resourcesPath;
        this.dependencies = dependencies;
    }
    /** 校验并启动安装器；安装完成后由 NSIS 启动新版本。 */
    async launchPendingUpdate() {
        const state = this.states.read();
        if (!state) {
            throw new Error('没有可安装的 GUI 更新');
        }
        try {
            await this.verifyInstaller(state);
        }
        catch (error) {
            this.states.clear();
            this.cleanupPendingFiles(state);
            throw error;
        }
        this.states.markInstalling();
        try {
            const args = ['--updated', '/S', '--force-run'];
            const pid = await this.launchInstaller(state, args);
            const installing = this.states.saveInstallerPid(pid);
            this.logger.info(`GUI update installer started: pid=${pid}, `
                + `version=${state.targetVersion}`);
            return installing;
        }
        catch (error) {
            this.states.restoreDownloaded();
            throw error;
        }
    }
    /** 新版本确认启动后，只删除 updater 的 pending 临时目录。 */
    cleanupAppliedUpdate(state) {
        return this.cleanupPendingFiles(state);
    }
    async verifyInstaller(state) {
        if (!this.dependencies.fileExists(state.downloadedFile)) {
            throw new Error('已下载的 GUI 安装包不存在，需要重新下载');
        }
        const actual = await this.dependencies.hashSha512(state.downloadedFile);
        if (actual !== state.sha512) {
            throw new Error('GUI 安装包校验失败，需要重新下载');
        }
    }
    async launchInstaller(state, installerArgs) {
        const elevate = path.join(this.resourcesPath, 'elevate.exe');
        if (state.isAdminRightsRequired
            && this.dependencies.fileExists(elevate)) {
            return this.dependencies.launch(elevate, [state.downloadedFile, ...installerArgs]);
        }
        try {
            return await this.dependencies.launch(state.downloadedFile, installerArgs);
        }
        catch (error) {
            const code = error.code;
            if ((code === 'EACCES' || code === 'UNKNOWN')
                && this.dependencies.fileExists(elevate)) {
                return this.dependencies.launch(elevate, [state.downloadedFile, ...installerArgs]);
            }
            throw error;
        }
    }
    cleanupPendingFiles(state) {
        const pendingDirectory = path.dirname(path.resolve(state.downloadedFile));
        const expectedPendingDirectory = path.join(path.resolve(this.dependencies.updaterCacheRoot), 'pending');
        if (pendingDirectory.toLowerCase()
            !== expectedPendingDirectory.toLowerCase()) {
            this.logger.warn(`Skip GUI update cleanup outside pending directory: `
                + pendingDirectory);
            return false;
        }
        try {
            fs.rmSync(pendingDirectory, {
                recursive: true,
                force: true,
            });
            this.logger.info(`Cleaned GUI update pending directory: ${pendingDirectory}`);
            return true;
        }
        catch (error) {
            this.logger.warn(`Cannot clean GUI update pending directory: ${String(error)}`);
            return false;
        }
    }
}
exports.GuiUpdateInstaller = GuiUpdateInstaller;
