"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addManagedPlanToGroup = addManagedPlanToGroup;
exports.addDailyPlanToGroup = addDailyPlanToGroup;
exports.addCurrentPlanToGroup = addCurrentPlanToGroup;
exports.addPresetToGroup = addPresetToGroup;
var Logger_1 = require_Logger();
var IpcAdapter_1 = require_IpcAdapter();
function buildInlinePlanPath(plan, plansDir) {
  const safeMap = plan.mapName.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const fileName = `_ui_inline_${safeMap}_${ts}.yaml`;
  return plansDir ? `${plansDir}\\${fileName}` : fileName;
}
function ensureActiveGroup(taskGroupModel) {
  let group = taskGroupModel.getActiveGroup();
  if (!group) {
    taskGroupModel.upsertGroup("\u9ED8\u8BA4");
    taskGroupModel.setActiveGroup("\u9ED8\u8BA4");
    group = taskGroupModel.getActiveGroup();
  }
  return group;
}
function addManagedPlanToGroup(taskGroupModel, plan, fleetPresetIndex, render) {
  const group = ensureActiveGroup(taskGroupModel);
  taskGroupModel.addItem(group.name, {
    managedSource: plan.source,
    managedFile: plan.file,
    kind: plan.kind === "preset" ? "preset" : "plan",
    times: Math.max(1, plan.times || 1),
    label: plan.name,
    fleetPresetIndex
  });
  void taskGroupModel.save();
  render();
  Logger_1.Logger.info(`\u5DF2\u5C06\u300C${plan.name}\u300D\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${group.name}\u300D`);
}
function addDailyPlanToGroup(taskGroupModel, selection, render) {
  const group = ensureActiveGroup(taskGroupModel);
  const { plan } = selection;
  taskGroupModel.addItem(group.name, {
    dailySource: plan.source,
    dailyFile: plan.file,
    dailyTaskType: plan.taskType,
    kind: "daily",
    times: plan.taskType === "exercise" ? 1 : Math.max(1, selection.times),
    label: plan.name,
    chapter: plan.chapter,
    useQuickRepair: plan.taskType === "decisive" ? selection.useQuickRepair !== false : void 0
  });
  void taskGroupModel.save();
  render();
  Logger_1.Logger.info(`\u5DF2\u5C06\u65E5\u5E38\u4EFB\u52A1\u300C${plan.name}\u300D\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${group.name}\u300D`);
}
async function addCurrentPlanToGroup(taskGroupModel, getCurrentPlan, plansDir, render, repository = (0, IpcAdapter_1.getPlansGateway)()) {
  const plan = getCurrentPlan();
  if (!plan) {
    Logger_1.Logger.warn("\u6CA1\u6709\u5DF2\u52A0\u8F7D\u7684\u65B9\u6848");
    return;
  }
  if (!repository)
    return;
  let fileName = plan.fileName?.trim();
  if (!fileName) {
    fileName = buildInlinePlanPath(plan, plansDir);
    plan.fileName = fileName;
    Logger_1.Logger.warn(`\u5F53\u524D\u65B9\u6848\u672A\u4FDD\u5B58\uFF0C\u5DF2\u81EA\u52A8\u4FDD\u5B58\u4E3A\u4E34\u65F6\u65B9\u6848: ${fileName}`);
  }
  await repository.saveFile(fileName, plan.toYaml());
  const group = ensureActiveGroup(taskGroupModel);
  const times = plan.data.times ?? 1;
  const label = fileName.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? fileName;
  taskGroupModel.addItem(group.name, { path: fileName, kind: "plan", times, label });
  taskGroupModel.save();
  render();
  Logger_1.Logger.info(`\u5DF2\u5C06\u300C${label} \xD7${times}\u300D\u52A0\u5165\u4EFB\u52A1\u7EC4\u300C${group.name}\u300D`);
}
function addPresetToGroup(taskGroupModel, getCurrentPresetInfo, times, render) {
  const info = getCurrentPresetInfo();
  if (!info) {
    Logger_1.Logger.warn("\u6CA1\u6709\u5DF2\u52A0\u8F7D\u7684\u4EFB\u52A1\u9884\u8BBE");
    return;
  }
  const group = ensureActiveGroup(taskGroupModel);
  const normalizedTimes = Math.max(1, Math.trunc(times) || 1);
  const label = info.filePath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? info.preset.task_type;
  taskGroupModel.addItem(group.name, {
    path: info.filePath,
    managedSource: info.source,
    kind: "preset",
    times: normalizedTimes,
    label
  });
  taskGroupModel.save();
  render();
  Logger_1.Logger.info(`\u5DF2\u5C06\u300C${label} \xD7${normalizedTimes}\u300D\u52A0\u5165\u4EFB\u52A1\u7EC4\u300C${group.name}\u300D`);
}