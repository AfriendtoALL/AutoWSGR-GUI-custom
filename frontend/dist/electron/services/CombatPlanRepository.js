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
exports.CombatPlanRepository = void 0;
/**
 * 管理系统和用户出征计划文件。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 负责受管出征计划的路径、读取、写入、重命名和删除。 */
class CombatPlanRepository {
    constructor(appPaths, atomicFiles) {
        this.appPaths = appPaths;
        this.atomicFiles = atomicFiles;
    }
    /** 初始化用户出征计划目录。 */
    initializeUserDirectory() {
        fs.mkdirSync(this.appPaths.userBattlePlansDir(), { recursive: true });
    }
    /** 返回指定来源的权威出征计划目录。 */
    directory(source) {
        return source === 'system'
            ? this.appPaths.systemBattlePlansDir()
            : this.appPaths.userBattlePlansDir();
    }
    /** 列出用户计划文件，保持原有过滤、映射和文件系统顺序。 */
    listUserFiles() {
        const directory = this.directory('user');
        if (!fs.existsSync(directory))
            return [];
        return fs.readdirSync(directory)
            .filter(file => /\.ya?ml$/i.test(file))
            .map(file => ({
            name: file.replace(/\.ya?ml$/i, ''),
            file,
        }));
    }
    /** 返回经过文件名边界校验的受管计划路径。 */
    safeManagedPath(source, file) {
        if ((source !== 'system' && source !== 'user')
            || path.basename(file) !== file
            || !/\.ya?ml$/i.test(file)) {
            return null;
        }
        return path.join(this.directory(source), file);
    }
    /** 返回经过文件名边界校验的用户计划路径。 */
    safeUserPath(file) {
        return this.safeManagedPath('user', file);
    }
    /** 判断绝对路径是否为系统或用户受管计划。 */
    managedFromPath(filePath) {
        const resolved = path.resolve(filePath);
        for (const source of ['system', 'user']) {
            const directory = path.resolve(this.directory(source));
            if (path.dirname(resolved).toLowerCase() === directory.toLowerCase()
                && /\.ya?ml$/i.test(path.basename(resolved))) {
                return {
                    source,
                    file: path.basename(resolved),
                };
            }
        }
        return null;
    }
    /** 列出目录中的 YAML 文件并保持既有排序规则。 */
    yamlFiles(directory) {
        if (!fs.existsSync(directory))
            return [];
        return fs.readdirSync(directory)
            .filter(file => /\.ya?ml$/i.test(file))
            .sort((left, right) => left.localeCompare(right, 'zh-CN'));
    }
    /** 读取一份出征计划原始文本。 */
    read(filePath) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    /** 原子写入一份出征计划文本。 */
    write(filePath, content) {
        this.atomicFiles.write(filePath, content);
    }
    /** 返回路径是否已存在。 */
    exists(filePath) {
        return fs.existsSync(filePath);
    }
    /** 返回文件最后修改时间的毫秒值。 */
    modifiedAt(filePath) {
        return fs.statSync(filePath).mtimeMs;
    }
    /** 使用既有文件系统语义重命名计划。 */
    rename(source, target) {
        fs.renameSync(source, target);
    }
    /** 删除已有出征计划文件。 */
    remove(filePath) {
        fs.unlinkSync(filePath);
    }
}
exports.CombatPlanRepository = CombatPlanRepository;
