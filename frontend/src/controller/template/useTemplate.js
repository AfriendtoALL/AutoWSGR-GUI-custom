"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTemplateFlow = useTemplateFlow;
exports.addPlanToTaskList = addPlanToTaskList;
var Logger_1 = require_Logger();
async function useTemplateFlow(id, templateModel, taskGroupModel, renderTaskGroup, callbacks) {
  const tpl = templateModel.get(id);
  if (!tpl)
    return;
  let group = taskGroupModel.getActiveGroup();
  if (!group) {
    taskGroupModel.upsertGroup("\u9ED8\u8BA4");
    taskGroupModel.setActiveGroup("\u9ED8\u8BA4");
    group = taskGroupModel.getActiveGroup();
  }
  if (tpl.type === "normal_fight" || tpl.type === "event_fight") {
    const paths = tpl.planPaths ?? (tpl.planPath ? [tpl.planPath] : []);
    if (paths.length === 0) {
      Logger_1.Logger.warn(`\u6A21\u677F\u300C${tpl.name}\u300D\u7F3A\u5C11\u65B9\u6848\u6587\u4EF6\u8DEF\u5F84`);
      return;
    }
    if (paths.length === 1) {
      addPlanToTaskList(tpl, paths[0], group.name, taskGroupModel);
    } else {
      callbacks.showPlanSelector(tpl, paths, group.name);
      return;
    }
  } else if (tpl.type === "campaign") {
    callbacks.showCampaignSelector(tpl, group.name);
    return;
  } else if (tpl.type === "exercise") {
    callbacks.showExerciseFleetSelector(tpl, group.name);
    return;
  } else if (tpl.type === "decisive") {
    callbacks.showDecisiveChapterSelector(tpl, group.name);
    return;
  } else {
    taskGroupModel.addItem(group.name, {
      templateId: tpl.id,
      kind: "template",
      times: tpl.defaultTimes ?? 1,
      label: tpl.name
    });
  }
  taskGroupModel.save();
  renderTaskGroup();
  Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u2192 \u5DF2\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${group.name}\u300D`);
}
function addPlanToTaskList(tpl, planPath, groupName, taskGroupModel, fleetPresetIndex, presetName, fleetId) {
  const planName = planPath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? tpl.name;
  const label = presetName ? `${tpl.name} (${planName} \xB7 ${presetName})` : `${tpl.name} (${planName})`;
  taskGroupModel.addItem(groupName, {
    path: planPath,
    kind: "plan",
    times: tpl.defaultTimes ?? 1,
    label,
    fleetPresetIndex,
    fleet_id: fleetId,
    forceRetry: tpl.forceRetry,
    allowPolling: tpl.allowPolling
  });
}