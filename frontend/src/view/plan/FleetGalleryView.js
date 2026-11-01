"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetGalleryView = exports.DECISIVE_DRAG_MIME = exports.FLEET_DRAG_MIME = void 0;
var ShipGalleryView_1 = require_ShipGalleryView();
exports.FLEET_DRAG_MIME = "application/x-autowsgr-fleet";
exports.DECISIVE_DRAG_MIME = "application/x-autowsgr-decisive-ship";
/** 7.8/R43：常规/决战两页的图鉴 DOM 只有 id 前缀不同，统一在这张表维护。 */
var GALLERY_LAYOUTS = {
  fleet: {
    mime: exports.FLEET_DRAG_MIME,
    gallery: "fleet-ship-gallery",
    countLabel: "fleet-library-count",
    searchInput: "fleet-ship-search",
    filterTrigger: "[data-fleet-filter-trigger]",
    filterCount: "fleet-filter-count",
    filterPopover: "fleet-filter-popover",
    typeOptions: "fleet-filter-types",
    countryOptions: "fleet-filter-countries",
    refitFilter: "fleet-filter-refit-only",
    sortDescending: "fleet-sort-desc",
    resetButton: "btn-reset-fleet-filter",
    confirmButton: "btn-confirm-fleet-filter"
  },
  decisive: {
    mime: exports.DECISIVE_DRAG_MIME,
    gallery: "decisive-ship-gallery",
    countLabel: "decisive-gallery-count",
    searchInput: "decisive-gallery-search",
    filterTrigger: "[data-decisive-filter-trigger]",
    filterCount: "decisive-filter-count",
    filterPopover: "decisive-filter-popover",
    typeOptions: "decisive-filter-types",
    countryOptions: "decisive-filter-countries",
    refitFilter: "decisive-filter-refit-only",
    sortDescending: "decisive-sort-desc",
    resetButton: "btn-reset-decisive-filter",
    confirmButton: "btn-confirm-decisive-filter"
  }
};
function layoutElement(id) {
  const element = document.getElementById(id);
  if (!element)
    throw new Error(`\u7F3A\u5C11\u7F16\u961F\u56FE\u9274\u5143\u7D20: #${id}`);
  return element;
}
function galleryElements(layoutName) {
  const layout = GALLERY_LAYOUTS[layoutName];
  if (!layout)
    throw new Error(`\u672A\u77E5\u7684\u7F16\u961F\u56FE\u9274\u5E03\u5C40: ${layoutName}`);
  return {
    gallery: layoutElement(layout.gallery),
    countLabel: layoutElement(layout.countLabel),
    searchInput: layoutElement(layout.searchInput),
    filterButtons: Array.from(document.querySelectorAll(layout.filterTrigger)),
    filterCount: layoutElement(layout.filterCount),
    filterPopover: layoutElement(layout.filterPopover),
    typeOptions: layoutElement(layout.typeOptions),
    countryOptions: layoutElement(layout.countryOptions),
    refitFilter: layoutElement(layout.refitFilter),
    sortDescending: layoutElement(layout.sortDescending),
    resetButton: layoutElement(layout.resetButton),
    confirmButton: layoutElement(layout.confirmButton)
  };
}
/** 图鉴主体复用 ShipGalleryView；这里只补布局 id 与两页的行为差异。 */
var FleetGalleryView = class extends ShipGalleryView_1.ShipGalleryView {
  constructor(layoutName, host) {
    const layout = GALLERY_LAYOUTS[layoutName] ?? GALLERY_LAYOUTS.fleet;
    super(galleryElements(layoutName), {
      getRefitFilter: () => host.getRefitFilter?.() ?? false,
      setRefitFilter: (enabled) => host.setRefitFilter?.(enabled),
      getGalleryState: () => host.getGalleryState?.() ?? null,
      setGalleryState: (state) => host.setGalleryState?.(state),
      activeSlotDescription: () => host.activeSlotDescription?.() ?? "",
      isExcluded: (ship) => host.isExcluded?.(ship) ?? false,
      assignShip: (ship) => host.assignShip?.(ship),
      isInteractionEnabled: () => host.isInteractionEnabled?.() ?? true,
      shipDisplayName: (ship) => host.shipDisplayName?.(ship) ?? ship.name,
      unavailableCountLabel: host.unavailableCountLabel,
      unavailableMessage: host.unavailableMessage,
      drag: {
        mime: layout.mime,
        serialize: (ship) => JSON.stringify({
          source: "gallery",
          shipId: ship.id
        }),
        onStart: () => host.drag?.onStart?.(),
        onEnd: () => host.drag?.onEnd?.()
      }
    });
    this.layoutName = layoutName;
  }
};
exports.FleetGalleryView = FleetGalleryView;