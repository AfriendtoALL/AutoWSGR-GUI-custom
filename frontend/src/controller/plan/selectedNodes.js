"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialSelectedNodesForNewPlan = initialSelectedNodesForNewPlan;
exports.normalizeSelectedNodesForBackend = normalizeSelectedNodesForBackend;
exports.assertPlanRouteReadyForExecution = assertPlanRouteReadyForExecution;
function initialSelectedNodesForNewPlan() {
  return ["0"];
}
function normalizeSelectedNodesForBackend(selectedNodes) {
  if (!Array.isArray(selectedNodes) || selectedNodes.length === 0)
    return [];
  const normalized = Array.from(new Set(selectedNodes.map((node) => String(node).trim().toUpperCase()).filter((node) => node.length > 0)));
  if (!normalized.includes("0")) {
    normalized.push("0");
  }
  return normalized;
}
function assertPlanRouteReadyForExecution(selectedNodes) {
  if (selectedNodes.length === 1 && selectedNodes[0] === "0") {
    throw new Error("\u51FA\u5F81\u8BA1\u5212\u53EA\u542F\u7528\u4E86\u8D77\u59CB\u8282\u70B9\uFF0C\u8BF7\u81F3\u5C11\u5F00\u542F\u4E00\u4E2A\u8DEF\u7EBF\u8282\u70B9");
  }
}