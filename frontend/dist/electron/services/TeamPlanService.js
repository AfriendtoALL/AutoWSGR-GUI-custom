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
exports.TeamPlanService = void 0;
/**
 * 编排独立编队的保存、加载和列表查询。
 */
const path = __importStar(require("path"));
const TeamPlanCodec_1 = require("./TeamPlanCodec");
/** 编排编队保存、用户选择结果加载和列表查询。 */
class TeamPlanService {
    constructor(codec, repository, combatCodec, combatRepository) {
        this.codec = codec;
        this.repository = repository;
        this.combatCodec = combatCodec;
        this.combatRepository = combatRepository;
    }
    /** 保存或重命名一份受管编队计划。 */
    save(rawPlan, overwrite, currentFile, rawSource) {
        try {
            const plan = this.codec.normalize(rawPlan);
            const currentSource = rawSource === 'system'
                ? 'system'
                : 'user';
            const directory = this.repository.directory('user');
            const file = this.codec.fileName(plan.name);
            const filePath = path.join(directory, file);
            let currentPath = null;
            if (currentFile !== undefined) {
                if (typeof currentFile !== 'string'
                    || path.basename(currentFile) !== currentFile
                    || !TeamPlanCodec_1.TEAM_FILE_PATTERN.test(currentFile)) {
                    throw new Error('当前编队文件名不符合规则');
                }
                currentPath = path.join(this.repository.directory(currentSource), currentFile);
            }
            const updatesCurrentFile = currentSource === 'user'
                && currentPath !== null
                && path.resolve(currentPath).toLowerCase()
                    === path.resolve(filePath).toLowerCase();
            if (this.repository.exists(filePath)
                && !updatesCurrentFile
                && overwrite !== true) {
                return {
                    success: false,
                    exists: true,
                    file,
                    error: '存在同名配置',
                };
            }
            let renamedFrom;
            if (currentSource === 'user'
                && currentPath
                && !updatesCurrentFile
                && this.repository.exists(currentPath)) {
                const currentPlan = this.repository.read(currentPath);
                if (currentPlan.name !== plan.name) {
                    renamedFrom = currentPlan.name;
                }
            }
            const content = this.codec.serialize(plan);
            const referenceUpdates = renamedFrom
                ? this.collectBattlePlanReferenceUpdates(renamedFrom, plan.name)
                : [];
            const previousTargetContent = this.repository.exists(filePath)
                ? this.repository.readContent(filePath)
                : null;
            const appliedReferenceUpdates = [];
            let targetWritten = false;
            try {
                this.repository.write(filePath, content);
                targetWritten = true;
                for (const update of referenceUpdates) {
                    this.combatRepository.write(update.path, update.updatedContent);
                    appliedReferenceUpdates.push(update);
                }
                if (currentPath
                    && currentSource === 'user'
                    && !updatesCurrentFile
                    && this.repository.exists(currentPath)) {
                    this.repository.remove(currentPath);
                }
            }
            catch (error) {
                for (const update of appliedReferenceUpdates.reverse()) {
                    this.combatRepository.write(update.path, update.originalContent);
                }
                if (targetWritten) {
                    if (previousTargetContent !== null) {
                        this.repository.write(filePath, previousTargetContent);
                    }
                    else if ((!currentPath || path.resolve(currentPath).toLowerCase()
                        !== path.resolve(filePath).toLowerCase())
                        && this.repository.exists(filePath)) {
                        this.repository.remove(filePath);
                    }
                }
                throw error;
            }
            return {
                success: true,
                file,
                plan: { ...plan, file, source: 'user' },
                renamedFrom,
                updatedBattlePlans: referenceUpdates.length,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /** 加载系统文件对话框返回的用户编队路径。 */
    loadSelected(filePathValue) {
        const directory = this.repository.directory('user');
        const filePath = path.resolve(filePathValue);
        const file = path.basename(filePath);
        if (path.dirname(filePath).toLowerCase()
            !== path.resolve(directory).toLowerCase()
            || !TeamPlanCodec_1.TEAM_FILE_PATTERN.test(file)) {
            return {
                success: false,
                error: '当前yaml格式不符合规则',
            };
        }
        try {
            const plan = this.repository.read(filePath);
            return {
                success: true,
                file,
                plan: { ...plan, file, source: 'user' },
            };
        }
        catch {
            return {
                success: false,
                error: '当前yaml格式不符合规则',
            };
        }
    }
    /** 列出所有受管编队和逐文件读取错误。 */
    list() {
        return this.repository.list();
    }
    /** 收集用户出征计划中需要随编队改名迁移的精确名称引用。 */
    collectBattlePlanReferenceUpdates(oldName, newName) {
        const directory = this.combatRepository.directory('user');
        const updates = [];
        for (const file of this.combatRepository.yamlFiles(directory)) {
            const filePath = path.join(directory, file);
            const originalContent = this.combatRepository.read(filePath);
            let root;
            try {
                root = this.combatCodec.parseRoot(originalContent, '出征计划根节点必须是对象');
            }
            catch {
                // 损坏且无法解析的计划保持原样，避免一次编队保存改坏其他文件。
                continue;
            }
            if (!Array.isArray(root.fleet_presets))
                continue;
            let changed = false;
            const renamedPresets = root.fleet_presets.map(rawPreset => {
                if (!this.combatCodec.isPlainObject(rawPreset)
                    || typeof rawPreset.name !== 'string'
                    || rawPreset.name.trim() !== oldName) {
                    return rawPreset;
                }
                changed = true;
                return {
                    ...structuredClone(rawPreset),
                    name: newName,
                };
            });
            if (!changed)
                continue;
            let keptRenamedReference = false;
            const deduplicatedPresets = renamedPresets.filter(rawPreset => {
                if (!this.combatCodec.isPlainObject(rawPreset)
                    || typeof rawPreset.name !== 'string'
                    || rawPreset.name.trim() !== newName) {
                    return true;
                }
                if (keptRenamedReference)
                    return false;
                keptRenamedReference = true;
                return true;
            });
            const updatedRoot = {
                ...root,
                fleet_presets: deduplicatedPresets,
            };
            updates.push({
                path: filePath,
                originalContent,
                updatedContent: this.combatCodec.serialize(updatedRoot, originalContent),
            });
        }
        return updates;
    }
}
exports.TeamPlanService = TeamPlanService;
