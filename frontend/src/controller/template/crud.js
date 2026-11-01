"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editTemplate = editTemplate;
exports.deleteTemplate = deleteTemplate;
exports.renameTemplate = renameTemplate;
exports.importTemplatesFlow = importTemplatesFlow;
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
var wizard_1 = require_wizard();
var adapter_1 = require_adapter();
var IpcAdapter_js_1 = require_IpcAdapter();
function isTemplateRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  const record = value;
  return typeof record.name === "string" && typeof record.type === "string";
}
function stringArray(value) {
  if (!Array.isArray(value))
    return void 0;
  return value.filter((item) => typeof item === "string");
}
function toWizardPrefillData(record) {
  const stop = record.defaultStopCondition;
  const stopRecord = stop && typeof stop === "object" && !Array.isArray(stop) ? stop : null;
  return {
    type: record.type,
    name: record.name,
    defaultTimes: typeof record.defaultTimes === "number" ? record.defaultTimes : void 0,
    planPaths: stringArray(record.planPaths),
    planPath: typeof record.planPath === "string" ? record.planPath : void 0,
    fleet_id: typeof record.fleet_id === "number" ? record.fleet_id : void 0,
    fleet: stringArray(record.fleet),
    campaign_name: typeof record.campaign_name === "string" ? record.campaign_name : void 0,
    chapter: typeof record.chapter === "number" ? record.chapter : void 0,
    level1: stringArray(record.level1),
    level2: stringArray(record.level2),
    flagship_priority: stringArray(record.flagship_priority),
    use_quick_repair: typeof record.use_quick_repair === "boolean" ? record.use_quick_repair : void 0,
    defaultStopCondition: stopRecord ? {
      loot_count_ge: typeof stopRecord.loot_count_ge === "number" ? stopRecord.loot_count_ge : void 0,
      ship_count_ge: typeof stopRecord.ship_count_ge === "number" ? stopRecord.ship_count_ge : void 0,
      level_slot: Number.isInteger(stopRecord.level_slot) ? stopRecord.level_slot : void 0,
      level_ge: Number.isInteger(stopRecord.level_ge) ? stopRecord.level_ge : void 0
    } : void 0
  };
}
function editTemplate(id, templateModel, wizardView, wizardPlanPaths, editingTemplateId) {
  if (templateModel.isBuiltin(id))
    return;
  const tpl = templateModel.get(id);
  if (!tpl)
    return;
  editingTemplateId.value = id;
  (0, wizard_1.showWizardWithTemplate)(tpl, wizardView, wizardPlanPaths);
  wizardView.setTitle("\u7F16\u8F91\u6A21\u677F");
}
async function deleteTemplate(id, templateModel, renderLibrary) {
  if (templateModel.isBuiltin(id))
    return;
  const tpl = templateModel.get(id);
  if (!tpl)
    return;
  const ok = await (0, DialogHelper_1.showConfirm)("\u786E\u8BA4\u5220\u9664", `\u786E\u5B9A\u5220\u9664\u6A21\u677F\u300C${tpl.name}\u300D\uFF1F`);
  if (!ok)
    return;
  await templateModel.remove(id);
  renderLibrary();
  Logger_1.Logger.info(`\u6A21\u677F\u300C${tpl.name}\u300D\u5DF2\u5220\u9664`);
}
async function renameTemplate(id, templateModel, renderLibrary) {
  if (templateModel.isBuiltin(id))
    return;
  const tpl = templateModel.get(id);
  if (!tpl)
    return;
  const newName = await (0, DialogHelper_1.showPrompt)("\u91CD\u547D\u540D\u6A21\u677F", "\u8BF7\u8F93\u5165\u65B0\u540D\u79F0\uFF1A", tpl.name);
  if (!newName?.trim())
    return;
  await templateModel.rename(id, newName.trim());
  renderLibrary();
}
async function importTemplatesFlow(templateModel, wizardView, wizardPlanPaths, appRoot, renderLibrary, repository = (0, IpcAdapter_js_1.getPlansGateway)()) {
  if (!repository)
    return;
  const defaultDir = appRoot ? `${appRoot}\\templates` : void 0;
  const result = await repository.openFileDialog([{ name: "\u6A21\u677F\u6587\u4EF6", extensions: ["json"] }], defaultDir);
  if (!result)
    return;
  let arr;
  try {
    const parsed = adapter_1.jsonCodec.parse(result.content);
    arr = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    (0, DialogHelper_1.showAlert)("\u5BFC\u5165\u5931\u8D25", "\u6587\u4EF6\u683C\u5F0F\u9519\u8BEF\uFF0C\u8BF7\u9009\u62E9\u6709\u6548\u7684 JSON \u6A21\u677F\u6587\u4EF6\u3002");
    return;
  }
  const valid = arr.filter(isTemplateRecord);
  if (valid.length === 0) {
    (0, DialogHelper_1.showAlert)("\u5BFC\u5165\u5931\u8D25", "\u672A\u627E\u5230\u6709\u6548\u7684\u6A21\u677F\u6570\u636E\uFF08\u9700\u5305\u542B name \u548C type \u5B57\u6BB5\uFF09\u3002");
    return;
  }
  (0, wizard_1.showWizardWithTemplate)(toWizardPrefillData(valid[0]), wizardView, wizardPlanPaths);
  if (valid.length > 1) {
    const rest = valid.slice(1);
    const count = await templateModel.importFromJson(rest);
    renderLibrary();
    Logger_1.Logger.info(`\u5176\u4F59 ${count} \u4E2A\u6A21\u677F\u5DF2\u76F4\u63A5\u5BFC\u5165`);
  }
}