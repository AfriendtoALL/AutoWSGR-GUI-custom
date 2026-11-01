"use strict";
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
  "bettle-old-9-2ADGHM\u901F\u5237\u80D6\u6B21.yaml",
  "bettle-old-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml",
  "bettle-old-8-2BJ\u4F4E\u8017\u80D6\u6B21.yaml",
  "bettle-old-9-4\u516D\u6F5C\u7EC3\u7EA7.yaml",
  "bettle-\u5468\u5E38-9-2.yaml",
  "bettle-\u5468\u5E38-7-4.yaml",
  "bettle-\u5468\u5E38-8-2.yaml",
  "bettle-\u5468\u5E38-2-1.yaml"
];
exports.DEFAULT_LOOT_PLAN_ID = "bettle-\u5468\u5E38-9-2.yaml";
var DEFAULT_LOOT_PLAN_NAMES = {
  "bettle-old-9-2ADGHM\u901F\u5237\u80D6\u6B21.yaml": "old 9-2 ADGHM \u901F\u5237",
  "bettle-old-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml": "old 8-5 AI \u516D\u6F5C",
  "bettle-old-8-2BJ\u4F4E\u8017\u80D6\u6B21.yaml": "old 8-2 BJ \u4F4E\u8017",
  "bettle-old-9-4\u516D\u6F5C\u7EC3\u7EA7.yaml": "old 9-4 \u516D\u6F5C",
  "bettle-\u5468\u5E38-9-2.yaml": "\u5468\u5E38 9-2",
  "bettle-\u5468\u5E38-7-4.yaml": "\u5468\u5E38 7-4",
  "bettle-\u5468\u5E38-8-2.yaml": "\u5468\u5E38 8-2",
  "bettle-\u5468\u5E38-2-1.yaml": "\u5468\u5E38 2-1"
};
exports.DEFAULT_LOOT_PLANS = exports.LOOT_PLAN_IDS.map((file) => ({
  source: "system",
  file,
  name: DEFAULT_LOOT_PLAN_NAMES[file]
}));
exports.INTERIM_LOOT_PLAN_IDS = [
  "bettle-\u5468\u5E38-9-2.yaml",
  "bettle-\u5468\u5E38-7-4.yaml",
  "bettle-\u5468\u5E38-8-2.yaml",
  "bettle-\u5468\u5E38-2-1.yaml"
];
exports.LEGACY_LOOT_PLAN_IDS = [
  "bettle-\u5468\u5E38-9-2.yaml",
  "bettle-\u5468\u5E38-7-4.yaml",
  "bettle-old-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml",
  "bettle-\u5468\u5E38-2-1.yaml"
];
var LOOT_PLAN_ID_SET = new Set(exports.LOOT_PLAN_IDS);
var LEGACY_LOOT_PLAN_ID_MAP = {
  "bettle-\u635E\u80D6\u6B21-9-4-6SS.yaml": "bettle-old-9-4\u516D\u6F5C\u7EC3\u7EA7.yaml",
  "bettle-\u635E\u80D6\u6B21-8-5.yaml": "bettle-old-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml",
  "bettle-\u4E3B\u5E93-9-2ADGHM\u901F\u5237\u80D6\u6B21.yaml": "bettle-old-9-2ADGHM\u901F\u5237\u80D6\u6B21.yaml",
  "bettle-\u4E3B\u5E93-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml": "bettle-old-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml",
  "bettle-\u4E3B\u5E93-8-2BJ\u4F4E\u8017\u80D6\u6B21.yaml": "bettle-old-8-2BJ\u4F4E\u8017\u80D6\u6B21.yaml",
  "bettle-\u4E3B\u5E93-9-4\u516D\u6F5C\u7EC3\u7EA7.yaml": "bettle-old-9-4\u516D\u6F5C\u7EC3\u7EA7.yaml"
};
function isLootPlanId(value) {
  return typeof value === "string" && LOOT_PLAN_ID_SET.has(value);
}
function migrateLootPlanId(value) {
  if (isLootPlanId(value))
    return value;
  return typeof value === "string" ? LEGACY_LOOT_PLAN_ID_MAP[value] ?? null : null;
}
function lootAutomationPlanKey(plan) {
  return `${plan.source}:${encodeURIComponent(plan.file)}`;
}
function normalizeManagedPlanFile(value) {
  if (typeof value !== "string")
    return null;
  const file = value.trim();
  if (!file || file.length > 255 || /[\\/\x00-\x1f]/.test(file) || !/\.ya?ml$/i.test(file)) {
    return null;
  }
  return file;
}
function normalizeLootAutomationPlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value;
  if (record.source !== "system" && record.source !== "user")
    return null;
  const rawFile = normalizeManagedPlanFile(record.file);
  if (!rawFile)
    return null;
  const file = record.source === "system" ? migrateLootPlanId(rawFile) ?? rawFile : rawFile;
  const fallbackName = file.replace(/\.ya?ml$/i, "").replace(/^bettle-/i, "");
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 100) : "";
  return {
    source: record.source,
    file,
    name: name || fallbackName
  };
}
function normalizeLootAutomationPlans(value, fallback = exports.DEFAULT_LOOT_PLANS) {
  const source = Array.isArray(value) ? value : fallback;
  const output = [];
  const seen = /* @__PURE__ */ new Set();
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
function findLootAutomationPlan(plans, source, file) {
  if (source !== "system" && source !== "user" || typeof file !== "string") {
    return null;
  }
  const migratedFile = source === "system" ? migrateLootPlanId(file) ?? file : file;
  return plans.find((plan) => plan.source === source && plan.file === migratedFile) ?? null;
}
function parseLootPlanIndex(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
function lootPlanIdFromIndex(value, planIds) {
  const index = parseLootPlanIndex(value);
  if (index === null)
    return null;
  return planIds[index] ?? null;
}
function lootPlanIdFromLegacyPath(value) {
  if (typeof value !== "string")
    return null;
  const file = value.replace(/\\/g, "/").split("/").pop() ?? "";
  if (/9-2ADGHM/i.test(file)) {
    return "bettle-old-9-2ADGHM\u901F\u5237\u80D6\u6B21.yaml";
  }
  if (/8-2BJ/i.test(file))
    return "bettle-old-8-2BJ\u4F4E\u8017\u80D6\u6B21.yaml";
  if (/9-4/i.test(file))
    return "bettle-old-9-4\u516D\u6F5C\u7EC3\u7EA7.yaml";
  if (/9-2/i.test(file))
    return "bettle-\u5468\u5E38-9-2.yaml";
  if (/7-4/i.test(file))
    return "bettle-\u5468\u5E38-7-4.yaml";
  if (/8-5/i.test(file))
    return "bettle-old-8-5AI\u516D\u6F5C\u80D6\u6B21.yaml";
  if (/8-2/i.test(file))
    return "bettle-\u5468\u5E38-8-2.yaml";
  if (/2-1/i.test(file))
    return "bettle-\u5468\u5E38-2-1.yaml";
  return null;
}