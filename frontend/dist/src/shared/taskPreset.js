"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskPresetCodec = exports.TaskPresetCodec = void 0;
const TASK_PRESET_TYPES = [
    'normal_fight',
    'event_fight',
    'campaign',
    'exercise',
    'decisive',
];
function isRecord(value) {
    return (typeof value === 'object'
        && value !== null
        && !Array.isArray(value));
}
function isTaskPresetType(value) {
    return TASK_PRESET_TYPES.some(type => type === value);
}
/** 负责独立任务预设的类型判断和字段校验。 */
class TaskPresetCodec {
    /** 含 task_type 但不含完整地图坐标的 YAML 是独立任务预设。 */
    isStandalone(root) {
        return (typeof root.task_type === 'string'
            && (!('chapter' in root) || !('map' in root)));
    }
    /** 校验已识别的独立任务预设，并保留未知业务字段。 */
    normalize(root) {
        const rawType = typeof root.task_type === 'string'
            ? root.task_type.trim().toLowerCase()
            : '';
        if (!isTaskPresetType(rawType)) {
            throw new Error(`不支持的任务预设类型：${rawType || '空'}`);
        }
        const result = {
            ...structuredClone(root),
            task_type: rawType,
        };
        this.normalizeCommonFields(result);
        if (rawType === 'normal_fight' || rawType === 'event_fight') {
            result.plan_id = this.safePlanReference(root.plan_id);
            if (root.fleet_id !== undefined) {
                result.fleet_id = this.positiveInteger(root.fleet_id, 'fleet_id');
            }
        }
        else if (rawType === 'campaign') {
            result.campaign_name = this.nonEmptyText(root.campaign_name, 'campaign_name');
            this.normalizeBattleOptions(result, root);
        }
        else if (rawType === 'exercise') {
            result.fleet_id = this.integerInRange(root.fleet_id, 'fleet_id', 1, 4);
            this.normalizeBattleOptions(result, root);
        }
        else {
            result.chapter = this.positiveInteger(root.chapter, 'chapter');
            result.level1 = this.shipNames(root.level1, 'level1');
            result.level2 = this.shipNames(root.level2, 'level2');
            if (root.flagship_priority !== undefined) {
                result.flagship_priority = this.shipNames(root.flagship_priority, 'flagship_priority');
            }
            if (root.use_quick_repair !== undefined
                && typeof root.use_quick_repair !== 'boolean') {
                throw new Error('use_quick_repair 必须是布尔值');
            }
        }
        return result;
    }
    /** 阵型（1-5）与修理策略（1=中破就修 2=大破才修）；缺省表示沿用后端默认。 */
    normalizeBattleOptions(result, root) {
        if (root.formation !== undefined) {
            result.formation = this.integerInRange(root.formation, 'formation', 1, 5);
        }
        if (root.repair_mode !== undefined) {
            result.repair_mode = this.integerInRange(root.repair_mode, 'repair_mode', 1, 2);
        }
    }
    normalizeCommonFields(result) {
        if (result.times !== undefined) {
            result.times = this.positiveInteger(result.times, 'times');
        }
        if (result.gap !== undefined) {
            if (typeof result.gap !== 'number'
                || !Number.isFinite(result.gap)
                || result.gap < 0) {
                throw new Error('gap 必须是大于或等于 0 的数字');
            }
        }
        if (result.stop_condition !== undefined) {
            result.stop_condition = this.stopCondition(result.stop_condition);
        }
        if (result.scheduled_time !== undefined
            && (typeof result.scheduled_time !== 'string'
                || !result.scheduled_time.trim())) {
            throw new Error('scheduled_time 必须是非空字符串');
        }
    }
    /** 独立任务预设不能保留任意绝对路径或目录跳转。 */
    safePlanReference(value) {
        const reference = this.nonEmptyText(value, 'plan_id');
        if (/^[A-Za-z]:[/\\]/.test(reference)
            || reference.startsWith('/')
            || reference.startsWith('\\\\')
            || reference.split(/[\\/]/).includes('..')) {
            throw new Error('plan_id 不能引用受管目录外的路径');
        }
        return reference;
    }
    nonEmptyText(value, field) {
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`${field} 必须是非空字符串`);
        }
        return value.trim();
    }
    positiveInteger(value, field) {
        if (!Number.isInteger(value) || Number(value) < 1) {
            throw new Error(`${field} 必须是大于或等于 1 的整数`);
        }
        return Number(value);
    }
    integerInRange(value, field, minimum, maximum) {
        const result = this.positiveInteger(value, field);
        if (result < minimum || result > maximum) {
            throw new Error(`${field} 必须是 ${minimum} 到 ${maximum}`);
        }
        return result;
    }
    shipNames(value, field) {
        if (!Array.isArray(value)) {
            throw new Error(`${field} 必须是舰名列表`);
        }
        return value.map((item, index) => {
            if (typeof item !== 'string' || !item.trim()) {
                throw new Error(`${field}[${index}] 必须是非空舰名`);
            }
            return item.trim();
        });
    }
    stopCondition(value) {
        if (!isRecord(value)) {
            throw new Error('stop_condition 必须是对象');
        }
        const result = {};
        for (const field of ['loot_count_ge', 'ship_count_ge']) {
            const count = value[field];
            if (count === undefined)
                continue;
            if (!Number.isInteger(count) || Number(count) < 0) {
                throw new Error(`stop_condition.${field} 必须是大于或等于 0 的整数`);
            }
            result[field] = Number(count);
        }
        if (value.level_slot !== undefined) {
            const slot = value.level_slot;
            if (!Number.isInteger(slot) || Number(slot) < 0 || Number(slot) > 5) {
                throw new Error('stop_condition.level_slot 必须是 0 到 5 的整数');
            }
            result.level_slot = Number(slot);
        }
        if (value.level_ge !== undefined) {
            const level = value.level_ge;
            if (!Number.isInteger(level) || Number(level) < 1 || Number(level) > 125) {
                throw new Error('stop_condition.level_ge 必须是 1 到 125 的整数');
            }
            result.level_ge = Number(level);
        }
        return result;
    }
}
exports.TaskPresetCodec = TaskPresetCodec;
exports.taskPresetCodec = new TaskPresetCodec();
