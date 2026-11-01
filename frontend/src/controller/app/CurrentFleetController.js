"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentFleetController = void 0;
var IpcAdapter_js_1 = require_IpcAdapter();
var shipLibrary_js_1 = require_shipLibrary();
function normalizedShipName(value) {
  return typeof value === "string" ? value.trim() : "";
}
function fleetRuleShip(rule) {
  if (typeof rule === "string") {
    const name2 = rule.trim();
    return name2 ? { name: name2 } : null;
  }
  if (!rule || typeof rule !== "object")
    return null;
  const record = rule;
  const searchName = normalizedShipName(record["search_name"]);
  const name = normalizedShipName(record["name"]) || searchName;
  if (!name)
    return null;
  return searchName && searchName !== name ? { name, searchName } : { name };
}
function candidateShips(rule) {
  if (!rule || typeof rule !== "object")
    return [];
  const candidates = rule["candidates"];
  if (!Array.isArray(candidates))
    return [];
  return candidates.map(fleetRuleShip).filter((ship) => ship !== null);
}
function requestedFleet(request) {
  if (request.type !== "normal_fight" && request.type !== "event_fight") {
    return [];
  }
  const rules = Array.isArray(request.plan?.fleet_rules) ? request.plan.fleet_rules : [];
  const fleet = Array.isArray(request.plan?.fleet) ? request.plan.fleet : [];
  const slotCount = Math.min(6, Math.max(rules.length, fleet.length));
  const ships = [];
  const usedNames = /* @__PURE__ */ new Set();
  for (let index = 0; index < slotCount; index += 1) {
    const fleetName = normalizedShipName(fleet[index]);
    const candidates = [
      fleetRuleShip(rules[index]),
      ...fleetName ? [{ name: fleetName }] : [],
      ...candidateShips(rules[index])
    ].filter((ship2) => ship2 !== null);
    const ship = candidates.find((candidate) => !usedNames.has(candidate.name));
    if (!ship)
      continue;
    usedNames.add(ship.name);
    ships.push(ship);
  }
  return ships;
}
var CurrentFleetController = class {
  constructor(repository = IpcAdapter_js_1.fleetPlannerRepository) {
    this.repository = repository;
    this.manifest = null;
    this.loading = null;
    this.loaded = false;
  }
  load(force = false) {
    if (this.loading)
      return this.loading;
    if (this.loaded && !force)
      return Promise.resolve();
    this.loading = Promise.resolve().then(() => this.repository.getShipLibraryManifest()).then((manifest) => {
      this.manifest = manifest;
    }).catch(() => {
      this.manifest = null;
    }).finally(() => {
      this.loaded = true;
      this.loading = null;
    });
    return this.loading;
  }
  resolve(request) {
    return requestedFleet(request).map((preview) => {
      const ship = (0, shipLibrary_js_1.findShipLibraryShip)(this.manifest?.ships ?? [], {
        name: preview.name,
        searchName: preview.searchName,
        allowBaseNameFallback: true
      });
      return {
        name: preview.name,
        ship,
        shipTypeLabel: ship ? this.manifest?.labels.ship_types[ship.ship_type] ?? ship.ship_type : void 0
      };
    });
  }
};
exports.CurrentFleetController = CurrentFleetController;