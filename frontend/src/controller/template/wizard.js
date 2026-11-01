"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showWizard = showWizard;
/** 6.2/R18：编队预设里的船名同样来自方案文件，拼 HTML 前先转义。 */
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
exports.showWizardWithTemplate = showWizardWithTemplate;
exports.wizardNav = wizardNav;
exports.finishWizard = finishWizard;
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
function showWizard(wizardView, wizardPlanPaths, editingTemplateId) {
  wizardPlanPaths.value = [];
  editingTemplateId.value = null;
  wizardView.show("\u521B\u5EFA\u6A21\u677F");
}
function showWizardWithTemplate(tpl, wizardView, wizardPlanPaths) {
  wizardView.show("\u5BFC\u5165\u6A21\u677F");
  const planPaths = tpl.planPaths?.length ? [...tpl.planPaths] : tpl.planPath ? [tpl.planPath] : [];
  wizardPlanPaths.value = planPaths;
  if (planPaths.length > 0) {
    wizardView.renderPlanList(planPaths);
  }
  wizardView.prefill(tpl);
  wizardView.setStep(2);
}
function wizardNav(dir, wizardView, finishCallback) {
  const step = wizardView.getStep();
  if (step === 3 && dir === 1) {
    finishCallback();
    return;
  }
  const next = step + dir;
  if (next < 1 || next > 3)
    return;
  wizardView.setStep(next);
}
async function finishWizard(wizardView, templateModel, wizardPlanPaths, editingTemplateId, renderLibrary) {
  const form = wizardView.collectForm();
  const type = form.type;
  const name = form.name;
  if (!name) {
    wizardView.focusName();
    return;
  }
  const times = form.defaultTimes;
  let stopCondition;
  if (type !== "decisive") {
    const loot = form.stopLoot;
    const ship = form.stopShip;
    const levelGe = form.stopLevelGe;
    const levelSlot = form.stopLevelSlot;
    const levelEnabled = type !== "exercise" && levelGe > 0 && Number.isInteger(levelSlot) && levelSlot >= 0 && levelSlot <= 5;
    stopCondition = loot > 0 || ship > 0 || levelEnabled ? {
      ...loot > 0 ? { loot_count_ge: loot } : {},
      ...ship > 0 ? { ship_count_ge: ship } : {},
      ...levelEnabled ? { level_slot: levelSlot, level_ge: levelGe } : {}
    } : void 0;
  }
  const partial = {
    name,
    type,
    defaultTimes: times,
    defaultStopCondition: stopCondition
  };
  switch (type) {
    case "normal_fight":
    case "event_fight": {
      if (wizardPlanPaths.length === 0) {
        const planPath = form.planPath;
        if (!planPath) {
          wizardView.setStep(2);
          return;
        }
        wizardPlanPaths.push(planPath);
      }
      partial.planPaths = [...wizardPlanPaths];
      partial.planPath = wizardPlanPaths[0];
      partial.fleet_id = form.fleetId;
      partial.fleet = form.fleetNf;
      break;
    }
    case "exercise":
      partial.fleet_id = form.exerciseFleetId;
      partial.fleet = form.fleetEx;
      break;
    case "campaign":
      partial.campaign_name = form.campaignName;
      partial.fleet = form.fleetCp;
      break;
    case "decisive":
      partial.chapter = form.chapter;
      partial.level1 = form.level1;
      partial.level2 = form.level2;
      partial.flagship_priority = form.flagshipPriority;
      partial.use_quick_repair = form.useQuickRepair;
      break;
  }
  try {
    if (editingTemplateId.value) {
      const updated = await templateModel.update(editingTemplateId.value, partial);
      if (!updated)
        throw new Error("\u6A21\u677F\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u7F16\u8F91");
      Logger_1.Logger.info(`\u6A21\u677F\u300C${name}\u300D\u5DF2\u66F4\u65B0`);
      editingTemplateId.value = null;
    } else {
      await templateModel.add(partial);
      Logger_1.Logger.info(`\u6A21\u677F\u300C${name}\u300D\u5DF2\u521B\u5EFA`);
    }
  } catch (error) {
    await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", error instanceof Error ? error.message : String(error));
    return;
  }
  wizardView.hide();
  renderLibrary();
  (0, DialogHelper_1.showSaveSuccess)(`\u6A21\u677F\u300C${name}\u300D\u4FDD\u5B58\u6210\u529F`);
}