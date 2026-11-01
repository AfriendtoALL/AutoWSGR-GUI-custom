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
exports.BackendUpdateRemoteRepository = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/** GitHub 后端源码及归档的远端来源 Repository。 */
class BackendUpdateRemoteRepository {
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async fetchJson(url) {
        if (this.dependencies.fetchJson) {
            return this.dependencies.fetchJson(url);
        }
        const response = await fetch(url, {
            headers: { Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
            throw new Error(`GitHub API 请求失败 (${response.status})`);
        }
        return response.json();
    }
    async downloadArchive(url, destination, onProgress) {
        if (this.dependencies.downloadArchive) {
            return this.dependencies.downloadArchive(url, destination, onProgress);
        }
        const response = await fetch(url, {
            signal: AbortSignal.timeout(300000),
        });
        if (!response.ok) {
            throw new Error(`后端源码包下载失败 (${response.status})`);
        }
        const total = Number(response.headers.get('content-length') ?? 0);
        let received = 0;
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('后端源码包下载流不可用');
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const partial = `${destination}.part`;
        try {
            const handle = fs.openSync(partial, 'w');
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    fs.writeSync(handle, value);
                    received += value.byteLength;
                    if (total > 0)
                        onProgress(Math.floor((received / total) * 100));
                }
            }
            finally {
                fs.closeSync(handle);
            }
            fs.renameSync(partial, destination);
        }
        catch (error) {
            fs.rmSync(partial, { force: true });
            throw error;
        }
        onProgress(100);
    }
    async extractArchive(zipPath, destination) {
        if (this.dependencies.extractArchive) {
            return this.dependencies.extractArchive(zipPath, destination);
        }
        fs.mkdirSync(destination, { recursive: true });
        await execAsync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}'`
            + ` -DestinationPath '${destination.replace(/'/g, "''")}' -Force"`, { windowsHide: true, timeout: 120000 });
    }
    /** GitHub 归档解压后必须只有一个仓库根目录。 */
    locateSourceRoot(extractDir) {
        const entries = fs.readdirSync(extractDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory());
        if (entries.length !== 1) {
            throw new Error('后端源码包结构异常');
        }
        return path.join(extractDir, entries[0].name);
    }
}
exports.BackendUpdateRemoteRepository = BackendUpdateRemoteRepository;
