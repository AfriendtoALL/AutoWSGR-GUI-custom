"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneFleetPreset = cloneFleetPreset;
exports.userTeamPlanToFleetPreset = userTeamPlanToFleetPreset;
exports.toTeamPlanSlotViewObject = toTeamPlanSlotViewObject;
exports.toTeamPlanViewObject = toTeamPlanViewObject;
exports.toFleetShipLibraryViewObject = toFleetShipLibraryViewObject;
var ShipMatcher_js_1 = require_ShipMatcher();
function cloneShipRule(rule) {
  return {
    ...rule,
    ship_type: rule.ship_type ? [...rule.ship_type] : void 0
  };
}
function cloneShipSlot(slot) {
  if (slot === null || typeof slot === "string")
    return slot;
  return {
    ...slot,
    candidates: slot.candidates?.map(cloneShipRule),
    ship_type: slot.ship_type ? [...slot.ship_type] : void 0
  };
}
function cloneFleetPreset(preset) {
  return {
    name: preset.name,
    ships: preset.ships.map(cloneShipSlot)
  };
}
function userTeamSlotToShipSlot(slot) {
  return {
    name: slot.name,
    search_name: slot.search_name,
    ship_type: slot.ship_type ? [...slot.ship_type] : void 0,
    candidates: slot.candidates?.map(cloneShipRule),
    min_level: slot.min_level,
    max_level: slot.max_level,
    relaxed: slot.relaxed
  };
}
function userTeamPlanToFleetPreset(plan) {
  return {
    name: plan.name,
    ships: plan.ships.map(userTeamSlotToShipSlot)
  };
}
function toRuleViewObject(rule, name = rule.name) {
  return {
    name,
    searchName: rule.search_name,
    shipTypes: [...rule.ship_type ?? []],
    minLevel: rule.min_level,
    maxLevel: rule.max_level
  };
}
function anonymousPrimaryLabel(filter) {
  const hasPrimaryRule = Boolean(filter.search_name || filter.nation || filter.ship_type?.length || filter.min_level !== void 0 || filter.max_level !== void 0);
  if (!hasPrimaryRule)
    return null;
  return (0, ShipMatcher_js_1.shipFilterLabel)({
    ...filter,
    candidates: void 0
  });
}
function toTeamPlanSlotViewObject(slot) {
  if (slot === null) {
    return {
      candidates: []
    };
  }
  if (typeof slot === "string") {
    return {
      primary: toRuleViewObject({ name: slot }),
      candidates: []
    };
  }
  const primaryName = slot.name ?? slot.search_name ?? anonymousPrimaryLabel(slot);
  return {
    primary: primaryName ? toRuleViewObject({
      name: slot.name ?? primaryName,
      search_name: slot.search_name,
      ship_type: slot.ship_type,
      min_level: slot.min_level,
      max_level: slot.max_level,
      relaxed: slot.relaxed
    }, primaryName) : void 0,
    candidates: (slot.candidates ?? []).map((candidate) => toRuleViewObject(candidate))
  };
}
function toTeamPlanViewObject(id, preset, source, modifiedAt, selected) {
  return {
    id,
    name: preset.name,
    source,
    modifiedAt,
    selected,
    ships: preset.ships.map(toTeamPlanSlotViewObject)
  };
}
function toFleetShipLibraryViewObject(manifest) {
  const ships = manifest.ships.filter((ship) => Number.isFinite(ship.id) && Boolean(ship.name) && Boolean(ship.portraitUrl));
  return {
    labels: manifest.labels,
    ships,
    colorfulBackgroundUrl: ships.find((ship) => ship.rarity === 6 && Boolean(ship.backgroundUrl))?.backgroundUrl ?? ""
  };
}