"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipGalleryView = void 0;
var fleetShipTypes_1 = require_fleetShipTypes();
var scrollPosition_1 = require_scrollPosition();
var GalleryShipCollection_1 = require_GalleryShipCollection();
var ShipArtwork_1 = require_ShipArtwork();
var EMPTY_LABELS = {
  ship_types: {},
  size_classes: {},
  role_classes: {},
  countries: {},
  variants: {}
};
var ShipGalleryView = class {
  constructor(elements, host) {
    this.elements = elements;
    this.host = host;
    this.eventController = new AbortController();
    this.disposed = false;
    this.labels = EMPTY_LABELS;
    this.shipItems = [];
    this.visibleShips = [];
    this.backgroundUrl = "";
    this.renderedShipCount = 0;
    this.groupFilter = "all";
    this.typeFilters = /* @__PURE__ */ new Set();
    this.countryFilters = /* @__PURE__ */ new Set();
    this.sortField = "id";
    this.descending = false;
    this.dragScrollTop = null;
    this.restoredScrollPosition = null;
    this.restoredRenderedShipCount = 0;
    const restoredState = this.host.getGalleryState?.() ?? null;
    if (restoredState) {
      this.elements.searchInput.value = restoredState.searchText;
      this.groupFilter = restoredState.groupFilter;
      this.typeFilters = new Set(restoredState.typeFilters);
      this.countryFilters = new Set(restoredState.countryFilters);
      this.sortField = restoredState.sortField;
      this.descending = restoredState.descending;
      this.restoredScrollPosition = {
        top: restoredState.scrollTop,
        left: restoredState.scrollLeft
      };
      this.restoredRenderedShipCount = restoredState.renderedShipCount;
    }
    this.refitOnly = restoredState?.refitOnly ?? this.host.getRefitFilter?.() ?? false;
    this.elements.refitFilter.checked = this.refitOnly;
    this.elements.sortDescending.checked = this.descending;
    this.bindActions();
    this.resizeObserver = new ResizeObserver(() => this.ensureGalleryFilled());
    this.resizeObserver.observe(this.elements.gallery);
  }
  ships() {
    return this.shipItems;
  }
  shipById(id) {
    return this.shipItems.find((ship) => ship.id === id);
  }
  colorfulBackgroundUrl() {
    return this.backgroundUrl;
  }
  shipTypeDisplay(ship) {
    const typeName = fleetShipTypes_1.TYPE_LABELS[ship.ship_type] ?? this.labels.ship_types[ship.ship_type] ?? ship.ship_type;
    return `${typeName}-${ship.ship_type.toUpperCase()}`;
  }
  showLibrary(library) {
    const preserveCurrentPosition = this.shipItems.length > 0;
    this.labels = {
      ...EMPTY_LABELS,
      ...library.labels
    };
    this.shipItems = [...library.ships];
    this.backgroundUrl = library.colorfulBackgroundUrl ?? "";
    this.renderFilterOptions();
    this.render(!preserveCurrentPosition);
  }
  clearLibrary() {
    this.labels = EMPTY_LABELS;
    this.shipItems = [];
    this.visibleShips = [];
    this.backgroundUrl = "";
  }
  showLoading() {
    this.elements.countLabel.textContent = "\u6B63\u5728\u8BFB\u53D6\u8D44\u6599\u5E93\u2026";
  }
  showLoadError(message) {
    this.elements.countLabel.textContent = this.host.unavailableCountLabel ?? "\u8D44\u6599\u5E93\u4E0D\u53EF\u7528";
    this.showMessage(message);
  }
  render(resetScroll = true) {
    this.applyFilters(resetScroll);
  }
  renderSelection() {
    this.applyFilters(false);
  }
  updateCardTargets() {
    const shipsById = new Map(this.visibleShips.map((ship) => [ship.id, ship]));
    this.elements.gallery.querySelectorAll("[data-ship-id]").forEach((card) => {
      const ship = shipsById.get(Number(card.dataset["shipId"]));
      if (ship)
        this.updateCard(card, ship);
    });
  }
  refreshInteractionState() {
    const enabled = this.isInteractionEnabled();
    this.elements.gallery.classList.toggle("is-locked", !enabled);
    this.updateCardTargets();
  }
  clearDragScroll() {
    this.dragScrollTop = null;
  }
  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    this.persistState();
    this.eventController.abort();
    this.resizeObserver.disconnect();
  }
  bindActions() {
    const { gallery, searchInput, filterButtons, filterPopover, sortDescending, refitFilter, resetButton, confirmButton } = this.elements;
    const listenerOptions = {
      signal: this.eventController.signal
    };
    gallery.addEventListener("click", (event) => {
      const card = event.target.closest("[data-ship-id]");
      if (!card || !this.isInteractionEnabled())
        return;
      const ship = this.shipById(Number(card.dataset["shipId"]));
      if (ship)
        this.host.assignShip(ship);
    }, listenerOptions);
    gallery.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-ship-id]");
      const drag = this.host.drag;
      if (!card || !drag || !event.dataTransfer || !this.isInteractionEnabled()) {
        return;
      }
      const ship = this.shipById(Number(card.dataset["shipId"]));
      if (!ship)
        return;
      this.dragScrollTop = gallery.scrollTop;
      drag.onStart?.();
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(drag.mime, drag.serialize(ship));
    }, listenerOptions);
    gallery.addEventListener("dragend", () => {
      this.dragScrollTop = null;
      this.host.drag?.onEnd?.();
    }, listenerOptions);
    gallery.addEventListener("scroll", () => {
      const remaining = gallery.scrollHeight - gallery.scrollTop - gallery.clientHeight;
      if (remaining < 480)
        this.appendGalleryBatch();
      this.persistState();
    }, listenerOptions);
    searchInput.addEventListener("input", () => this.render(), listenerOptions);
    filterButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.setFilterPopoverOpen(filterPopover.hidden);
      }, listenerOptions);
    });
    filterPopover.addEventListener("click", (event) => {
      const option = event.target.closest("[data-filter-kind]");
      if (option) {
        this.setFilter(option.dataset["filterKind"], option.dataset["filterValue"] ?? "all");
      }
      const sortOption = event.target.closest("[data-sort-field]");
      if (sortOption) {
        this.sortField = sortOption.dataset["sortField"];
        this.updateFilterControls();
        this.render();
      }
    }, listenerOptions);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!filterPopover.hidden && !filterPopover.contains(target) && !filterButtons.some((button) => button.contains(target))) {
        this.setFilterPopoverOpen(false);
      }
    }, listenerOptions);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape")
        this.setFilterPopoverOpen(false);
    }, listenerOptions);
    confirmButton.addEventListener("click", () => this.setFilterPopoverOpen(false), listenerOptions);
    sortDescending.addEventListener("change", () => {
      this.descending = sortDescending.checked;
      this.updateFilterControls();
      this.render();
    }, listenerOptions);
    refitFilter.addEventListener("change", () => {
      this.refitOnly = refitFilter.checked;
      this.host.setRefitFilter?.(this.refitOnly);
      this.updateFilterControls();
      this.render();
    }, listenerOptions);
    resetButton.addEventListener("click", () => {
      this.groupFilter = "all";
      this.typeFilters.clear();
      this.countryFilters.clear();
      this.refitOnly = false;
      this.host.setRefitFilter?.(false);
      this.sortField = "id";
      this.descending = false;
      this.updateFilterControls();
      this.render();
    }, listenerOptions);
  }
  isInteractionEnabled() {
    return this.host.isInteractionEnabled?.() ?? true;
  }
  setFilter(kind, value) {
    if (kind === "group") {
      this.groupFilter = value;
      this.typeFilters.clear();
      if (value !== "all") {
        this.shipItems.forEach((ship) => {
          if ((ship.size_class === value || ship.role_class === value) && fleetShipTypes_1.SHIP_TYPE_FILTER_ORDER.includes(ship.ship_type)) {
            this.typeFilters.add(ship.ship_type);
          }
        });
      }
    } else {
      const filters = kind === "type" ? this.typeFilters : this.countryFilters;
      if (kind === "type")
        this.groupFilter = null;
      if (value === "all") {
        filters.clear();
      } else if (filters.has(value)) {
        filters.delete(value);
      } else {
        filters.add(value);
      }
    }
    this.updateFilterControls();
    this.render();
  }
  setFilterPopoverOpen(open) {
    this.elements.filterPopover.hidden = !open;
    this.elements.filterButtons.forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
    });
  }
  renderFilterOptions() {
    this.elements.typeOptions.replaceChildren(this.createFilterOption("type", "all", "\u5168\u90E8"), ...fleetShipTypes_1.SHIP_TYPE_FILTER_ORDER.filter((code) => this.labels.ship_types[code] !== void 0).map((code) => this.createFilterOption("type", code, fleetShipTypes_1.TYPE_LABELS[code] ?? this.labels.ship_types[code])));
    this.elements.countryOptions.replaceChildren(this.createFilterOption("country", "all", "\u5168\u90E8"), ...Object.entries(this.labels.countries).map(([code, label]) => this.createFilterOption("country", code, label)));
    this.updateFilterControls();
  }
  createFilterOption(kind, value, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fleet-filter-option";
    button.dataset["filterKind"] = kind;
    button.dataset["filterValue"] = value;
    button.setAttribute("aria-pressed", "false");
    button.textContent = label;
    return button;
  }
  updateFilterControls() {
    const { filterPopover, sortDescending, refitFilter, filterCount, filterButtons } = this.elements;
    filterPopover.querySelectorAll("[data-filter-kind]").forEach((item) => {
      const kind = item.dataset["filterKind"];
      const value = item.dataset["filterValue"] ?? "all";
      const active = kind === "group" ? value === this.groupFilter : kind === "type" ? value === "all" ? this.typeFilters.size === 0 : this.typeFilters.has(value) : value === "all" ? this.countryFilters.size === 0 : this.countryFilters.has(value);
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    filterPopover.querySelectorAll("[data-sort-field]").forEach((item) => {
      item.classList.toggle("active", item.dataset["sortField"] === this.sortField);
    });
    sortDescending.checked = this.descending;
    refitFilter.checked = this.refitOnly;
    const activeFilterCount = [
      this.typeFilters.size > 0,
      this.countryFilters.size > 0,
      this.refitOnly
    ].filter(Boolean).length;
    filterCount.textContent = activeFilterCount > 0 ? String(activeFilterCount) : "";
    filterButtons.forEach((button) => {
      button.classList.toggle("active", activeFilterCount > 0 || this.sortField !== "id" || this.descending);
    });
  }
  applyFilters(resetScroll) {
    const gallery = this.elements.gallery;
    const preservedScroll = (0, scrollPosition_1.captureScrollPosition)(gallery);
    const restoringSavedPosition = resetScroll && this.restoredScrollPosition !== null;
    if (!resetScroll && this.dragScrollTop !== null) {
      preservedScroll.top = this.dragScrollTop;
    }
    const targetScrollPosition = restoringSavedPosition ? this.restoredScrollPosition : resetScroll ? { top: 0, left: 0 } : preservedScroll;
    const previousRenderedCount = restoringSavedPosition ? this.restoredRenderedShipCount : resetScroll ? 0 : this.renderedShipCount;
    this.visibleShips = (0, GalleryShipCollection_1.filterAndSortGalleryShips)(this.shipItems, {
      searchText: this.elements.searchInput.value,
      typeFilters: this.typeFilters,
      countryFilters: this.countryFilters,
      refitOnly: this.refitOnly,
      sortField: this.sortField,
      descending: this.descending,
      shipTypeLabels: this.labels.ship_types,
      isExcluded: (ship) => this.host.isExcluded(ship)
    });
    this.renderedShipCount = 0;
    gallery.replaceChildren();
    this.updateCount();
    if (this.visibleShips.length === 0) {
      this.showMessage(this.shipItems.length === 0 ? this.host.unavailableMessage ?? "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u6761\u4EF6\u7684\u8230\u5A18" : "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u6761\u4EF6\u7684\u8230\u5A18");
      (0, scrollPosition_1.restoreScrollPosition)(gallery, { top: 0, left: 0 });
      this.restoredScrollPosition = null;
      this.restoredRenderedShipCount = 0;
      this.persistState();
      return;
    }
    this.appendGalleryBatch(Math.max(this.galleryBatchSize(), previousRenderedCount));
    while (restoringSavedPosition && this.renderedShipCount < this.visibleShips.length && gallery.scrollHeight < targetScrollPosition.top + gallery.clientHeight) {
      this.appendGalleryBatch();
    }
    (0, scrollPosition_1.restoreScrollPosition)(gallery, targetScrollPosition);
    this.restoredScrollPosition = null;
    this.restoredRenderedShipCount = 0;
    this.persistState();
  }
  galleryBatchSize() {
    return (0, GalleryShipCollection_1.calculateGalleryBatchSize)(this.elements.gallery.clientWidth, this.elements.gallery.clientHeight);
  }
  ensureGalleryFilled() {
    if (this.visibleShips.length === 0)
      return;
    const missingCount = this.galleryBatchSize() - this.renderedShipCount;
    if (missingCount > 0)
      this.appendGalleryBatch(missingCount);
  }
  appendGalleryBatch(count = this.galleryBatchSize()) {
    if (this.renderedShipCount >= this.visibleShips.length)
      return;
    const gallery = this.elements.gallery;
    const preservedScroll = (0, scrollPosition_1.captureScrollPosition)(gallery);
    const fragment = document.createDocumentFragment();
    const end = Math.min(this.renderedShipCount + count, this.visibleShips.length);
    for (let index = this.renderedShipCount; index < end; index += 1) {
      fragment.append(this.createShipCard(this.visibleShips[index]));
    }
    this.renderedShipCount = end;
    gallery.append(fragment);
    (0, scrollPosition_1.restoreScrollPosition)(gallery, preservedScroll);
  }
  createShipCard(ship) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fleet-ship-card";
    card.dataset["shipId"] = String(ship.id);
    card.append((0, ShipArtwork_1.createShipArtwork)(ship, {
      shipTypeLabel: this.shipTypeDisplay(ship)
    }));
    this.updateCard(card, ship);
    return card;
  }
  updateCard(card, ship) {
    const enabled = this.isInteractionEnabled();
    card.disabled = !enabled;
    card.draggable = enabled;
    const shipName = this.host.shipDisplayName?.(ship) ?? ship.name;
    card.title = `\u5C06 ${shipName} \u653E\u5165${this.host.activeSlotDescription()}`;
  }
  updateCount() {
    this.elements.countLabel.textContent = this.shipItems.length === 0 && this.host.unavailableCountLabel ? this.host.unavailableCountLabel : `\u663E\u793A ${this.visibleShips.length} / ${this.shipItems.length} \u8258`;
  }
  persistState() {
    this.host.setGalleryState?.({
      searchText: this.elements.searchInput.value,
      groupFilter: this.groupFilter,
      typeFilters: [...this.typeFilters],
      countryFilters: [...this.countryFilters],
      refitOnly: this.refitOnly,
      sortField: this.sortField,
      descending: this.descending,
      scrollTop: this.elements.gallery.scrollTop,
      scrollLeft: this.elements.gallery.scrollLeft,
      renderedShipCount: this.renderedShipCount
    });
  }
  showMessage(message) {
    const empty = document.createElement("div");
    empty.className = "fleet-library-empty";
    empty.textContent = message;
    this.elements.gallery.replaceChildren(empty);
  }
};
exports.ShipGalleryView = ShipGalleryView;