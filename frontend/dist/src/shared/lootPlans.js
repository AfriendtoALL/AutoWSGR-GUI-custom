"use strict";
/**
 * 自动战利品计划稳定标识及旧索引迁移规则。
 *
 * 旧版本只保存 planPaths 数组下标，数组调整后同一个数字会指向其他地图。
 * 当前版本改为保存系统计划文件名，文件名同时作为稳定计划标识。
 * 界面顺序可以继续调整，但不能再改变已保存配置的执行目标。
 *
 * 迁移分为三种来源：
 * 1. 当前 GUI 早期版本的 gui_settings.json 使用四项新数组；
 * 2. 旧 usersettings.yaml 默认使用 PR 前的四项数组；
 * 3. 完整旧安装优先读取其 builtin_templates.json 还原真实顺序。
 *
 * 所有迁移结果都必须落入白名单，未知值回退到默认 9-2。
 * v6 删除旧独立资源后，旧 9-4、8-5 标识按地图迁移到 old 计划。
 * 该模块只处理标识转换，不读取文件，也不负责执行计划。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_LOOT_PLAN_IDS = exports.INTERIM_LOOT_PLAN_IDS = exports.DEFAULT_LOOT_PLANS = exports.DEFAULT_LOOT_PLAN_ID = exports.LOOT_PLAN_IDS = void 0;
exports.isLootPlanId = isLootPlanId;
exports.migrateLootPlanId = migrateLootPlanId;
exports.lootAutomationPlanKey = lootAutomationPlanKey;
exports.normalizeLootAutomationPlan = normalizeLootAutomationPlan;
exports.normalizeLootAutomationPlans = normalizeLootAutomationPlans;
exports.findLootAutomationPlan = findLootAutomationPlan;
exports.parseLootPlanIndex = parseLootPlanIndex;
exports.lootPlanIdFromIndex = lootPlanIdFromIndex;
exports.lootPlanIdFromLegacyPath = lootPlanIdFromLegacyPath;
exports.LOOT_PLAN_IDS = [
    'bettle-old-9-2ADGHM速刷胖次.yaml',
    'bettle-old-8-5AI六潜胖次.yaml',
    'bettle-old-8-2BJ低耗胖次.yaml',
    'bettle-old-9-4六潜练级.yaml',
    'bettle-周常-9-2.yaml',
    'bettle-周常-7-4.yaml',
    'bettle-周常-8-2.yaml',
    'bettle-周常-2-1.yaml',
];
exports.DEFAULT_LOOT_PLAN_ID = 'bettle-周常-9-2.yaml';
const DEFAULT_LOOT_PLAN_NAMES = {
    'bettle-old-9-2ADGHM速刷胖次.yaml': 'old 9-2 ADGHM 速刷',
    'bettle-old-8-5AI六潜胖次.yaml': 'old 8-5 AI 六潜',
    'bettle-old-8-2BJ低耗胖次.yaml': 'old 8-2 BJ 低耗',
    'bettle-old-9-4六潜练级.yaml': 'old 9-4 六潜',
    'bettle-周常-9-2.yaml': '周常 9-2',
    'bettle-周常-7-4.yaml': '周常 7-4',
    'bettle-周常-8-2.yaml': '周常 8-2',
    'bettle-周常-2-1.yaml': '周常 2-1',
};
/** 首次使用沿用原有 8 项，之后由用户在加载浮窗中维护。 */
exports.DEFAULT_LOOT_PLANS = exports.LOOT_PLAN_IDS.map(file => ({
    source: 'system',
    file,
    name: DEFAULT_LOOT_PLAN_NAMES[file],
}));
/** PR 调整后的旧 GUI JSON 数组，用于一次性迁移 lootPlanIndex。 */
exports.INTERIM_LOOT_PLAN_IDS = [
    'bettle-周常-9-2.yaml',
    'bettle-周常-7-4.yaml',
    'bettle-周常-8-2.yaml',
    'bettle-周常-2-1.yaml',
];
/** PR 前四项数组，用于没有安装资源可供识别的 usersettings.yaml。 */
exports.LEGACY_LOOT_PLAN_IDS = [
    'bettle-周常-9-2.yaml',
    'bettle-周常-7-4.yaml',
    'bettle-old-8-5AI六潜胖次.yaml',
    'bettle-周常-2-1.yaml',
];
const LOOT_PLAN_ID_SET = new Set(exports.LOOT_PLAN_IDS);
const LEGACY_LOOT_PLAN_ID_MAP = {
    'bettle-捞胖次-9-4-6SS.yaml': 'bettle-old-9-4六潜练级.yaml',
    'bettle-捞胖次-8-5.yaml': 'bettle-old-8-5AI六潜胖次.yaml',
    'bettle-主库-9-2ADGHM速刷胖次.yaml': 'bettle-old-9-2ADGHM速刷胖次.yaml',
    'bettle-主库-8-5AI六潜胖次.yaml': 'bettle-old-8-5AI六潜胖次.yaml',
    'bettle-主库-8-2BJ低耗胖次.yaml': 'bettle-old-8-2BJ低耗胖次.yaml',
    'bettle-主库-9-4六潜练级.yaml': 'bettle-old-9-4六潜练级.yaml',
};
/** 判断外部值是否为当前支持的稳定计划标识。 */
function isLootPlanId(value) {
    return typeof value === 'string' && LOOT_PLAN_ID_SET.has(value);
}
/** 接受当前标识和已发布的旧标识，未知值返回 null。 */
function migrateLootPlanId(value) {
    if (isLootPlanId(value))
        return value;
    return typeof value === 'string'
        ? LEGACY_LOOT_PLAN_ID_MAP[value] ?? null
        : null;
}
/** 生成来源与文件名共同组成的稳定选择值。 */
function lootAutomationPlanKey(plan) {
    return `${plan.source}:${encodeURIComponent(plan.file)}`;
}
/** 仅接受受管目录中的 YAML 文件名。 */
function normalizeManagedPlanFile(value) {
    if (typeof value !== 'string')
        return null;
    const file = value.trim();
    if (!file
        || file.length > 255
        || /[\\/\x00-\x1f]/.test(file)
        || !/\.ya?ml$/i.test(file)) {
        return null;
    }
    return file;
}
/** 清理一项自动胖次计划，并升级已发布的旧系统文件名。 */
function normalizeLootAutomationPlan(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value;
    if (record.source !== 'system' && record.source !== 'user')
        return null;
    const rawFile = normalizeManagedPlanFile(record.file);
    if (!rawFile)
        return null;
    const file = record.source === 'system'
        ? migrateLootPlanId(rawFile) ?? rawFile
        : rawFile;
    const fallbackName = file
        .replace(/\.ya?ml$/i, '')
        .replace(/^bettle-/i, '');
    const name = typeof record.name === 'string'
        ? record.name.trim().slice(0, 100)
        : '';
    return {
        source: record.source,
        file,
        name: name || fallbackName,
    };
}
/**
 * 归一化自动胖次计划列表。
 * 非数组表示旧配置并使用默认列表；显式空数组表示用户已删除全部项目。
 */
function normalizeLootAutomationPlans(value, fallback = exports.DEFAULT_LOOT_PLANS) {
    const source = Array.isArray(value) ? value : fallback;
    const output = [];
    const seen = new Set();
    for (const item of source) {
        const normalized = normalizeLootAutomationPlan(item);
        if (!normalized)
            continue;
        const key = lootAutomationPlanKey(normalized);
        if (seen.has(key))
            continue;
        seen.add(key);
        output.push(normalized);
    }
    return output;
}
/** 在下拉列表中查找指定来源和文件名。 */
function findLootAutomationPlan(plans, source, file) {
    if ((source !== 'system' && source !== 'user')
        || typeof file !== 'string') {
        return null;
    }
    const migratedFile = source === 'system'
        ? migrateLootPlanId(file) ?? file
        : file;
    return plans.find(plan => (plan.source === source && plan.file === migratedFile)) ?? null;
}
/** 只接受整数或非空整数字符串，避免 null/false 被当成索引 0。 */
function parseLootPlanIndex(value) {
    if (typeof value !== 'number'
        && (typeof value !== 'string' || !value.trim())) {
        return null;
    }
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}
/** 按指定历史数组解释数字索引，非法或越界时交给调用方安全回退。 */
function lootPlanIdFromIndex(value, planIds) {
    const index = parseLootPlanIndex(value);
    if (index === null)
        return null;
    return planIds[index] ?? null;
}
/** 从旧模板中的路径恢复地图语义，不依赖路径所在目录。 */
function lootPlanIdFromLegacyPath(value) {
    if (typeof value !== 'string')
        return null;
    const file = value.replace(/\\/g, '/').split('/').pop() ?? '';
    if (/9-2ADGHM/i.test(file)) {
        return 'bettle-old-9-2ADGHM速刷胖次.yaml';
    }
    if (/8-2BJ/i.test(file))
        return 'bettle-old-8-2BJ低耗胖次.yaml';
    if (/9-4/i.test(file))
        return 'bettle-old-9-4六潜练级.yaml';
    if (/9-2/i.test(file))
        return 'bettle-周常-9-2.yaml';
    if (/7-4/i.test(file))
        return 'bettle-周常-7-4.yaml';
    if (/8-5/i.test(file))
        return 'bettle-old-8-5AI六潜胖次.yaml';
    if (/8-2/i.test(file))
        return 'bettle-周常-8-2.yaml';
    if (/2-1/i.test(file))
        return 'bettle-周常-2-1.yaml';
    return null;
}
