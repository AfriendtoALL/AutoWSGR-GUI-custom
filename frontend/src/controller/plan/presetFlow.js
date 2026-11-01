"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importTaskPresetFlow = importTaskPresetFlow;
exports.showPresetDetailFlow = showPresetDetailFlow;
exports.closePresetDetailFlow = closePresetDetailFlow;
exports.executePresetFlow = executePresetFlow;
var scheduler_1 = require_scheduler2();
var TemplateController_1 = require_TemplateController();
var Logger_1 = require_Logger();
var shipNameNormalizer_js_1 = require_shipNameNormalizer();
function importTaskPresetFlow(preset, filePath, planView, host, state, source = "user") {
  if (preset.plan_id && !/^[A-Za-z]:[/\\]/.test(preset.plan_id) && !preset.plan_id.startsWith("/")) {
    const dir = filePath.replace(/[\\/][^\\/]+$/, "");
    preset.plan_id = dir + "\\" + preset.plan_id.replace(/\//g, "\\");
  }
  showPresetDetailFlow(preset, filePath, planView, state, source);
  host.switchPage("plan");
}
function showPresetDetailFlow(preset, filePath, planView, state, source = "user") {
  state.currentPreset = preset;
  state.currentPresetFilePath = filePath;
  state.currentPresetSource = source;
  const name = filePath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? preset.task_type;
  const typeLabel = TemplateController_1.TemplateController.TEMPLATE_TYPE_LABELS[preset.task_type] ?? preset.task_type;
  planView.showPresetDetail();
  planView.fillPresetDetailForm({
    name,
    typeLabel,
    taskType: preset.task_type,
    fleetId: preset.fleet_id,
    exerciseFleetId: preset.fleet_id,
    campaignName: preset.campaign_name,
    chapter: preset.chapter,
    level1: preset.level1,
    level2: preset.level2,
    flagshipPriority: preset.flagship_priority,
    useQuickRepair: preset.use_quick_repair,
    planId: preset.plan_id,
    times: preset.times
  });
}
function closePresetDetailFlow(planView, state) {
  state.currentPreset = null;
  state.currentPresetFilePath = "";
  state.currentPresetSource = "user";
  planView.hidePresetDetail();
}
function executePresetFlow(planView, host, state, ships = []) {
  const preset = state.currentPreset;
  if (!preset)
    return;
  const name = state.currentPresetFilePath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? preset.task_type;
  let req;
  const formVals = planView.collectPresetFormValues();
  const times = formVals.times;
  switch (preset.task_type) {
    case "exercise":
      req = { type: "exercise", fleet_id: formVals.exerciseFleetId };
      break;
    case "campaign":
      req = { type: "campaign", campaign_name: formVals.campaignName, times: 1 };
      break;
    case "decisive": {
      const isSystemPreset = state.currentPresetSource === "system";
      const shipNames = (0, shipNameNormalizer_js_1.toBackendDecisiveShipNames)({
        level1: formVals.level1,
        level2: formVals.level2,
        flagship_priority: formVals.flagshipPriority
      }, isSystemPreset ? void 0 : ships);
      req = {
        type: "decisive",
        chapter: formVals.chapter,
        ...shipNames,
        use_quick_repair: formVals.useQuickRepair
      };
      break;
    }
    case "event_fight":
      req = {
        type: "event_fight",
        plan_id: formVals.planId,
        times: 1,
        gap: preset.gap ?? 0,
        fleet_id: formVals.fightFleetId || null
      };
      break;
    case "normal_fight":
    default:
      req = { type: "normal_fight", plan_id: formVals.planId, times: 1, gap: preset.gap ?? 0 };
      break;
  }
  const effectiveTimes = preset.task_type === "exercise" ? 1 : times;
  const stopCondition = preset.stop_condition;
  host.scheduler.addTask(name, preset.task_type, req, scheduler_1.TaskPriority.USER_TASK, effectiveTimes, stopCondition, void 0, void 0);
  closePresetDetailFlow(planView, state);
  host.switchPage("main");
  host.renderMain();
  const parts = [];
  if (effectiveTimes > 1 || stopCondition)
    parts.push(`\xD7${effectiveTimes}`);
  if (stopCondition?.loot_count_ge)
    parts.push(`\u6218\u5229\u54C1\u2265${stopCondition.loot_count_ge}\u65F6\u505C\u6B62`);
  if (stopCondition?.ship_count_ge)
    parts.push(`\u8230\u8239\u2265${stopCondition.ship_count_ge}\u65F6\u505C\u6B62`);
  if (stopCondition?.level_ge)
    parts.push(`${stopCondition.level_slot === 0 ? "\u65D7\u8230" : `${(stopCondition.level_slot ?? 0) + 1}\u53F7\u4F4D`}\u7B49\u7EA7\u2265${stopCondition.level_ge}\u65F6\u505C\u6B62`);
  Logger_1.Logger.info(`\u4EFB\u52A1\u300C${name}\u300D\u5DF2\u52A0\u5165\u961F\u5217${parts.length ? " (" + parts.join(", ") + ")" : ""}`);
}