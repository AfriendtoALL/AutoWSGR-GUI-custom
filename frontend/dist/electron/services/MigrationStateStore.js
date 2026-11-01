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
exports.MigrationStateStore = void 0;
/**
 * 持久化迁移完成项和最高版本号。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 独占管理 .migration-state.json 的解析、合并和原子写入。 */
class MigrationStateStore {
    constructor(getFilePath, atomicFiles) {
        this.getFilePath = getFilePath;
        this.atomicFiles = atomicFiles;
    }
    /** 返回迁移状态文件路径。 */
    filePath() {
        return this.getFilePath();
    }
    /** 读取当前迁移状态；无效文件按未迁移处理。 */
    read() {
        try {
            const raw = JSON.parse(fs.readFileSync(this.filePath(), 'utf-8'));
            return {
                version: typeof raw.version === 'number' ? raw.version : 0,
                completed: Array.isArray(raw.completed)
                    ? raw.completed.filter(value => typeof value === 'string')
                    : [],
            };
        }
        catch {
            return { version: 0, completed: [] };
        }
    }
    /** 原子写入完整迁移状态。 */
    write(state) {
        fs.mkdirSync(path.dirname(this.filePath()), { recursive: true });
        this.atomicFiles.write(this.filePath(), JSON.stringify(state, null, 2));
    }
    /** 判断独立迁移阶段是否已经完整成功。 */
    isStageComplete(stage) {
        return this.read().completed.includes(stage);
    }
    /** 合并单个阶段完成键，并保留旧迁移记录和较高版本。 */
    completeStage(stage, version) {
        this.mergeCompleted([stage], version);
    }
    /** 合并一组完成键，供批量迁移在本轮结束后一次提交。 */
    mergeCompleted(stages, version = 0) {
        const state = this.read();
        const completed = new Set(state.completed);
        for (const stage of stages)
            completed.add(stage);
        this.write({
            version: Math.max(state.version, version),
            completed: [...completed].sort(),
        });
    }
}
exports.MigrationStateStore = MigrationStateStore;
