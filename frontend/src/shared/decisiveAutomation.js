"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_DECISIVE_TEMPLATE_ID = exports.SYSTEM_DECISIVE_PRESET_ID = exports.USER_DECISIVE_PLAN_ID = void 0;
exports.normalizeDecisiveAutomationSource = normalizeDecisiveAutomationSource;
exports.USER_DECISIVE_PLAN_ID = "user_plan";
exports.SYSTEM_DECISIVE_PRESET_ID = "system_preset";
exports.SYSTEM_DECISIVE_TEMPLATE_ID = "builtin_decisive_6";
function normalizeDecisiveAutomationSource(value) {
  return value === exports.USER_DECISIVE_PLAN_ID ? exports.USER_DECISIVE_PLAN_ID : exports.SYSTEM_DECISIVE_PRESET_ID;
}