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
exports.GuiSettingsStore = void 0;
/**
 * 读取并浅合并写入 gui_settings.json。
 */
const fs = __importStar(require("fs"));
function isRecord(value) {
    return (typeof value === 'object'
        && value !== null
        && !Array.isArray(value));
}
/** 管理唯一 GUI JSON 设置文件的读取和浅合并写入。 */
class GuiSettingsStore {
    constructor(getFilePath, atomicFiles) {
        this.getFilePath = getFilePath;
        this.atomicFiles = atomicFiles;
    }
    /** 返回当前 GUI 设置文件路径。 */
    filePath() {
        return this.getFilePath();
    }
    /** 读取设置；不存在或无法解析时保持原有空对象回退。 */
    read() {
        try {
            return this.readCurrent();
        }
        catch {
            // 文件缺失或无效时返回空设置。
            return {};
        }
    }
    /** 浅合并 patch 后覆盖写回唯一设置文件。 */
    write(patch) {
        const current = this.readCurrent();
        Object.assign(current, patch);
        this.atomicFiles.write(this.filePath(), JSON.stringify(current, null, 2));
    }
    /**
     * 写入路径必须区分“不存在”和“已有但损坏”，避免用局部 patch
     * 覆盖无法解析的完整配置。
     */
    readCurrent() {
        const filePath = this.filePath();
        if (!fs.existsSync(filePath))
            return {};
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!isRecord(parsed)) {
            throw new Error('gui_settings.json 根节点必须是对象');
        }
        return parsed;
    }
}
exports.GuiSettingsStore = GuiSettingsStore;
