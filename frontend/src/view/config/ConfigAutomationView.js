"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigAutomationView = void 0;
var lootPlans_js_1 = require_lootPlans();
var normalFightQuota_js_1 = require_normalFightQuota();
var settingSelectWidth_1 = require_settingSelectWidth();
function element(id) {
  const target = document.getElementById(id);
  if (!target)
    throw new Error(`\u8BBE\u7F6E\u63A7\u4EF6\u4E0D\u5B58\u5728: ${id}`);
  return target;
}
var ConfigAutomationView = class {
  constructor() {
    this.normalFightTaskList = element("cfg-normal-fight-tasks");
    this.lootPlan = element("cfg-loot-plan");
    this.normalFightTasks = [];
    this.normalFightRemaining = null;
    this.normalFightFleetNames = /* @__PURE__ */ new Map();
    this.lootPlans = [];
    this.lootPlan.addEventListener("change", () => this.updateLootPlanSelect());
  }
  showNormalFightTasks(tasks, remaining) {
    this.normalFightTasks = structuredClone([...tasks]);
    this.normalFightRemaining = remaining;
    this.normalFightFleetNames.clear();
    this.renderNormalFightTasks();
  }
  setNormalFightPlan(task, fleetName, remaining) {
    this.normalFightTasks = [structuredClone(task)];
    this.normalFightRemaining = Math.max(0, Math.trunc(remaining));
    this.normalFightFleetNames.clear();
    this.normalFightFleetNames.set(this.normalFightFleetKey(task.name, task.fleet_preset_index ?? 0), fleetName);
    this.renderNormalFightTasks();
  }
  getNormalFightTasks() {
    return structuredClone(this.normalFightTasks);
  }
  getNormalFightRemaining() {
    return this.normalFightRemaining;
  }
  setNormalFightRemaining(tasks, remaining) {
    const signature = (task) => JSON.stringify([
      (0, normalFightQuota_js_1.normalFightTaskKey)(task),
      (0, normalFightQuota_js_1.normalFightDailyLimit)(task.times)
    ]);
    if (JSON.stringify(this.normalFightTasks.map(signature)) !== JSON.stringify(tasks.map(signature))) {
      return;
    }
    this.normalFightRemaining = Math.max(0, Math.trunc(remaining));
    this.renderNormalFightTasks();
  }
  showLootPlans(plans, source, file) {
    this.lootPlans = (0, lootPlans_js_1.normalizeLootAutomationPlans)(plans, []);
    this.renderLootPlanOptions(source, file);
  }
  getLootPlans() {
    return structuredClone(this.lootPlans);
  }
  setLootPlans(plans) {
    const selected = this.selectedLootPlan();
    this.lootPlans = (0, lootPlans_js_1.normalizeLootAutomationPlans)(plans, []);
    this.renderLootPlanOptions(selected?.source, selected?.file);
  }
  hasLootPlans() {
    return this.lootPlans.length > 0;
  }
  selectedLootPlan() {
    return this.lootPlans.find((plan) => (0, lootPlans_js_1.lootAutomationPlanKey)(plan) === this.lootPlan.value) ?? null;
  }
  renderNormalFightTasks() {
    this.normalFightTaskList.replaceChildren();
    const primaryTask = this.normalFightTasks[0];
    if (!primaryTask) {
      const empty = document.createElement("span");
      empty.className = "config-empty-note";
      empty.textContent = "\u5C1A\u672A\u52A0\u8F7D\u8BA1\u5212";
      this.normalFightTaskList.append(empty);
      return;
    }
    const fileName = primaryTask.name.split(/[\\/]/).pop() ?? primaryTask.name;
    const displayName = fileName.replace(/\.ya?ml$/i, "").replace(/^bettle-/i, "");
    const name = document.createElement("span");
    name.className = "config-task-name";
    name.title = this.normalFightTasks.map((task) => task.name).join("\n");
    name.textContent = this.normalFightTasks.length > 1 ? `${displayName} \u7B49 ${this.normalFightTasks.length} \u4E2A\u4EFB\u52A1` : displayName;
    this.normalFightTaskList.append(name);
    const remaining = document.createElement("span");
    remaining.className = "config-task-remaining";
    remaining.textContent = `\u4ECA\u65E5\u5269\u4F59\u6267\u884C\u6B21\u6570\uFF1A${this.normalFightRemaining ?? 0}`;
    this.normalFightTaskList.append(remaining);
    if (primaryTask.fleet_preset_index == null)
      return;
    const fleetIndex = primaryTask.fleet_preset_index;
    const fleetName = this.normalFightFleetNames.get(this.normalFightFleetKey(primaryTask.name, fleetIndex)) ?? `\u961F\u4F0D ${fleetIndex + 1}`;
    const fleetTag = document.createElement("span");
    fleetTag.className = "tg-fleet-tag";
    fleetTag.textContent = fleetName;
    fleetTag.title = `\u4F7F\u7528\u961F\u4F0D\uFF1A${fleetName}`;
    this.normalFightTaskList.append(fleetTag);
  }
  normalFightFleetKey(path, fleetPresetIndex) {
    return `${path.toLowerCase()}\0${fleetPresetIndex}`;
  }
  renderLootPlanOptions(source, file) {
    const selected = (0, lootPlans_js_1.findLootAutomationPlan)(this.lootPlans, source, file) ?? this.lootPlans[0] ?? null;
    this.lootPlan.replaceChildren(...this.lootPlans.map((plan) => {
      const option = document.createElement("option");
      option.value = (0, lootPlans_js_1.lootAutomationPlanKey)(plan);
      option.textContent = plan.name;
      option.title = `${plan.name} (${plan.file})`;
      return option;
    }));
    this.lootPlan.disabled = this.lootPlans.length === 0;
    this.lootPlan.value = selected ? (0, lootPlans_js_1.lootAutomationPlanKey)(selected) : "";
    this.updateLootPlanSelect();
  }
  updateLootPlanSelect() {
    const option = this.lootPlan.selectedOptions[0];
    this.lootPlan.title = option?.title || option?.textContent?.trim() || "\u4EFB\u52A1\u9884\u8BBE";
    (0, settingSelectWidth_1.updateSettingSelectWidth)(this.lootPlan);
  }
};
exports.ConfigAutomationView = ConfigAutomationView;