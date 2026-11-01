"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fleetPresetRuleKey = fleetPresetRuleKey;
exports.fleetPresetIdentityKey = fleetPresetIdentityKey;
function normalizeText(value) {
  const normalized = value?.trim();
  return normalized || null;
}
function normalizeShipTypes(values) {
  if (!values || values.length === 0)
    return null;
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  return normalized.length > 0 ? normalized : null;
}
function normalizeRule(rule) {
  return {
    name: rule.name.trim(),
    search_name: normalizeText(rule.search_name),
    ship_type: normalizeShipTypes(rule.ship_type),
    min_level: rule.min_level ?? null,
    max_level: rule.max_level ?? null,
    relaxed: rule.relaxed === true
  };
}
function normalizeSlot(slot) {
  if (slot === null)
    return null;
  if (typeof slot === "string") {
    return normalizeFilter({ name: slot });
  }
  return normalizeFilter(slot);
}
function normalizeFilter(filter) {
  return {
    name: normalizeText(filter.name),
    candidates: filter.candidates?.length ? filter.candidates.map(normalizeRule) : null,
    search_name: normalizeText(filter.search_name),
    nation: normalizeText(filter.nation),
    ship_type: normalizeShipTypes(filter.ship_type),
    min_level: filter.min_level ?? null,
    max_level: filter.max_level ?? null,
    relaxed: filter.relaxed === true
  };
}
function fleetPresetRuleKey(preset) {
  return JSON.stringify(preset.ships.map(normalizeSlot));
}
function fleetPresetIdentityKey(preset) {
  return JSON.stringify([
    preset.name.trim(),
    fleetPresetRuleKey(preset)
  ]);
}