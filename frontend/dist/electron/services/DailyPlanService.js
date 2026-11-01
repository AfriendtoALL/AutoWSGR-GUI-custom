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
exports.DailyPlanService = void 0;
/**
 * 管理演习、战役和决战三类独立日常任务 YAML。
 *
 * 系统计划位于 resource/system_daily_plans，只读。
 * 用户计划位于 Electron userData/user_daily_plans，可覆盖同名系统计划。
 * 本服务只接受 exercise、campaign、decisive，避免它们再次混入普通出征计划。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DAILY_PLAN_PREFIXES = {
    exercise: 'exercise-',
    campaign: 'campaign-',
    decisive: 'decisive-',
};
const DAILY_PLAN_ORDER = {
    exercise: 0,
    campaign: 1,
    decisive: 2,
};
/** 提供日常任务计划的受管路径、读取、列表和决战章节保存能力。 */
class DailyPlanService {
    constructor(appPaths, atomicFiles, combatCodec, taskPresetCodec) {
        this.appPaths = appPaths;
        this.atomicFiles = atomicFiles;
        this.combatCodec = combatCodec;
        this.taskPresetCodec = taskPresetCodec;
    }
    /** 列出日常任务；用户同名文件覆盖系统文件。 */
    list() {
        const plans = new Map();
        const errors = [];
        for (const source of ['system', 'user']) {
            for (const file of this.yamlFiles(this.directory(source))) {
                try {
                    const plan = this.readPlan(source, file);
                    plans.set(file.toLocaleLowerCase(), plan);
                }
                catch (error) {
                    errors.push({
                        source,
                        file,
                        message: error instanceof Error
                            ? error.message
                            : String(error),
                    });
                }
            }
        }
        return {
            plans: [...plans.values()].sort((left, right) => (DAILY_PLAN_ORDER[left.taskType]
                - DAILY_PLAN_ORDER[right.taskType]
                || left.name.localeCompare(right.name, 'zh-CN'))),
            errors,
        };
    }
    /** 读取一份受管日常任务，并返回任务列表执行所需的 YAML。 */
    read(source, file) {
        try {
            const filePath = this.safeManagedPath(source, file);
            if (!filePath || !fs.existsSync(filePath)) {
                throw new Error('日常任务计划不存在');
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            this.parseDailyPlan(content, file);
            return {
                success: true,
                kind: 'daily',
                path: filePath,
                sourcePath: filePath,
                content,
                source,
                file,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /** 读取指定章节的用户决战配置；没有用户副本时回退到系统配置。 */
    decisivePlan(chapter) {
        const normalizedChapter = this.decisiveChapter(chapter);
        const file = this.decisiveFile(normalizedChapter);
        const userPath = this.safeManagedPath('user', file);
        const source = (userPath && fs.existsSync(userPath))
            ? 'user'
            : 'system';
        return this.readDecisiveSettings(source, file);
    }
    /** 读取 GUI 2.0 提供的指定章节系统默认决战配置。 */
    systemDecisivePlan(chapter) {
        const normalizedChapter = this.decisiveChapter(chapter);
        return this.readDecisiveSettings('system', this.decisiveFile(normalizedChapter));
    }
    /** 保存一章用户决战配置，其他章节文件保持不变。 */
    saveDecisivePlan(settings) {
        const chapter = this.decisiveChapter(settings.chapter);
        const root = this.taskPresetCodec.normalize({
            task_type: 'decisive',
            chapter,
            times: 1,
            level1: this.shipNames(settings.level1, '主选队列'),
            level2: this.shipNames(settings.level2, '备选队列'),
            use_quick_repair: settings.useQuickRepair === true,
        });
        const directory = this.directory('user');
        fs.mkdirSync(directory, { recursive: true });
        this.atomicFiles.write(path.join(directory, this.decisiveFile(chapter)), this.combatCodec.serialize(root));
        return this.settingsFromDecisive(root);
    }
    /** 返回系统或用户日常任务目录。 */
    directory(source) {
        return source === 'system'
            ? this.appPaths.systemDailyPlansDir()
            : this.appPaths.userDailyPlansDir();
    }
    /** 校验文件名并返回受管目录内路径。 */
    safeManagedPath(source, file) {
        if ((source !== 'system' && source !== 'user')
            || path.basename(file) !== file
            || !/^(exercise|campaign|decisive)-.+\.ya?ml$/i.test(file)) {
            return null;
        }
        return path.join(this.directory(source), file);
    }
    readPlan(source, file) {
        const filePath = this.safeManagedPath(source, file);
        if (!filePath)
            throw new Error('日常任务文件名不符合规则');
        const preset = this.parseDailyPlan(fs.readFileSync(filePath, 'utf-8'), file);
        const taskType = preset.task_type;
        return {
            source,
            file,
            name: this.displayName(file, taskType),
            taskType,
            times: typeof preset.times === 'number' ? preset.times : 1,
            fleetId: typeof preset.fleet_id === 'number'
                ? preset.fleet_id
                : undefined,
            campaignName: typeof preset.campaign_name === 'string'
                ? preset.campaign_name
                : undefined,
            chapter: typeof preset.chapter === 'number'
                ? preset.chapter
                : undefined,
            useQuickRepair: typeof preset.use_quick_repair === 'boolean'
                ? preset.use_quick_repair
                : true,
            formation: typeof preset.formation === 'number'
                ? preset.formation
                : undefined,
            repairMode: typeof preset.repair_mode === 'number'
                ? preset.repair_mode
                : undefined,
        };
    }
    parseDailyPlan(content, file) {
        const root = this.combatCodec.parseRoot(content, '日常任务计划根节点必须是对象');
        const preset = this.taskPresetCodec.normalize(root);
        if (!this.isDailyPlanType(preset.task_type)) {
            throw new Error(`不支持的日常任务类型：${preset.task_type}`);
        }
        const prefix = DAILY_PLAN_PREFIXES[preset.task_type];
        if (!file.toLocaleLowerCase().startsWith(prefix)) {
            throw new Error(`文件名必须以 ${prefix} 开头`);
        }
        if (preset.task_type === 'decisive') {
            this.decisiveChapter(preset.chapter);
        }
        return preset;
    }
    readDecisiveSettings(source, file) {
        const filePath = this.safeManagedPath(source, file);
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`第 ${this.chapterFromFile(file)} 章决战配置不存在`);
        }
        const preset = this.parseDailyPlan(fs.readFileSync(filePath, 'utf-8'), file);
        if (preset.task_type !== 'decisive') {
            throw new Error('目标文件不是决战配置');
        }
        return this.settingsFromDecisive(preset);
    }
    settingsFromDecisive(preset) {
        return {
            chapter: this.decisiveChapter(preset.chapter),
            useQuickRepair: preset.use_quick_repair !== false,
            level1: this.shipNames(preset.level1, '主选队列'),
            level2: this.shipNames(preset.level2, '备选队列'),
        };
    }
    isDailyPlanType(value) {
        return (value === 'exercise'
            || value === 'campaign'
            || value === 'decisive');
    }
    decisiveChapter(value) {
        const chapter = Number(value);
        if (!Number.isInteger(chapter) || chapter < 1 || chapter > 6) {
            throw new Error('决战章节必须是 1 到 6');
        }
        return chapter;
    }
    shipNames(value, label) {
        if (!Array.isArray(value)) {
            throw new Error(`${label}必须是舰名列表`);
        }
        return value.map((item, index) => {
            if (typeof item !== 'string' || !item.trim()) {
                throw new Error(`${label}第 ${index + 1} 项不能为空`);
            }
            return item.trim();
        });
    }
    decisiveFile(chapter) {
        return `decisive-决战第${chapter}章.yaml`;
    }
    chapterFromFile(file) {
        return /第(\d+)章/.exec(file)?.[1] ?? '?';
    }
    displayName(file, taskType) {
        return file
            .replace(new RegExp(`^${DAILY_PLAN_PREFIXES[taskType]}`, 'i'), '')
            .replace(/\.ya?ml$/i, '');
    }
    yamlFiles(directory) {
        if (!fs.existsSync(directory))
            return [];
        return fs.readdirSync(directory)
            .filter(file => /\.ya?ml$/i.test(file))
            .sort((left, right) => left.localeCompare(right, 'zh-CN'));
    }
}
exports.DailyPlanService = DailyPlanService;
