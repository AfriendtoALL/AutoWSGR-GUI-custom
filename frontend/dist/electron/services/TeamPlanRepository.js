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
exports.TeamPlanRepository = void 0;
/**
 * 管理系统和用户独立编队文件。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yamlSerializer_1 = require("../../src/shared/yamlSerializer");
const TeamPlanCodec_1 = require("./TeamPlanCodec");
/** 负责独立编队文件的目录、读取、枚举和原子写入。 */
class TeamPlanRepository {
    constructor(appPaths, atomicFiles, codec) {
        this.appPaths = appPaths;
        this.atomicFiles = atomicFiles;
        this.codec = codec;
    }
    /** 初始化用户编队目录。 */
    initializeUserDirectory() {
        fs.mkdirSync(this.appPaths.userTeamPlansDir(), { recursive: true });
    }
    /** 返回指定来源的权威编队目录。 */
    directory(source) {
        return source === 'system'
            ? this.appPaths.systemTeamPlansDir()
            : this.appPaths.userTeamPlansDir();
    }
    /** 读取并归一化一份编队 YAML。 */
    read(filePath) {
        return this.codec.normalize((0, yamlSerializer_1.parseYaml)(this.readContent(filePath)));
    }
    /** 读取一份编队 YAML 的原始文本。 */
    readContent(filePath) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    /** 判断磁盘文件的归一化内容是否与计划一致。 */
    matches(filePath, plan) {
        if (!fs.existsSync(filePath))
            return false;
        try {
            return JSON.stringify(this.read(filePath))
                === JSON.stringify(plan);
        }
        catch {
            return false;
        }
    }
    /** 为一组计划生成待原子写入的文件列表。 */
    buildWrites(teams, directory) {
        const files = new Set();
        return teams.map(team => {
            const file = this.codec.fileName(team.name);
            const normalizedFile = file.toLowerCase();
            if (files.has(normalizedFile)) {
                throw new Error(`舰队名称生成了重复文件名，请修改名称：${team.name}`);
            }
            files.add(normalizedFile);
            return {
                name: team.name,
                file,
                path: path.join(directory, file),
                content: this.codec.serialize(team),
            };
        });
    }
    /** 原子写入已经序列化的编队内容。 */
    write(filePath, content) {
        this.atomicFiles.write(filePath, content);
    }
    /** 返回路径是否已存在。 */
    exists(filePath) {
        return fs.existsSync(filePath);
    }
    /** 删除已有编队文件。 */
    remove(filePath) {
        fs.unlinkSync(filePath);
    }
    /** 列出系统和用户目录中命名、内容均合法的编队文件。 */
    list() {
        const plans = [];
        const errors = [];
        const sources = [
            {
                directory: this.appPaths.systemTeamPlansDir(),
                source: 'system',
            },
            {
                directory: this.appPaths.userTeamPlansDir(),
                source: 'user',
            },
        ];
        for (const { directory, source } of sources) {
            for (const file of this.yamlFiles(directory)) {
                if (!TeamPlanCodec_1.TEAM_FILE_PATTERN.test(file)) {
                    errors.push({
                        file,
                        source,
                        kind: 'team',
                        message: '舰队文件名必须以 team- 或 team_ 开头',
                    });
                    continue;
                }
                try {
                    const filePath = path.join(directory, file);
                    const plan = this.read(filePath);
                    plans.push({
                        ...plan,
                        file,
                        modifiedAt: fs.statSync(filePath).mtimeMs,
                        source,
                    });
                }
                catch (error) {
                    const message = error instanceof Error
                        ? error.message
                        : String(error);
                    errors.push({ file, source, kind: 'team', message });
                }
            }
        }
        return { plans, errors };
    }
    /** 查找同来源同名编队，未找到时保持既有跨来源回退。 */
    find(name, source, plans = this.list().plans) {
        return plans.find(plan => (plan.name === name && plan.source === source)) ?? plans.find(plan => plan.name === name) ?? null;
    }
    /** 列出目录中的 YAML 文件并保持既有排序规则。 */
    yamlFiles(directory) {
        if (!fs.existsSync(directory))
            return [];
        return fs.readdirSync(directory)
            .filter(file => /\.ya?ml$/i.test(file))
            .sort((left, right) => left.localeCompare(right, 'zh-CN'));
    }
}
exports.TeamPlanRepository = TeamPlanRepository;
