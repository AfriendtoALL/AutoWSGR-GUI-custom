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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanExportService = void 0;
/**
 * 把用户勾选的出征计划和舰队方案导出为 ZIP。
 * Renderer 只提交计划类型和文件名，主进程始终从受管用户目录重新定位文件。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const jszip_1 = __importDefault(require("jszip"));
/** 用户计划 ZIP 的两个固定目录名。 */
const ARCHIVE_DIRECTORIES = {
    battle: 'user_battle_plans',
    team: 'user_team_plans',
};
/** 负责用户计划导出的输入校验、路径约束和 ZIP 生成。 */
class PlanExportService {
    constructor(combatRepository, teamRepository, atomicFiles, combatCodec) {
        this.combatRepository = combatRepository;
        this.teamRepository = teamRepository;
        this.atomicFiles = atomicFiles;
        this.combatCodec = combatCodec;
    }
    /** 使用本地日期生成导出文件名。 */
    archiveFileName(now = new Date()) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}-plans.zip`;
    }
    /** 生成供 1.4.3 恢复的计划包，同时保留未经转换的 2.0 原文件。 */
    async createLegacy143Archive(rawSelections) {
        if (!this.combatCodec) {
            throw new Error('当前环境未启用 1.4.3 兼容导出');
        }
        const selections = this.normalizeSelections(rawSelections).filter(selection => selection.kind === 'battle');
        if (selections.length === 0) {
            throw new Error('请至少选择一个用户出征计划');
        }
        const zip = new jszip_1.default();
        zip.folder('plans');
        zip.folder('original_2.0/user_battle_plans');
        selections.forEach(selection => {
            const filePath = this.resolveUserPlan(selection);
            const originalContent = fs.readFileSync(filePath, 'utf-8');
            const root = this.combatCodec.parseRoot(originalContent, `无效的出征计划：${selection.file}`);
            const expanded = this.combatCodec.expandRoot(root, 'user');
            const legacy = this.toLegacy143Plan(expanded);
            const stats = fs.statSync(filePath);
            zip.file(`plans/${selection.file}`, this.combatCodec.serialize(legacy, originalContent), { date: stats.mtime });
            zip.file(`original_2.0/user_battle_plans/${selection.file}`, originalContent, { date: stats.mtime });
        });
        zip.file('恢复说明.txt', [
            'AutoWSGR-GUI 2.0 → 1.4.3 用户计划备份',
            '',
            '1. 安装 1.4.3 后退出程序。',
            '2. 将 plans 目录内的 YAML 复制到 1.4.3 安装目录的 plans。',
            '3. original_2.0 保存未经转换的 2.0 原文件，仅用于完整备份。',
            '4. 其他设置、模板、任务组和运行环境不在本备份范围内。',
            '',
        ].join('\r\n'));
        return {
            content: await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 },
                platform: 'DOS',
            }),
            count: selections.length,
        };
    }
    /** 校验用户选择并生成包含固定分类目录的 ZIP。 */
    async createArchive(rawSelections) {
        const selections = this.normalizeSelections(rawSelections);
        const zip = new jszip_1.default();
        zip.folder(ARCHIVE_DIRECTORIES.battle);
        zip.folder(ARCHIVE_DIRECTORIES.team);
        selections.forEach(selection => {
            const filePath = this.resolveUserPlan(selection);
            const stats = fs.statSync(filePath);
            zip.file(`${ARCHIVE_DIRECTORIES[selection.kind]}/${selection.file}`, fs.readFileSync(filePath), { date: stats.mtime });
        });
        return {
            content: await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 },
                platform: 'DOS',
            }),
            count: selections.length,
        };
    }
    /** 将已生成的 ZIP 写到系统保存对话框返回的位置。 */
    writeArchive(filePath, archive) {
        this.atomicFiles.write(filePath, archive.content);
    }
    /** Renderer 输入必须是去重后的用户计划文件清单。 */
    normalizeSelections(rawSelections) {
        if (!Array.isArray(rawSelections) || rawSelections.length === 0) {
            throw new Error('请至少选择一个用户配置');
        }
        if (rawSelections.length > 1000) {
            throw new Error('单次最多导出 1000 个用户配置');
        }
        const selections = [];
        const keys = new Set();
        rawSelections.forEach(value => {
            if (typeof value !== 'object'
                || value === null
                || !('kind' in value)
                || !('file' in value)) {
                throw new Error('导出配置清单格式不正确');
            }
            const { kind, file } = value;
            if ((kind !== 'battle' && kind !== 'team')
                || typeof file !== 'string'
                || path.basename(file) !== file
                || !/\.ya?ml$/i.test(file)) {
                throw new Error('导出配置包含非法文件名');
            }
            const key = `${kind}:${file.toLocaleLowerCase('en-US')}`;
            if (keys.has(key))
                return;
            keys.add(key);
            selections.push({ kind, file });
        });
        return selections;
    }
    /** 只允许读取对应用户计划目录内真实存在的普通文件。 */
    resolveUserPlan(selection) {
        const directory = selection.kind === 'battle'
            ? this.combatRepository.directory('user')
            : this.teamRepository.directory('user');
        const candidate = path.join(directory, selection.file);
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
            throw new Error(`用户配置不存在：${selection.file}`);
        }
        const canonicalDirectory = fs.realpathSync.native(directory);
        const canonicalCandidate = fs.realpathSync.native(candidate);
        const relative = path.relative(canonicalDirectory, canonicalCandidate);
        if (relative === ''
            || relative === '..'
            || relative.startsWith(`..${path.sep}`)
            || path.isAbsolute(relative)) {
            throw new Error(`用户配置超出允许目录：${selection.file}`);
        }
        return canonicalCandidate;
    }
    /** 把 2.0 独立舰队和候选规则降为 1.4.3 可读取的内嵌结构。 */
    toLegacy143Plan(root) {
        const output = structuredClone(root);
        if (!Array.isArray(output.fleet_presets))
            return output;
        output.fleet_presets = output.fleet_presets.map(rawPreset => {
            if (!this.combatCodec.isPlainObject(rawPreset))
                return rawPreset;
            const ships = Array.isArray(rawPreset.ships)
                ? rawPreset.ships.map(slot => this.toLegacy143Slot(slot))
                : rawPreset.ships;
            return { ...rawPreset, ships };
        });
        return output;
    }
    toLegacy143Slot(slot) {
        if (!this.combatCodec.isPlainObject(slot))
            return slot;
        const candidates = Array.isArray(slot.candidates)
            ? slot.candidates
            : [];
        const priority = candidates
            .filter(candidate => this.combatCodec.isPlainObject(candidate))
            .map(candidate => candidate.name)
            .filter((name) => (typeof name === 'string' && name.trim().length > 0));
        const output = { ...slot };
        delete output.candidates;
        delete output.search_name;
        delete output.relaxed;
        if (priority.length > 0)
            output.priority = priority;
        return output;
    }
}
exports.PlanExportService = PlanExportService;
