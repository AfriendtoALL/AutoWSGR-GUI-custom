"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShipCandidates = buildShipCandidates;
exports.resolveShipFilter = resolveShipFilter;
exports.resolveFleetPreset = resolveFleetPreset;
exports.shipFilterLabel = shipFilterLabel;
exports.isShipFilter = isShipFilter;
exports.shipSlotLabel = shipSlotLabel;
var fleetShipTypes_js_1 = require_fleetShipTypes();
var shipCatalog_js_1 = require_shipCatalog();
var shipNameNormalizer_js_1 = require_shipNameNormalizer();
function dedupeNames(names) {
  const seen = /* @__PURE__ */ new Set();
  return names.filter((name) => name && !seen.has(name) && seen.add(name));
}
function matchShipType(filter, shipType) {
  if (!filter.ship_type || filter.ship_type.length === 0)
    return true;
  return filter.ship_type.some((rule) => rule === "ss_or_ssg" ? shipType === "ss" || shipType === "ssg" : shipType === rule);
}
function matchesFilter(filter, ship) {
  if (filter.nation && ship.nation !== filter.nation)
    return false;
  if (!matchShipType(filter, ship.ship_type))
    return false;
  return !filter.name || (0, shipNameNormalizer_js_1.toBackendName)(ship.name) === (0, shipNameNormalizer_js_1.toBackendName)(filter.name);
}
function buildShipCandidates(filter, exclude = []) {
  const excluded = new Set(exclude.map(shipNameNormalizer_js_1.toBackendName));
  const matched = shipCatalog_js_1.ALL_SHIPS.filter((ship) => matchesFilter(filter, ship));
  const refit = matched.filter((ship) => ship.name.endsWith("\xB7\u6539")).map((ship) => (0, shipNameNormalizer_js_1.toBackendName)(ship.name));
  const normal = matched.filter((ship) => !ship.name.endsWith("\xB7\u6539")).map((ship) => (0, shipNameNormalizer_js_1.toBackendName)(ship.name));
  const candidates = dedupeNames([...refit, ...normal]).filter((name) => !excluded.has(name));
  if (candidates.length === 0 && filter.name) {
    const normalized = (0, shipNameNormalizer_js_1.toBackendName)(filter.name);
    if (!excluded.has(normalized))
      candidates.push(normalized);
  }
  return candidates;
}
function resolveShipFilter(filter, exclude = []) {
  return buildShipCandidates(filter, exclude)[0] ?? null;
}
function resolveFleetPreset(ships) {
  const resolved = [];
  for (const slot of ships) {
    if (slot === null)
      continue;
    if (typeof slot === "string")
      resolved.push((0, shipNameNormalizer_js_1.toBackendName)(slot));
    else {
      const name = resolveShipFilter(slot, resolved);
      if (name)
        resolved.push(name);
    }
  }
  return resolved;
}
function shipFilterLabel(filter) {
  const parts = [];
  if (filter.name)
    parts.push(filter.name);
  else if (filter.search_name)
    parts.push(filter.search_name);
  if (filter.nation)
    parts.push(filter.nation);
  if (filter.ship_type) {
    parts.push(filter.ship_type.map(fleetShipTypes_js_1.shipTypeLabel).join("/"));
  }
  if (filter.candidates?.length) {
    parts.push(`\u5907\u9009:${filter.candidates.map((rule) => rule.name).join(" > ")}`);
  }
  if (filter.min_level != null || filter.max_level != null) {
    if (filter.min_level != null && filter.max_level != null) {
      parts.push(`Lv${filter.min_level}-${filter.max_level}`);
    } else if (filter.min_level != null) {
      parts.push(`Lv>=${filter.min_level}`);
    } else if (filter.max_level != null) {
      parts.push(`Lv<=${filter.max_level}`);
    }
  }
  return parts.join(" ") || "\u4EFB\u610F\u8230\u8239";
}
function isShipFilter(slot) {
  return typeof slot === "object" && slot !== null;
}
function shipSlotLabel(slot) {
  if (slot === null)
    return "\u7A7A";
  return isShipFilter(slot) ? shipFilterLabel(slot) : slot;
}