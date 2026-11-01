"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findShipLibraryShip = findShipLibraryShip;
function normalizedName(value) {
  return value?.trim() ?? "";
}
function distinctNames(values) {
  return values.map(normalizedName).filter((value, index, names) => Boolean(value) && names.indexOf(value) === index);
}
function findBySearchName(ships, searchName) {
  return ships.find((ship) => ship.search_name === searchName && ship.variant === "normal") ?? ships.find((ship) => ship.search_name === searchName);
}
function findShipLibraryShip(ships, reference) {
  const name = normalizedName(reference.name);
  const searchName = normalizedName(reference.searchName);
  if (name) {
    const exact = ships.find((ship) => ship.name === name);
    if (exact)
      return exact;
  }
  if (searchName && searchName !== name) {
    const exactSearchName = ships.find((ship) => ship.name === searchName);
    if (exactSearchName)
      return exactSearchName;
  }
  for (const candidate of distinctNames([searchName, name])) {
    const match = findBySearchName(ships, candidate);
    if (match)
      return match;
  }
  if (!reference.allowBaseNameFallback)
    return void 0;
  const baseNames = distinctNames([name, searchName].map((value) => value.split("\xB7")[0]));
  for (const baseName of baseNames) {
    const match = ships.find((ship) => ship.name === baseName) ?? findBySearchName(ships, baseName);
    if (match)
      return match;
  }
  return void 0;
}