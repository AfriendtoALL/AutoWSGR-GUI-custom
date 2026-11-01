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
exports.RuntimePlanService = void 0;
/**
 * 生成供后端执行的已展开临时计划。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 负责生成后端执行使用的已展开临时计划。 */
class RuntimePlanService {
    constructor(codec, repository, atomicFiles, dependencies) {
        this.codec = codec;
        this.repository = repository;
        this.atomicFiles = atomicFiles;
        this.dependencies = dependencies;
        this.sequence = 0;
    }
    /** 返回当前进程专用的运行时计划目录。 */
    directory() {
        return path.join(this.dependencies.getTempDirectory(), 'AutoWSGR-GUI', 'runtime_battle_plans', String(this.dependencies.processId));
    }
    /** 校验并写入一份已经展开的运行时计划。 */
    write(content, hint) {
        const parsed = this.codec.parseRoot(content, '运行时出征计划必须包含 chapter 和 map');
        if (!('chapter' in parsed) || !('map' in parsed)) {
            throw new Error('运行时出征计划必须包含 chapter 和 map');
        }
        if (Array.isArray(parsed.fleet_presets)
            && parsed.fleet_presets.some(preset => (!this.codec.isPlainObject(preset)
                || !Array.isArray(preset.ships)))) {
            throw new Error('运行时出征计划包含尚未展开的舰队引用');
        }
        const directory = this.directory();
        fs.mkdirSync(directory, { recursive: true });
        this.sequence++;
        const safeHint = this.codec.safeBaseName(hint) || 'plan';
        const timestamp = this.dependencies.now?.() ?? Date.now();
        const file = `${safeHint}-${timestamp}-${this.sequence}.yaml`;
        const target = path.join(directory, file);
        this.atomicFiles.write(target, content);
        return target;
    }
    /** 读取受管计划、展开舰队引用并生成运行时文件。 */
    prepare(source, file) {
        const sourcePath = this.repository.safeManagedPath(source, file);
        if (!sourcePath || !this.repository.exists(sourcePath)) {
            throw new Error('出征计划不存在');
        }
        const originalContent = this.repository.read(sourcePath);
        const parsed = this.codec.parseRoot(originalContent, '无效的出征计划');
        const expanded = this.codec.expandRoot(parsed, source);
        const content = this.codec.serialize(expanded, originalContent);
        return {
            sourcePath,
            runtimePath: this.write(content, file),
            content,
        };
    }
}
exports.RuntimePlanService = RuntimePlanService;
