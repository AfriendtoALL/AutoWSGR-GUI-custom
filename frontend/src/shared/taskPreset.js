"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskPresetCodec = exports.TaskPresetCodec = void 0;
var TASK_PRESET_TYPES = [
  "normal_fight",
  "event_fight",
  "campaign",
  "exercise",
  "decisive"
];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTaskPresetType(value) {
  return TASK_PRESET_TYPES.some((type) => type === value);
}
var TaskPresetCodec = class {
  /** 含 task_type 但不含完整地图坐标的 YAML 是独立任务预设。 */
  isStandalone(root) {
    return typeof root.task_type === "string" && (!("chapter" in root) || !("map" in root));
  }
  /** 校验已识别的独立任务预设，并保留未知业务字段。 */
  normalize(root) {
    const rawType = typeof root.task_type === "string" ? root.task_type.trim().toLowerCase() : "";
    if (!isTaskPresetType(rawType)) {
      throw new Error(`\u4E0D\u652F\u6301\u7684\u4EFB\u52A1\u9884\u8BBE\u7C7B\u578B\uFF1A${rawType || "\u7A7A"}`);
    }
    const result = {
      ...structuredClone(root),
      task_type: rawType
    };
    this.normalizeCommonFields(result);
    if (rawType === "normal_fight" || rawType === "event_fight") {
      result.plan_id = this.safePlanReference(root.plan_id);
      if (root.fleet_id !== void 0) {
        result.fleet_id = this.positiveInteger(root.fleet_id, "fleet_id");
      }
    } else if (rawType === "campaign") {
      result.campaign_name = this.nonEmptyText(root.campaign_name, "campaign_name");
    } else if (rawType === "exercise") {
      result.fleet_id = this.integerInRange(root.fleet_id, "fleet_id", 1, 4);
    } else {
      result.chapter = this.positiveInteger(root.chapter, "chapter");
      result.level1 = this.shipNames(root.level1, "level1");
      result.level2 = this.shipNames(root.level2, "level2");
      if (root.flagship_priority !== void 0) {
        result.flagship_priority = this.shipNames(root.flagship_priority, "flagship_priority");
      }
      if (root.use_quick_repair !== void 0 && typeof root.use_quick_repair !== "boolean") {
        throw new Error("use_quick_repair \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
      }
    }
    return result;
  }
  normalizeCommonFields(result) {
    if (result.times !== void 0) {
      result.times = this.positiveInteger(result.times, "times");
    }
    if (result.gap !== void 0) {
      if (typeof result.gap !== "number" || !Number.isFinite(result.gap) || result.gap < 0) {
        throw new Error("gap \u5FC5\u987B\u662F\u5927\u4E8E\u6216\u7B49\u4E8E 0 \u7684\u6570\u5B57");
      }
    }
    if (result.stop_condition !== void 0) {
      result.stop_condition = this.stopCondition(result.stop_condition);
    }
    // 7.4/R28：定时方案已下线，任务预设不再接受 scheduled_time。
    delete result.scheduled_time;
  }
  /** 独立任务预设不能保留任意绝对路径或目录跳转。 */
  safePlanReference(value) {
    const reference = this.nonEmptyText(value, "plan_id");
    if (/^[A-Za-z]:[/\\]/.test(reference) || reference.startsWith("/") || reference.startsWith("\\\\") || reference.split(/[\\/]/).includes("..")) {
      throw new Error("plan_id \u4E0D\u80FD\u5F15\u7528\u53D7\u7BA1\u76EE\u5F55\u5916\u7684\u8DEF\u5F84");
    }
    return reference;
  }
  nonEmptyText(value, field) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
    }
    return value.trim();
  }
  positiveInteger(value, field) {
    if (!Number.isInteger(value) || Number(value) < 1) {
      throw new Error(`${field} \u5FC5\u987B\u662F\u5927\u4E8E\u6216\u7B49\u4E8E 1 \u7684\u6574\u6570`);
    }
    return Number(value);
  }
  integerInRange(value, field, minimum, maximum) {
    const result = this.positiveInteger(value, field);
    if (result < minimum || result > maximum) {
      throw new Error(`${field} \u5FC5\u987B\u662F ${minimum} \u5230 ${maximum}`);
    }
    return result;
  }
  shipNames(value, field) {
    if (!Array.isArray(value)) {
      throw new Error(`${field} \u5FC5\u987B\u662F\u8230\u540D\u5217\u8868`);
    }
    return value.map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        throw new Error(`${field}[${index}] \u5FC5\u987B\u662F\u975E\u7A7A\u8230\u540D`);
      }
      return item.trim();
    });
  }
  stopCondition(value) {
    if (!isRecord(value)) {
      throw new Error("stop_condition \u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const result = {};
    for (const field of ["loot_count_ge", "ship_count_ge"]) {
      const count = value[field];
      if (count === void 0)
        continue;
      if (!Number.isInteger(count) || Number(count) < 0) {
        throw new Error(`stop_condition.${field} \u5FC5\u987B\u662F\u5927\u4E8E\u6216\u7B49\u4E8E 0 \u7684\u6574\u6570`);
      }
      result[field] = Number(count);
    }
    if (value.level_slot !== void 0) {
      const slot = value.level_slot;
      if (!Number.isInteger(slot) || Number(slot) < 0 || Number(slot) > 5) {
        throw new Error("stop_condition.level_slot \u5FC5\u987B\u662F 0 \u5230 5 \u7684\u6574\u6570");
      }
      result.level_slot = Number(slot);
    }
    if (value.level_ge !== void 0) {
      const level = value.level_ge;
      if (!Number.isInteger(level) || Number(level) < 1 || Number(level) > 125) {
        throw new Error("stop_condition.level_ge \u5FC5\u987B\u662F 1 \u5230 125 \u7684\u6574\u6570");
      }
      result.level_ge = Number(level);
    }
    return result;
  }
};
exports.TaskPresetCodec = TaskPresetCodec;
exports.taskPresetCodec = new TaskPresetCodec();