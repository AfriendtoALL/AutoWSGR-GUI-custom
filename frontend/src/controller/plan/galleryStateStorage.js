"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGalleryViewState = loadGalleryViewState;
exports.saveGalleryViewState = saveGalleryViewState;
var SORT_FIELDS = /* @__PURE__ */ new Set(["type", "name", "id"]);
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
function loadGalleryViewState(storage, key) {
  try {
    const raw = storage.get(key);
    if (!raw)
      return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
      return null;
    const sortField = typeof parsed["sortField"] === "string" && SORT_FIELDS.has(parsed["sortField"]) ? parsed["sortField"] : "id";
    return {
      searchText: typeof parsed["searchText"] === "string" ? parsed["searchText"] : "",
      groupFilter: parsed["groupFilter"] === null ? null : typeof parsed["groupFilter"] === "string" ? parsed["groupFilter"] : "all",
      typeFilters: stringArray(parsed["typeFilters"]),
      countryFilters: stringArray(parsed["countryFilters"]),
      refitOnly: parsed["refitOnly"] === true,
      sortField,
      descending: parsed["descending"] === true,
      scrollTop: nonNegativeNumber(parsed["scrollTop"]),
      scrollLeft: nonNegativeNumber(parsed["scrollLeft"]),
      renderedShipCount: Math.floor(nonNegativeNumber(parsed["renderedShipCount"]))
    };
  } catch {
    return null;
  }
}
function saveGalleryViewState(storage, key, state) {
  try {
    storage.set(key, JSON.stringify(state));
  } catch {
  }
}