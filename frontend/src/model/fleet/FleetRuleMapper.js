"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFleetPresetRules = resolveFleetPresetRules;
var ShipMatcher_js_1 = require_ShipMatcher();
var shipNameNormalizer_js_1 = require_shipNameNormalizer();
function toFleetShipRule(rule, aliases) {
  const result = { name: rule.name };
  const explicitSearchName = rule.search_name?.trim();
  if (explicitSearchName) {
    result.search_name = explicitSearchName;
  } else {
    const searchName = (0, shipNameNormalizer_js_1.resolveConfiguredShipSearchName)(rule.name, aliases);
    if (searchName !== rule.name.trim())
      result.search_name = searchName;
  }
  if (rule.ship_type)
    result.ship_type = [...rule.ship_type];
  if (rule.min_level != null && Number.isFinite(rule.min_level))
    result.min_level = Math.max(1, Math.floor(rule.min_level));
  if (rule.max_level != null && Number.isFinite(rule.max_level))
    result.max_level = Math.max(1, Math.floor(rule.max_level));
  if (rule.relaxed === true)
    result.relaxed = true;
  return result;
}
function resolveFleetPresetRules(ships, aliases = {}) {
  const rules = [];
  const reserved = [];
  for (const slot of ships) {
    if (slot === null)
      continue;
    if (typeof slot === "string") {
      const name = (0, shipNameNormalizer_js_1.toBackendName)(slot);
      const searchName2 = (0, shipNameNormalizer_js_1.resolveConfiguredShipSearchName)(name, aliases);
      rules.push(searchName2 === name ? name : { name, search_name: searchName2 });
      reserved.push(name);
      continue;
    }
    const candidates = (0, ShipMatcher_js_1.buildShipCandidates)(slot, reserved);
    if (candidates.length === 0)
      continue;
    const candidateOnly = !slot.name && (slot.candidates?.length ?? 0) > 0;
    const resolvedPrimary = candidateOnly ? void 0 : slot.name ?? candidates[0];
    const rule = {};
    if (resolvedPrimary)
      rule.name = resolvedPrimary;
    const explicitSearchName = slot.search_name?.trim();
    const searchName = explicitSearchName || (resolvedPrimary ? (0, shipNameNormalizer_js_1.resolveConfiguredShipSearchName)(resolvedPrimary, aliases) : void 0);
    if (searchName?.trim())
      rule.search_name = searchName.trim();
    if (slot.ship_type)
      rule.ship_type = [...slot.ship_type];
    if (slot.min_level != null && Number.isFinite(slot.min_level))
      rule.min_level = Math.max(1, Math.floor(slot.min_level));
    if (slot.max_level != null && Number.isFinite(slot.max_level))
      rule.max_level = Math.max(1, Math.floor(slot.max_level));
    if (slot.relaxed === true)
      rule.relaxed = true;
    if (slot.candidates?.length) {
      rule.candidates = slot.candidates.map((candidate) => toFleetShipRule(candidate, aliases));
    }
    rules.push(rule);
    reserved.push(candidates[0]);
  }
  return rules;
}