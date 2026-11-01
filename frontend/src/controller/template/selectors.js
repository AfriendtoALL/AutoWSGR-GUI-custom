"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showPlanSelector = showPlanSelector;
exports.showFleetPresetPicker = showFleetPresetPicker;
exports.showCampaignSelector = showCampaignSelector;
exports.showExerciseFleetSelector = showExerciseFleetSelector;
exports.showDecisiveChapterSelector = showDecisiveChapterSelector;
var ShipMatcher_1 = require_ShipMatcher();
var Logger_1 = require_Logger();
var useTemplate_1 = require_useTemplate();
var adapter_1 = require_adapter();
var IpcAdapter_js_1 = require_IpcAdapter();
var CAMPAIGN_OPTIONS = [
  "\u56F0\u96BE\u6F5C\u8247",
  "\u56F0\u96BE\u822A\u6BCD",
  "\u56F0\u96BE\u9A71\u9010",
  "\u56F0\u96BE\u5DE1\u6D0B",
  "\u56F0\u96BE\u6218\u5217",
  "\u7B80\u5355\u822A\u6BCD",
  "\u7B80\u5355\u6F5C\u8247",
  "\u7B80\u5355\u9A71\u9010",
  "\u7B80\u5355\u5DE1\u6D0B",
  "\u7B80\u5355\u6218\u5217"
];
var DECISIVE_CHAPTERS = [
  { value: 1, label: "\u7B2C 1 \u7AE0" },
  { value: 2, label: "\u7B2C 2 \u7AE0" },
  { value: 3, label: "\u7B2C 3 \u7AE0" },
  { value: 4, label: "\u7B2C 4 \u7AE0" },
  { value: 5, label: "\u7B2C 5 \u7AE0" },
  { value: 6, label: "\u7B2C 6 \u7AE0" }
];
var NORMAL_FLEET_IDS = [1, 2, 3, 4];
async function showNormalFightFleetSelector(templateName, planName, defaultFleetId, wizardView) {
  const options = [
    { icon: "\u{1F4C4}", label: "\u4EC5\u4F7F\u7528\u65B9\u6848\uFF0C\u4E0D\u6307\u5B9A\u7F16\u961F\u9884\u8BBE" },
    ...NORMAL_FLEET_IDS.map((fleetId) => ({
      icon: "\u2693",
      label: fleetId === defaultFleetId ? `\u7B2C ${fleetId} \u5206\u961F\uFF08\u9ED8\u8BA4\uFF09` : `\u7B2C ${fleetId} \u5206\u961F`
    }))
  ];
  const result = await wizardView.showSelector(`\u300C${templateName} / ${planName}\u300D\u2014 \u9009\u62E9\u4F7F\u7528\u5206\u961F`, options);
  if (!result)
    return null;
  if (result.index === 0)
    return void 0;
  return NORMAL_FLEET_IDS[result.index - 1] ?? null;
}
async function showPlanSelector(tpl, paths, groupName, wizardView, taskGroupModel, renderTaskGroup, repository = (0, IpcAdapter_js_1.getPlansGateway)()) {
  const options = paths.map((p) => ({
    icon: "\u{1F4C4}",
    label: p.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? p
  }));
  const result = await wizardView.showSelector(`\u300C${tpl.name}\u300D\u2014 \u9009\u62E9\u6267\u884C\u65B9\u6848`, options);
  if (!result)
    return;
  const idx = result.index;
  const planPath = paths[idx];
  const planName = planPath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? planPath;
  const addPlanDirect = () => {
    (0, useTemplate_1.addPlanToTaskList)(tpl, planPath, groupName, taskGroupModel);
    taskGroupModel.save();
    renderTaskGroup();
    Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u2192 \u5DF2\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${groupName}\u300D\uFF08\u65B9\u6848: ${planName}\uFF09`);
  };
  let parsedPlan;
  if (repository) {
    try {
      const content = await repository.readFile(planPath);
      parsedPlan = adapter_1.yamlCodec.parse(content);
      const rawPresets = Array.isArray(parsedPlan?.fleet_presets) ? parsedPlan.fleet_presets : [];
      if (rawPresets.length > 0) {
        let defaultFleetId = tpl.fleet_id ?? 1;
        const rawFleetId = Number(parsedPlan?.fleet_id);
        if (Number.isFinite(rawFleetId) && rawFleetId >= 1 && rawFleetId <= 4) {
          defaultFleetId = rawFleetId;
        }
        const selectedFleetId = await showNormalFightFleetSelector(tpl.name, planName, defaultFleetId, wizardView);
        if (selectedFleetId === null)
          return;
        if (selectedFleetId === void 0) {
          addPlanDirect();
          return;
        }
        await showFleetPresetPicker(tpl, planPath, rawPresets, groupName, wizardView, taskGroupModel, renderTaskGroup, selectedFleetId);
        return;
      }
    } catch {
    }
  }
  addPlanDirect();
}
async function showFleetPresetPicker(tpl, planPath, rawPresets, groupName, wizardView, taskGroupModel, renderTaskGroup, selectedFleetId) {
  const planName = planPath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? "";
  const options = rawPresets.map((p, i) => {
    const pName = p.name ?? `\u9884\u8BBE${i + 1}`;
    const ships = Array.isArray(p.ships) ? p.ships : [];
    const shipsHtml = ships.map((s) => {
      if (typeof s === "string")
        return `<span class="ship-tag">${escapeHtml(s)}</span>`;
      const label = (0, ShipMatcher_1.shipSlotLabel)(s);
      return `<span class="ship-tag ship-tag-filter">${escapeHtml(label)}</span>`;
    }).join("");
    return { icon: "\u2693", label: pName, sublabel: shipsHtml };
  });
  const indices = await wizardView.showMultiSelector(`\u300C${planName}\u300D\u2014 \u9009\u62E9\u7F16\u961F\uFF08\u53EF\u591A\u9009\uFF09`, options);
  if (indices.length === 0)
    return;
  for (const idx of indices) {
    const preset = rawPresets[idx];
    const presetName = preset?.name ?? "";
    (0, useTemplate_1.addPlanToTaskList)(tpl, planPath, groupName, taskGroupModel, idx, presetName, selectedFleetId);
  }
  taskGroupModel.save();
  renderTaskGroup();
  const names = indices.map((i) => rawPresets[i]?.name ?? "").join(", ");
  Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u2192 \u5DF2\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${groupName}\u300D\uFF08\u65B9\u6848: ${planName}, \u5206\u961F: ${selectedFleetId}, \u7F16\u961F\u9884\u8BBE: ${names}\uFF09`);
}
async function showCampaignSelector(tpl, groupName, wizardView, taskGroupModel, renderTaskGroup) {
  const options = CAMPAIGN_OPTIONS.map((name) => ({ icon: "\u2694", label: name }));
  const result = await wizardView.showSelector(`\u300C${tpl.name}\u300D\u2014 \u9009\u62E9\u6218\u5F79\u7C7B\u578B`, options, true, tpl.defaultTimes ?? 1);
  if (!result)
    return;
  const chosen = CAMPAIGN_OPTIONS[result.index];
  if (!chosen)
    return;
  taskGroupModel.addItem(groupName, {
    templateId: tpl.id,
    kind: "template",
    times: result.times,
    label: `${tpl.name} (${chosen})`,
    campaignName: chosen
  });
  taskGroupModel.save();
  renderTaskGroup();
  Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u2192 \u5DF2\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${groupName}\u300D\uFF08${chosen}\uFF09`);
}
async function showExerciseFleetSelector(tpl, groupName, wizardView, taskGroupModel, renderTaskGroup) {
  const fleetOptions = ["\u7B2C 1 \u8230\u961F", "\u7B2C 2 \u8230\u961F", "\u7B2C 3 \u8230\u961F", "\u7B2C 4 \u8230\u961F"];
  const options = fleetOptions.map((name) => ({ icon: "\u2693", label: name }));
  const result = await wizardView.showSelector(`\u300C${tpl.name}\u300D\u2014 \u9009\u62E9\u8230\u961F`, options);
  if (!result)
    return;
  const idx = result.index;
  taskGroupModel.addItem(groupName, {
    templateId: tpl.id,
    kind: "template",
    times: tpl.defaultTimes ?? 1,
    label: `${tpl.name} (${fleetOptions[idx]})`,
    fleet_id: idx + 1
  });
  taskGroupModel.save();
  renderTaskGroup();
  Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u2192 \u5DF2\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${groupName}\u300D\uFF08${fleetOptions[idx]}\uFF09`);
}
async function showDecisiveChapterSelector(tpl, groupName, wizardView, taskGroupModel, renderTaskGroup) {
  const options = DECISIVE_CHAPTERS.map((ch) => ({ icon: "\u{1F3C6}", label: ch.label }));
  const result = await wizardView.showSelector(`\u300C${tpl.name}\u300D\u2014 \u9009\u62E9\u7AE0\u8282`, options, true, tpl.defaultTimes ?? 1);
  if (!result)
    return;
  const chosen = DECISIVE_CHAPTERS[result.index];
  if (!chosen)
    return;
  taskGroupModel.addItem(groupName, {
    templateId: tpl.id,
    kind: "template",
    times: result.times,
    label: `${tpl.name} (${chosen.label})`,
    chapter: chosen.value
  });
  taskGroupModel.save();
  renderTaskGroup();
  Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u2192 \u5DF2\u52A0\u5165\u4EFB\u52A1\u5217\u8868\u300C${groupName}\u300D\uFF08${chosen.label}\uFF09`);
}