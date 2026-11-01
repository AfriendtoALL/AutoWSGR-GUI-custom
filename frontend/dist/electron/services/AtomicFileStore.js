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
exports.AtomicFileStore = void 0;
/**
 * 通过同目录临时文件和原子替换完成持久化写入。
 */
const fs = __importStar(require("fs"));
const WINDOWS_RETRY_DELAYS_MS = [20, 50, 100];
const WINDOWS_TRANSIENT_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
/** 为需要失败回滚的持久化模块提供统一写入能力。 */
class AtomicFileStore {
    /** 把文本或二进制内容写入目标文件，并在失败时保留原文件。 */
    write(filePath, content) {
        const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        try {
            this.retryWindowsFileLock(() => {
                if (typeof content === 'string') {
                    fs.writeFileSync(temporary, content, 'utf-8');
                }
                else {
                    fs.writeFileSync(temporary, content);
                }
            });
            this.retryWindowsFileLock(() => {
                fs.renameSync(temporary, filePath);
            });
        }
        catch (error) {
            try {
                fs.rmSync(temporary, { force: true });
            }
            catch {
                // 清理失败不能覆盖最初的替换错误。
            }
            throw error;
        }
    }
    /** Windows 文件扫描或短暂占用时，等待后重试文件操作。 */
    retryWindowsFileLock(operation) {
        for (let attempt = 0;; attempt += 1) {
            try {
                operation();
                return;
            }
            catch (error) {
                const code = error.code;
                const delay = WINDOWS_RETRY_DELAYS_MS[attempt];
                if (process.platform !== 'win32'
                    || !code
                    || !WINDOWS_TRANSIENT_CODES.has(code)
                    || delay === undefined) {
                    throw error;
                }
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
            }
        }
    }
}
exports.AtomicFileStore = AtomicFileStore;
