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
exports.LegacyPlanMigration = exports.LEGACY_PLAN_MIGRATION_STAGE = void 0;
/**
 * 幂等迁移旧作战计划和对应任务组引用。
 */
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yamlSerializer_1 = require("../../src/shared/yamlSerializer");
const LegacyMigrationSummary_1 = require("./LegacyMigrationSummary");
const UserDataMigrationService_1 = require("./UserDataMigrationService");
/** v7 将演习、战役和决战从普通出征计划迁移到独立日常目录。 */
const LEGACY_PLAN_MIGRATION_VERSION = 7;
/** v7 使用独立完成键，避免共享版本号越过失败的前置迁移。 */
exports.LEGACY_PLAN_MIGRATION_STAGE = ('migration:v7:legacy-plans:complete');
/** 编排旧计划迁移，不在本服务中重复任何计划格式规则。 */
class LegacyPlanMigration {
    constructor(appPaths, atomicFiles, userDataMigration, migrationState, dependencies) {
        this.appPaths = appPaths;
        this.atomicFiles = atomicFiles;
        this.userDataMigration = userDataMigration;
        this.migrationState = migrationState;
        this.dependencies = dependencies;
    }
    /** 按用户选择扫描旧安装中的有效 YAML。 */
    migrate(selection = (UserDataMigrationService_1.DEFAULT_LEGACY_MIGRATION_SELECTION)) {
        const legacyDetected = (this.userDataMigration.shouldMigrateLegacyInstallation());
        const misplacedDailyPlans = this.misplacedDailyPlanFiles();
        const detected = legacyDetected || misplacedDailyPlans.length > 0;
        const summary = (0, LegacyMigrationSummary_1.emptyLegacyMigrationSummary)(detected);
        if (!this.migrationState.isStageComplete(UserDataMigrationService_1.PRESET_INVENTORY_MIGRATION_STAGE)) {
            return summary;
        }
        if (legacyDetected
            && !this.userDataMigration.isLegacyConfigurationMigrationComplete()) {
            return summary;
        }
        if (this.migrationState.isStageComplete(exports.LEGACY_PLAN_MIGRATION_STAGE)
            && !legacyDetected) {
            return summary;
        }
        if (!detected) {
            this.migrationState.completeStage(exports.LEGACY_PLAN_MIGRATION_STAGE, LEGACY_PLAN_MIGRATION_VERSION);
            return summary;
        }
        const state = this.migrationState.read();
        const completed = new Set(state.completed);
        const fileMap = new Map();
        const decisiveFailed = legacyDetected && selection.dailyPlans
            ? this.migrateLegacyDecisiveSettings(completed, summary)
            : false;
        const teamsFailed = legacyDetected && selection.taskYamls
            ? this.migrateLegacyTeams(completed, summary)
            : false;
        const plansFailed = legacyDetected
            ? this.migrateLegacyPlans(completed, fileMap, summary, selection)
            : false;
        const misplacedFailed = this.migrateMisplacedDailyPlans(misplacedDailyPlans, completed, fileMap, summary);
        const additionalFailed = legacyDetected
            ? this.migrateAdditionalYaml(completed, fileMap, summary, selection)
            : false;
        if (selection.taskQueue) {
            this.userDataMigration.migrateLegacyTaskGroupPlanPaths(fileMap);
        }
        const failed = (decisiveFailed
            || teamsFailed
            || plansFailed
            || misplacedFailed
            || additionalFailed);
        this.migrationState.mergeCompleted(completed);
        if (!failed) {
            this.migrationState.completeStage(exports.LEGACY_PLAN_MIGRATION_STAGE, LEGACY_PLAN_MIGRATION_VERSION);
        }
        return summary;
    }
    /** 先迁移旧版独立编队，供引用型旧计划继续使用。 */
    migrateLegacyTeams(completed, summary) {
        const targetDirectory = this.appPaths.userTeamPlansDir();
        let failed = false;
        for (const legacyDirectory of this.legacyDirectories('user_team_plans', targetDirectory)) {
            for (const source of this.legacyYamlFiles(legacyDirectory)) {
                const content = fs.readFileSync(source, 'utf-8');
                const key = this.migrationKey('team', source, content);
                if (completed.has(key))
                    continue;
                summary.total += 1;
                try {
                    const team = this.dependencies.normalizeUserTeamPlan((0, yamlSerializer_1.parseYaml)(content));
                    const resolved = this.resolveTeamWrite(team, targetDirectory);
                    if (!fs.existsSync(resolved.write.path)) {
                        this.atomicFiles.write(resolved.write.path, resolved.write.content);
                    }
                    completed.add(key);
                    summary.succeeded += 1;
                }
                catch (error) {
                    failed = true;
                    summary.failed += 1;
                    summary.failedFiles.push(source);
                    console.error(`[Migration] ${source} failed:`, error);
                }
            }
        }
        return failed;
    }
    /** 升级旧计划并写入 GUI 管理的用户计划目录。 */
    migrateLegacyPlans(completed, fileMap, summary, selection) {
        const targetDirectory = this.appPaths.userBattlePlansDir();
        let failed = false;
        for (const legacyDirectory of [
            ...this.legacyDirectories('plans', targetDirectory),
            ...this.legacyDirectories('user_battle_plans', targetDirectory),
        ]) {
            for (const source of this.legacyYamlFiles(legacyDirectory)) {
                if (!selection.dailyPlans && !selection.taskYamls)
                    continue;
                const file = path.basename(source);
                const content = fs.readFileSync(source, 'utf-8');
                const key = this.migrationKey('plan', source, content);
                if (completed.has(key)) {
                    this.registerFileMapping(fileMap, source, this.completedPlanTarget(completed, key, file));
                    continue;
                }
                try {
                    const parsed = (0, yamlSerializer_1.parseYaml)(content);
                    if (!this.isPlainObject(parsed)) {
                        throw new Error('旧计划根节点必须是对象');
                    }
                    const standalone = (this.dependencies.isStandaloneTaskPreset?.(parsed) === true);
                    if (!this.shouldMigratePlan(parsed, standalone, selection)) {
                        continue;
                    }
                    summary.total += 1;
                    const target = standalone
                        ? this.migrateTaskPreset(file, content, parsed)
                        : this.migrateCombatPlan(file, content, this.dependencies.normalizeCombatPlanFleetPresets(parsed, 'user', false));
                    this.registerFileMapping(fileMap, source, target);
                    this.rememberPlanTarget(completed, key, target);
                    completed.add(key);
                    summary.succeeded += 1;
                }
                catch (error) {
                    failed = true;
                    summary.failed += 1;
                    summary.failedFiles.push(source);
                    console.error(`[Migration] ${source} failed:`, error);
                }
            }
        }
        return failed;
    }
    /** 把已被旧升级器放入普通计划目录的日常任务重新归类。 */
    migrateMisplacedDailyPlans(sources, completed, fileMap, summary) {
        let failed = false;
        for (const source of sources) {
            const file = path.basename(source);
            const content = fs.readFileSync(source, 'utf-8');
            const key = this.migrationKey('plan', source, content);
            if (completed.has(key)) {
                this.registerFileMapping(fileMap, source, this.completedPlanTarget(completed, key, file));
                continue;
            }
            summary.total += 1;
            try {
                const parsed = (0, yamlSerializer_1.parseYaml)(content);
                if (!this.isPlainObject(parsed)) {
                    throw new Error('旧日常任务根节点必须是对象');
                }
                const target = this.migrateTaskPreset(file, content, parsed);
                if (target.kind !== 'daily') {
                    throw new Error('目标文件不是日常任务');
                }
                this.registerFileMapping(fileMap, source, target);
                this.rememberPlanTarget(completed, key, target);
                completed.add(key);
                summary.succeeded += 1;
            }
            catch (error) {
                failed = true;
                summary.failed += 1;
                summary.failedFiles.push(source);
                console.error(`[Migration] ${source} failed:`, error);
            }
        }
        return failed;
    }
    /** 把旧决战页面最后保存的配置写入对应章节日常 YAML。 */
    migrateLegacyDecisiveSettings(completed, summary) {
        const source = path.join(this.appPaths.appRoot(), 'gui_settings.json');
        if (!fs.existsSync(source))
            return false;
        const content = fs.readFileSync(source, 'utf-8');
        let root;
        try {
            root = JSON.parse(content);
        }
        catch {
            return false;
        }
        if (!this.isPlainObject(root) || !this.isPlainObject(root.decisive_plan)) {
            return false;
        }
        const decisive = root.decisive_plan;
        const decisiveContent = JSON.stringify(decisive);
        const key = this.migrationKey('plan', source, decisiveContent);
        if (completed.has(key))
            return false;
        summary.total += 1;
        try {
            const level1 = Array.isArray(decisive.level1)
                ? decisive.level1
                : [];
            const level2 = Array.isArray(decisive.level2)
                ? decisive.level2
                : [];
            const level3 = Array.isArray(decisive.level3)
                ? decisive.level3
                : [];
            const chapter = Number(decisive.chapter);
            const preset = {
                task_type: 'decisive',
                chapter,
                times: 1,
                use_quick_repair: typeof decisive.use_quick_repair === 'boolean'
                    ? decisive.use_quick_repair
                    : decisive.useQuickRepair,
                level1: level1.slice(0, 6),
                level2: [
                    ...level1.slice(6),
                    ...level2,
                    ...level3,
                ],
            };
            this.migrateTaskPreset(`决战第${chapter}章.yaml`, '', preset);
            completed.add(key);
            summary.succeeded += 1;
            return false;
        }
        catch (error) {
            summary.failed += 1;
            summary.failedFiles.push(source);
            console.error(`[Migration] ${source} failed:`, error);
            return true;
        }
    }
    /** 递归扫描旧安装其余目录，只迁移能明确识别的计划 YAML。 */
    migrateAdditionalYaml(completed, fileMap, summary, selection) {
        let failed = false;
        for (const source of this.recursiveLegacyYamlFiles()) {
            if (this.isHandledLegacyYaml(source))
                continue;
            const content = fs.readFileSync(source, 'utf-8');
            let parsed;
            try {
                parsed = (0, yamlSerializer_1.parseYaml)(content);
            }
            catch {
                // 非计划目录中的普通 YAML 不属于用户迁移失败。
                continue;
            }
            if (!this.isPlainObject(parsed))
                continue;
            const isTeam = (typeof parsed.name === 'string'
                && Array.isArray(parsed.ships));
            const isPreset = (this.dependencies.isStandaloneTaskPreset?.(parsed) === true);
            const isPlan = 'chapter' in parsed && 'map' in parsed;
            if (!isTeam && !isPreset && !isPlan)
                continue;
            if (isTeam
                ? !selection.taskYamls
                : !this.shouldMigratePlan(parsed, isPreset, selection)) {
                continue;
            }
            const kind = isTeam ? 'team' : 'plan';
            const key = this.migrationKey(kind, source, content);
            const file = path.basename(source);
            if (completed.has(key)) {
                if (!isTeam) {
                    this.registerFileMapping(fileMap, source, this.completedPlanTarget(completed, key, file));
                }
                continue;
            }
            summary.total += 1;
            try {
                if (isTeam) {
                    this.migrateAdditionalTeam(parsed);
                }
                else {
                    const target = this.migrateAdditionalPlan(file, content, parsed, isPreset);
                    this.registerFileMapping(fileMap, source, target);
                    this.rememberPlanTarget(completed, key, target);
                }
                completed.add(key);
                summary.succeeded += 1;
            }
            catch (error) {
                failed = true;
                summary.failed += 1;
                summary.failedFiles.push(source);
                console.error(`[Migration] ${source} failed:`, error);
            }
        }
        return failed;
    }
    /** 将独立日常 YAML 与普通任务 YAML 映射到各自勾选项。 */
    shouldMigratePlan(raw, standalone, selection) {
        if (!standalone)
            return selection.taskYamls;
        return this.isDailyTaskType(raw.task_type)
            ? selection.dailyPlans
            : selection.taskYamls;
    }
    migrateAdditionalTeam(raw) {
        const team = this.dependencies.normalizeUserTeamPlan(raw);
        const resolved = this.resolveTeamWrite(team, this.appPaths.userTeamPlansDir());
        if (!fs.existsSync(resolved.write.path)) {
            this.atomicFiles.write(resolved.write.path, resolved.write.content);
        }
    }
    migrateAdditionalPlan(file, content, parsed, standalone) {
        if (standalone) {
            return this.migrateTaskPreset(file, content, parsed);
        }
        return this.migrateCombatPlan(file, content, this.dependencies.normalizeCombatPlanFleetPresets(parsed, 'user', false));
    }
    migrateCombatPlan(file, content, split) {
        return {
            kind: 'plan',
            file: this.writeMigratedPlan(file, content, split.mapRoot, split.teams),
        };
    }
    /** 按预设类型选择普通计划目录或日常任务目录。 */
    migrateTaskPreset(file, content, parsed) {
        const normalized = this.dependencies.normalizeTaskPreset?.(parsed);
        if (!normalized) {
            throw new Error('缺少任务预设迁移规则');
        }
        const taskType = normalized.task_type;
        if (!this.isDailyTaskType(taskType)) {
            return {
                kind: 'plan',
                file: this.writeMigratedPlan(file, content, normalized, []),
            };
        }
        const dailyPreset = {
            ...normalized,
            task_type: taskType,
        };
        if (dailyPreset.task_type === 'campaign'
            && typeof dailyPreset.campaign_name === 'string'
            && dailyPreset.campaign_name.startsWith('普通')) {
            dailyPreset.campaign_name = dailyPreset.campaign_name.replace(/^普通/, '简单');
        }
        return {
            kind: 'daily',
            taskType,
            file: this.writeMigratedDailyPlan(file, content, dailyPreset),
        };
    }
    writeMigratedDailyPlan(file, content, preset) {
        const serialized = this.dependencies.serializeCombatPlan(preset, content);
        const target = this.resolveDailyPlanTarget(this.migratedDailyPlanFileName(file, preset), serialized);
        if (!target.matches) {
            fs.mkdirSync(this.appPaths.userDailyPlansDir(), { recursive: true });
            this.atomicFiles.write(target.path, serialized);
        }
        return target.file;
    }
    resolveDailyPlanTarget(defaultFile, content) {
        for (let suffix = 0;; suffix += 1) {
            const file = this.legacyPlanFileName(defaultFile, suffix);
            const target = path.join(this.appPaths.userDailyPlansDir(), file);
            if (!fs.existsSync(target)) {
                return { file, path: target, matches: false };
            }
            if (fs.readFileSync(target, 'utf-8') === content) {
                return { file, path: target, matches: true };
            }
        }
    }
    migratedDailyPlanFileName(file, preset) {
        if (preset.task_type === 'decisive') {
            const chapter = Number(preset.chapter);
            if (!Number.isInteger(chapter) || chapter < 1 || chapter > 6) {
                throw new Error('决战章节必须是 1 到 6');
            }
            return `decisive-决战第${chapter}章.yaml`;
        }
        if (preset.task_type === 'exercise') {
            return `exercise-队伍${String(preset.fleet_id)}演习.yaml`;
        }
        const campaignName = typeof preset.campaign_name === 'string'
            ? preset.campaign_name.replace(/^简单/, '普通')
            : this.dependencies.safePlanBaseName(file);
        return `campaign-${campaignName}.yaml`;
    }
    isDailyTaskType(value) {
        return (value === 'exercise'
            || value === 'campaign'
            || value === 'decisive');
    }
    writeMigratedPlan(file, content, mapRoot, teams) {
        const defaultTargetFile = this.migratedUserPlanFileName(file);
        const originalPlan = this.dependencies.serializeCombatPlan(mapRoot, content);
        const existingOriginal = this.matchingPlanTarget(defaultTargetFile, originalPlan);
        if (existingOriginal) {
            this.writeMissingOriginalTeams(teams);
            return existingOriginal.file;
        }
        const resolved = this.resolvePlanTeams(mapRoot, teams);
        const serializedPlan = this.dependencies.serializeCombatPlan(resolved.mapRoot, content);
        const planTarget = this.resolvePlanTarget(defaultTargetFile, serializedPlan);
        const createdTeams = [];
        try {
            for (const team of resolved.writes) {
                if (!fs.existsSync(team.path)) {
                    this.atomicFiles.write(team.path, team.content);
                    createdTeams.push(team.path);
                }
            }
            if (!planTarget.matches) {
                this.atomicFiles.write(planTarget.path, serializedPlan);
            }
        }
        catch (error) {
            for (const teamPath of createdTeams) {
                try {
                    fs.rmSync(teamPath, { force: true });
                }
                catch {
                    // 清理失败不能覆盖最初的迁移错误。
                }
            }
            throw error;
        }
        return planTarget.file;
    }
    /** 已有同内容计划表示曾迁移过，只补缺失编队而不覆盖现有编队。 */
    writeMissingOriginalTeams(teams) {
        const writes = this.dependencies.buildTeamPlanWrites(teams, this.appPaths.userTeamPlansDir());
        for (const write of writes) {
            if (!fs.existsSync(write.path)) {
                this.atomicFiles.write(write.path, write.content);
            }
        }
    }
    matchingPlanTarget(defaultFile, content) {
        for (let suffix = 0;; suffix += 1) {
            const file = this.legacyPlanFileName(defaultFile, suffix);
            const target = path.join(this.appPaths.userBattlePlansDir(), file);
            if (!fs.existsSync(target))
                return null;
            if (fs.readFileSync(target, 'utf-8') === content) {
                return { file, path: target };
            }
        }
    }
    resolvePlanTarget(defaultFile, content) {
        for (let suffix = 0;; suffix += 1) {
            const file = this.legacyPlanFileName(defaultFile, suffix);
            const target = path.join(this.appPaths.userBattlePlansDir(), file);
            if (!fs.existsSync(target)) {
                return { file, path: target, matches: false };
            }
            if (fs.readFileSync(target, 'utf-8') === content) {
                return { file, path: target, matches: true };
            }
        }
    }
    legacyPlanFileName(defaultFile, suffix) {
        if (suffix === 0)
            return defaultFile;
        const extension = path.extname(defaultFile);
        const base = defaultFile.slice(0, -extension.length);
        const label = suffix === 1
            ? '（旧版）'
            : `（旧版 ${suffix}）`;
        return `${base}${label}${extension}`;
    }
    resolvePlanTeams(mapRoot, teams) {
        const resolvedRoot = structuredClone(mapRoot);
        const resolvedTeams = [];
        const writes = [];
        const reservedPaths = new Set();
        for (const team of teams) {
            const resolved = this.resolveTeamWrite(team, this.appPaths.userTeamPlansDir(), reservedPaths);
            const oldName = this.dependencies.teamName?.(team);
            const newName = this.dependencies.teamName?.(resolved.team);
            if (oldName && newName && oldName !== newName) {
                this.replaceTeamReference(resolvedRoot, oldName, newName);
            }
            reservedPaths.add(this.pathKey(resolved.write.path));
            resolvedTeams.push(resolved.team);
            writes.push(resolved.write);
        }
        return {
            mapRoot: resolvedRoot,
            teams: resolvedTeams,
            writes,
        };
    }
    resolveTeamWrite(team, directory, reservedPaths = new Set()) {
        const originalName = this.dependencies.teamName?.(team);
        let candidate = team;
        let suffix = 1;
        for (;;) {
            const [write] = this.dependencies.buildTeamPlanWrites([candidate], directory);
            if (!write)
                throw new Error('旧舰队未生成迁移文件');
            const reserved = reservedPaths.has(this.pathKey(write.path));
            const conflicts = (fs.existsSync(write.path)
                && !this.dependencies.teamPlanMatches(write.path, candidate));
            if (!reserved && !conflicts) {
                return { team: candidate, write };
            }
            if (!originalName
                || !this.dependencies.renameTeam) {
                throw new Error(`迁移目标已存在，未覆盖：${write.path}`);
            }
            const name = suffix === 1
                ? `${originalName}（旧版）`
                : `${originalName}（旧版 ${suffix}）`;
            candidate = this.dependencies.renameTeam(team, name);
            suffix += 1;
        }
    }
    replaceTeamReference(mapRoot, oldName, newName) {
        if (!Array.isArray(mapRoot.fleet_presets))
            return;
        mapRoot.fleet_presets = mapRoot.fleet_presets.map(preset => (this.isPlainObject(preset) && preset.name === oldName
            ? { ...preset, name: newName }
            : preset));
    }
    /** 查找旧版升级后仍滞留在普通计划目录的三类日常任务。 */
    misplacedDailyPlanFiles() {
        const directory = this.appPaths.userBattlePlansDir();
        return this.dependencies.yamlFiles(directory).flatMap(file => {
            const source = path.join(directory, file);
            try {
                const parsed = (0, yamlSerializer_1.parseYaml)(fs.readFileSync(source, 'utf-8'));
                return (this.isPlainObject(parsed)
                    && this.dependencies.isStandaloneTaskPreset?.(parsed) === true
                    && this.isDailyTaskType(parsed.task_type))
                    ? [source]
                    : [];
            }
            catch {
                return [];
            }
        });
    }
    recursiveLegacyYamlFiles() {
        const files = [];
        this.collectYamlFiles(this.appPaths.appRoot(), files);
        return files.sort((left, right) => left.localeCompare(right));
    }
    legacyYamlFiles(directory) {
        const files = [];
        this.collectYamlFiles(directory, files);
        return files.sort((left, right) => left.localeCompare(right));
    }
    collectYamlFiles(directory, files) {
        if (!fs.existsSync(directory) || this.isExcludedDirectory(directory)) {
            return;
        }
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink())
                continue;
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                this.collectYamlFiles(target, files);
            }
            else if (entry.isFile()
                && /\.ya?ml$/i.test(entry.name)) {
                files.push(target);
            }
        }
    }
    isExcludedDirectory(directory) {
        const name = path.basename(directory).toLowerCase();
        if (new Set([
            '.git',
            '.venv',
            'venv',
            'node_modules',
            'dist',
            'dist-electron',
        ]).has(name)) {
            return true;
        }
        return [
            this.appPaths.userBattlePlansDir(),
            this.appPaths.userDailyPlansDir(),
            this.appPaths.userTeamPlansDir(),
            this.appPaths.systemBattlePlansDir(),
            this.appPaths.systemDailyPlansDir(),
            this.appPaths.systemTeamPlansDir(),
        ].some(excluded => this.pathWithin(directory, excluded));
    }
    isHandledLegacyYaml(source) {
        const handledDirectories = [
            ...this.legacyDirectories('plans', this.appPaths.userBattlePlansDir()),
            ...this.legacyDirectories('user_battle_plans', this.appPaths.userBattlePlansDir()),
            ...this.legacyDirectories('user_team_plans', this.appPaths.userTeamPlansDir()),
        ];
        return handledDirectories.some(directory => (this.pathWithin(source, directory)));
    }
    pathWithin(candidate, root) {
        const relative = path.relative(path.resolve(root), path.resolve(candidate));
        return relative === ''
            || (relative !== '..'
                && !relative.startsWith(`..${path.sep}`)
                && !path.isAbsolute(relative));
    }
    migrationKey(kind, source, content) {
        const hash = crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
        return `${kind}-v7:${this.pathKey(source)}:${hash}`;
    }
    rememberPlanTarget(completed, migrationKey, target) {
        const prefix = this.planTargetMarkerPrefix(migrationKey);
        for (const value of completed) {
            if (value.startsWith(prefix))
                completed.delete(value);
        }
        completed.add(`${prefix}${encodeURIComponent(target.file)}`);
    }
    completedPlanTarget(completed, migrationKey, sourceFile) {
        const prefix = this.planTargetMarkerPrefix(migrationKey);
        const marker = [...completed].find(value => value.startsWith(prefix));
        if (marker) {
            try {
                const targetFile = decodeURIComponent(marker.slice(prefix.length));
                if (targetFile
                    && !/[\\/]/.test(targetFile)
                    && /\.ya?ml$/i.test(targetFile)) {
                    return this.referenceTargetFromFile(targetFile);
                }
            }
            catch {
                // 无效输出记录回退到旧版本默认目标文件名。
            }
        }
        return {
            kind: 'plan',
            file: this.migratedUserPlanFileName(sourceFile),
        };
    }
    planTargetMarkerPrefix(migrationKey) {
        const hash = crypto
            .createHash('sha256')
            .update(migrationKey)
            .digest('hex');
        return `plan-output-v7:${hash}:`;
    }
    registerFileMapping(fileMap, source, target) {
        const relative = path.relative(this.appPaths.appRoot(), source);
        for (const value of [source, relative, path.basename(source)]) {
            const key = this.planReferenceKey(value);
            if (key && !fileMap.has(key))
                fileMap.set(key, target);
        }
    }
    referenceTargetFromFile(file) {
        const match = /^(exercise|campaign|decisive)-/.exec(file.toLowerCase());
        return match
            ? {
                kind: 'daily',
                file,
                taskType: match[1],
            }
            : { kind: 'plan', file };
    }
    planReferenceKey(value) {
        const normalized = value
            .trim()
            .replace(/\\/g, '/')
            .replace(/^\.\/+/, '');
        return process.platform === 'win32'
            ? normalized.toLowerCase()
            : normalized;
    }
    /** 返回去重后的旧目录，并排除当前 userData 目标目录。 */
    legacyDirectories(directoryName, targetDirectory) {
        const candidates = directoryName === 'plans'
            ? [
                path.join(this.appPaths.appRoot(), 'plans'),
                path.join(this.appPaths.userDataRoot(), 'plans'),
            ]
            : [
                path.join(this.appPaths.appRoot(), 'resource', directoryName),
                path.join(this.appPaths.resourceRoot(), 'resource', directoryName),
            ];
        const targetKey = this.pathKey(targetDirectory);
        const unique = new Map();
        for (const candidate of candidates) {
            const key = this.pathKey(candidate);
            if (key !== targetKey && !unique.has(key)) {
                unique.set(key, candidate);
            }
        }
        return [...unique.values()];
    }
    pathKey(value) {
        const resolved = path.resolve(value);
        return process.platform === 'win32'
            ? resolved.toLowerCase()
            : resolved;
    }
    migratedUserPlanFileName(file) {
        const baseName = this.dependencies.safePlanBaseName(file);
        if (!baseName) {
            throw new Error(`旧计划文件名不合法: ${file}`);
        }
        return `bettle-${baseName}.yaml`;
    }
    isPlainObject(value) {
        return Boolean(value)
            && typeof value === 'object'
            && !Array.isArray(value);
    }
}
exports.LegacyPlanMigration = LegacyPlanMigration;
