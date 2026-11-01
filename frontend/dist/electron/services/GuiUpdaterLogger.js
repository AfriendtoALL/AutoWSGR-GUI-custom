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
exports.GuiUpdaterLogger = void 0;
/**
 * 把 electron-updater 的诊断信息写入独立、限长的文件日志。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MAX_LOG_SIZE = 2 * 1024 * 1024;
/** 优先写入安装目录，权限不足时回退到用户数据目录。 */
class GuiUpdaterLogger {
    constructor(preferredLogPath, fallbackLogPath) {
        this.preferredLogPath = preferredLogPath;
        this.fallbackLogPath = fallbackLogPath;
        this.activeLogPath = null;
    }
    info(message) {
        this.append('INFO', message);
    }
    warn(message) {
        this.append('WARN', message);
    }
    error(message) {
        this.append('ERROR', message);
    }
    debug(message) {
        this.append('DEBUG', message);
    }
    logPath() {
        return this.resolveLogPath();
    }
    append(level, value) {
        try {
            const logPath = this.resolveLogPath();
            this.rotateIfNeeded(logPath);
            const message = value instanceof Error
                ? value.stack ?? value.message
                : typeof value === 'string'
                    ? value
                    : JSON.stringify(value);
            fs.appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${message}\n`, 'utf-8');
        }
        catch {
            // 更新日志写入失败不能阻断更新或 GUI 启动。
        }
    }
    resolveLogPath() {
        if (this.activeLogPath)
            return this.activeLogPath;
        for (const candidate of [
            this.preferredLogPath,
            this.fallbackLogPath,
        ]) {
            try {
                fs.mkdirSync(path.dirname(candidate), { recursive: true });
                fs.closeSync(fs.openSync(candidate, 'a'));
                this.activeLogPath = candidate;
                return candidate;
            }
            catch {
                // 继续尝试用户数据目录。
            }
        }
        this.activeLogPath = this.fallbackLogPath;
        return this.activeLogPath;
    }
    rotateIfNeeded(logPath) {
        try {
            if (!fs.existsSync(logPath)
                || fs.statSync(logPath).size < MAX_LOG_SIZE) {
                return;
            }
            const parsed = path.parse(logPath);
            const previous = path.join(parsed.dir, `${parsed.name}.1${parsed.ext}`);
            fs.rmSync(previous, { force: true });
            fs.renameSync(logPath, previous);
        }
        catch {
            // 文件正被扫描时继续追加，下一条日志再尝试轮转。
        }
    }
}
exports.GuiUpdaterLogger = GuiUpdaterLogger;
