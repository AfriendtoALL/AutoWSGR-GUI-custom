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
exports.SecureFileService = void 0;
/**
 * 在路径能力边界内读写主进程文本文件。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 集中管理主进程对普通文本文件的现有访问规则。 */
class SecureFileService {
    constructor(safePaths, atomicFiles) {
        this.safePaths = safePaths;
        this.atomicFiles = atomicFiles;
    }
    /** 在允许目录内覆盖保存 UTF-8 文本。 */
    save(filePath, content) {
        let resolved = this.safePaths.resolveWritablePath(filePath);
        const directory = path.dirname(resolved);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        resolved = this.safePaths.resolveWritablePath(resolved);
        this.atomicFiles.write(resolved, content);
    }
    /** 在允许目录内读取 UTF-8 文本，不存在时返回空字符串。 */
    read(filePath) {
        const resolved = this.safePaths.resolveReadablePath(filePath);
        if (!fs.existsSync(resolved))
            return '';
        return fs.readFileSync(resolved, 'utf-8');
    }
    /** 捕获受管文本文件，供跨文件提交失败时精确恢复。 */
    snapshot(filePath) {
        const resolved = this.safePaths.resolveWritablePath(filePath);
        if (!fs.existsSync(resolved)) {
            return { exists: false, content: '' };
        }
        return {
            exists: true,
            content: fs.readFileSync(resolved, 'utf-8'),
        };
    }
    /** 恢复文本文件到提交前状态。 */
    restore(filePath, snapshot) {
        if (snapshot.exists) {
            this.save(filePath, snapshot.content);
            return;
        }
        const resolved = this.safePaths.resolveWritablePath(filePath);
        fs.rmSync(resolved, { force: true });
    }
    /** 在允许目录内追加 UTF-8 文本。 */
    append(filePath, content) {
        let resolved = this.safePaths.resolveWritablePath(filePath);
        const directory = path.dirname(resolved);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        resolved = this.safePaths.resolveWritablePath(resolved);
        fs.appendFileSync(resolved, content, 'utf-8');
    }
    /** 读取用户通过系统文件对话框显式选择的文件。 */
    readSelectedFile(filePath) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    /** 写入用户通过系统保存对话框显式选择的文件。 */
    writeSelectedFile(filePath, content) {
        this.atomicFiles.write(filePath, content);
    }
}
exports.SecureFileService = SecureFileService;
