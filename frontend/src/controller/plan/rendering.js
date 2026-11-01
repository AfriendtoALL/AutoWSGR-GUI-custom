"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPlanPreviewVO = buildPlanPreviewVO;
var model_js_1 = require_model();
var MapDataLoader_1 = require_MapDataLoader();
function buildPlanPreviewVO(currentPlan, currentMapData, eventMaps = [], fleetPresetSelector) {
  const plan = currentPlan;
  const mapData = currentMapData;
  const selectedSet = new Set(plan.data.selected_nodes);
  const nodes = plan.data.selected_nodes.map((nodeId) => {
    const args = plan.getNodeArgs(nodeId);
    return {
      id: nodeId,
      formation: model_js_1.FORMATION_NAMES[args.formation ?? 2] ?? "\u590D\u7EB5\u9635",
      night: args.night ?? false,
      proceed: args.proceed ?? true,
      hasCustomRules: plan.hasCustomArgs(nodeId),
      note: "",
      nodeType: mapData ? (0, MapDataLoader_1.getNodeType)(mapData, nodeId) : "Normal",
      detour: mapData ? (0, MapDataLoader_1.isDetourNode)(mapData, nodeId) : false,
      mapNight: mapData ? (0, MapDataLoader_1.isNightNode)(mapData, nodeId) : false
    };
  });
  let allNodes;
  let edges;
  let mapAspectRatio;
  if (mapData) {
    const positions = /* @__PURE__ */ new Map();
    for (const [id, pt] of Object.entries(mapData)) {
      if (pt.position)
        positions.set(id, pt.position);
    }
    if (positions.size > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of positions.values()) {
        if (x < minX)
          minX = x;
        if (y < minY)
          minY = y;
        if (x > maxX)
          maxX = x;
        if (y > maxY)
          maxY = y;
      }
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const PAD = 6;
      const innerW = 100 - PAD * 2;
      const innerH = 100 - PAD * 2;
      const scaleX = innerW / rangeX;
      const scaleY = innerH / rangeY;
      mapAspectRatio = rangeX / rangeY;
      const scaledPos = /* @__PURE__ */ new Map();
      for (const [id, [x, y]] of positions) {
        scaledPos.set(id, [
          (x - minX) * scaleX + PAD,
          (y - minY) * scaleY + PAD
        ]);
      }
      allNodes = Object.entries(mapData).map(([id, pt]) => {
        const args = plan.getNodeArgs(id);
        const isSelected = selectedSet.has(id);
        return {
          id,
          formation: isSelected ? model_js_1.FORMATION_NAMES[args.formation ?? 2] ?? "\u590D\u7EB5\u9635" : "",
          night: isSelected ? args.night ?? false : false,
          proceed: isSelected ? args.proceed ?? true : true,
          hasCustomRules: isSelected ? plan.hasCustomArgs(id) : false,
          note: "",
          nodeType: pt.type,
          detour: pt.detour,
          mapNight: pt.night,
          position: scaledPos.get(id)
        };
      });
      edges = [];
      for (const [id, pt] of Object.entries(mapData)) {
        const fromPos = scaledPos.get(id);
        if (!fromPos)
          continue;
        for (const nxt of pt.next) {
          const toPos = scaledPos.get(nxt);
          if (toPos)
            edges.push({ from: fromPos, to: toPos, fromId: id, toId: nxt });
        }
      }
    }
  }
  return {
    fileName: plan.fileName.split(/[\\/]/).pop() || plan.fileName,
    chapter: plan.data.chapter,
    map: plan.data.map,
    mapName: plan.mapName,
    event: plan.data.event,
    eventMaps,
    repairModeValue: Array.isArray(plan.repairMode) ? plan.repairMode[0] ?? 1 : plan.repairMode,
    fightConditionValue: plan.fightCondition,
    fleetId: plan.data.fleet_id ?? 1,
    selectedNodes: nodes,
    comment: plan.comment,
    allNodes,
    edges,
    mapAspectRatio,
    fleetPresetSelector,
    times: plan.data.times,
    gap: plan.data.gap,
    lootCountGe: plan.data.stop_condition?.loot_count_ge,
    shipCountGe: plan.data.stop_condition?.ship_count_ge,
    levelSlot: plan.data.stop_condition?.level_slot,
    levelGe: plan.data.stop_condition?.level_ge
  };
}