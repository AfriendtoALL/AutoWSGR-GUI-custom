"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBackendName = toBackendName;
exports.toBackendDecisiveShipNames = toBackendDecisiveShipNames;
exports.resolveConfiguredShipSearchName = resolveConfiguredShipSearchName;
function toBackendName(displayName) {
  const noRefit = displayName.endsWith("\xB7\u6539") ? displayName.slice(0, -2) : displayName;
  return noRefit.replace(/\s*[（(][^（）()]*[)）]\s*$/, "").trim();
}
function toBackendDecisiveShipNames(names, ships) {
  const backendNames = ships === void 0 ? null : new Map(ships.map((ship) => [ship.name.trim(), ship.search_name.trim()]));
  const convert = (value) => {
    const values = Array.isArray(value) ? value : [];
    return backendNames ? values.map((name) => name.trim()).filter(Boolean).map((name) => backendNames.get(name) ?? name) : values;
  };
  return {
    level1: convert(names.level1),
    level2: convert(names.level2),
    flagship_priority: convert(names.flagship_priority)
  };
}
function resolveConfiguredShipSearchName(name, aliases) {
  const normalizedName = toBackendName(name);
  for (const [alias, standardName] of Object.entries(aliases)) {
    const normalizedAlias = alias.trim();
    if (normalizedAlias && toBackendName(standardName) === normalizedName) {
      return normalizedAlias;
    }
  }
  return name.trim();
}