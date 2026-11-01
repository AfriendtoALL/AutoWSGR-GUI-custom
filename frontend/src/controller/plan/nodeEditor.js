"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveNodeEditorValues = saveNodeEditorValues;
var Logger_1 = require_Logger();
function normalizeRuleAction(actionRaw) {
  const trimmed = actionRaw.trim();
  if (!trimmed)
    return null;
  const aliases = {
    detour: "detour",
    "\u8FC2\u56DE": "detour",
    retreat: "retreat",
    "\u64A4\u9000": "retreat"
  };
  const lower = trimmed.toLowerCase();
  const normalized = aliases[lower] ?? aliases[trimmed] ?? trimmed;
  if (/^\d+$/.test(normalized)) {
    const value = Number(normalized);
    return value >= 1 && value <= 5 ? value : null;
  }
  return normalized === "retreat" || normalized === "detour" ? normalized : null;
}
function parseRuleLine(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith("#"))
    return null;
  let expr = "";
  let action = "";
  const arrowMatch = trimmed.match(/^(.*?)\s*(?:=>|->)\s*(.+)$/);
  if (arrowMatch) {
    expr = arrowMatch[1].trim();
    action = arrowMatch[2].trim();
  } else {
    const commaIdx = Math.max(trimmed.lastIndexOf(","), trimmed.lastIndexOf("\uFF0C"));
    if (commaIdx < 0)
      return null;
    expr = trimmed.slice(0, commaIdx).trim();
    action = trimmed.slice(commaIdx + 1).trim();
  }
  if (!expr || !action)
    return null;
  const normalizedAction = normalizeRuleAction(action);
  return normalizedAction === null ? null : [expr, normalizedAction];
}
function saveNodeEditorValues(planView, currentPlan, editingNodeId) {
  if (!currentPlan || !editingNodeId)
    return false;
  const vals = planView.collectNodeEditorValues();
  const selectedNodes = currentPlan.data.selected_nodes;
  const selectedIndex = selectedNodes.indexOf(editingNodeId);
  if (!vals.enabled) {
    if (selectedIndex >= 0) {
      selectedNodes.splice(selectedIndex, 1);
    }
    if (currentPlan.data.node_args && editingNodeId in currentPlan.data.node_args) {
      delete currentPlan.data.node_args[editingNodeId];
      if (Object.keys(currentPlan.data.node_args).length === 0) {
        currentPlan.data.node_args = void 0;
      }
    }
    const endpointNodes = currentPlan.data.endpoint_nodes;
    if (endpointNodes) {
      const endpointIndex = endpointNodes.indexOf(editingNodeId);
      if (endpointIndex >= 0) {
        endpointNodes.splice(endpointIndex, 1);
      }
      if (endpointNodes.length === 0) {
        currentPlan.data.endpoint_nodes = void 0;
        currentPlan.data.result = void 0;
      }
    }
    planView.hideNodeEditor();
    return true;
  }
  if (selectedIndex < 0) {
    selectedNodes.push(editingNodeId);
  }
  if (!currentPlan.data.endpoint_nodes) {
    currentPlan.data.endpoint_nodes = [];
  }
  const epIndex = currentPlan.data.endpoint_nodes.indexOf(editingNodeId);
  if (vals.isEndpoint && epIndex < 0) {
    currentPlan.data.endpoint_nodes.push(editingNodeId);
  } else if (!vals.isEndpoint && epIndex >= 0) {
    currentPlan.data.endpoint_nodes.splice(epIndex, 1);
  }
  if (currentPlan.data.endpoint_nodes.length === 0) {
    currentPlan.data.endpoint_nodes = void 0;
    currentPlan.data.result = void 0;
  } else if (vals.isEndpoint) {
    currentPlan.data.result = vals.result;
  }
  const rules = [];
  const invalidRuleLines = [];
  for (const line of vals.rulesText.split("\n")) {
    const parsed = parseRuleLine(line);
    if (!parsed) {
      const raw = line.trim();
      if (raw.length > 0 && !raw.startsWith("#"))
        invalidRuleLines.push(raw);
      continue;
    }
    rules.push(parsed);
  }
  if (invalidRuleLines.length > 0) {
    const sample = invalidRuleLines.slice(0, 3).join(" | ");
    Logger_1.Logger.warn(`\u8282\u70B9 ${editingNodeId} \u6709 ${invalidRuleLines.length} \u6761\u7D22\u654C\u89C4\u5219\u683C\u5F0F\u65E0\u6548\uFF0C\u5DF2\u5FFD\u7565\uFF08\u793A\u4F8B: ${sample}\uFF09`);
  }
  if (!currentPlan.data.node_args) {
    currentPlan.data.node_args = {};
  }
  currentPlan.data.node_args[editingNodeId] = {
    ...currentPlan.data.node_args[editingNodeId],
    formation: vals.formation,
    night: vals.night,
    long_missile_support: vals.longMissileSupport,
    proceed: vals.isEndpoint ? false : vals.proceed,
    detour: vals.detour,
    SL_when_detour_fails: vals.slWhenDetourFails,
    enemy_rules: rules.length > 0 ? rules : void 0
  };
  planView.hideNodeEditor();
  return true;
}