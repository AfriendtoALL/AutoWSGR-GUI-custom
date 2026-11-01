"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAutomaticDecisivePlanRequest = buildAutomaticDecisivePlanRequest;
exports.buildAutomaticDecisivePresetRequest = buildAutomaticDecisivePresetRequest;
var shipNameNormalizer_js_1 = require_shipNameNormalizer();
function buildRequest(chapterValue, useQuickRepair, names, ships = []) {
  const chapter = Math.trunc(Number(chapterValue));
  if (!Number.isFinite(chapter) || chapter < 1 || chapter > 6) {
    throw new Error(`\u51B3\u6218\u7AE0\u8282\u65E0\u6548: ${String(chapterValue)}`);
  }
  const { level1, level2, flagship_priority: flagshipPriority } = (0, shipNameNormalizer_js_1.toBackendDecisiveShipNames)(names, ships);
  const request = {
    type: "decisive",
    chapter,
    decisive_rounds: 1,
    use_quick_repair: useQuickRepair
  };
  if (level1.length > 0)
    request.level1 = level1;
  if (level2.length > 0)
    request.level2 = level2;
  if (flagshipPriority.length > 0) {
    request.flagship_priority = flagshipPriority;
  }
  return request;
}
function buildAutomaticDecisivePlanRequest(plan, ships = []) {
  return buildRequest(plan.chapter, plan.useQuickRepair, plan, ships);
}
function buildAutomaticDecisivePresetRequest(template) {
  if (template.type !== "decisive") {
    throw new Error(`\u6A21\u677F\u300C${template.name}\u300D\u4E0D\u662F\u51B3\u6218\u6A21\u677F`);
  }
  return buildRequest(template.chapter, template.use_quick_repair ?? true, template);
}