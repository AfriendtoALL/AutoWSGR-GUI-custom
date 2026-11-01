"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetSlotBoardView = void 0;
exports.parseSlotDragPayload = parseSlotDragPayload;
exports.slotDragPayload = slotDragPayload;
var scrollPosition_1 = require_scrollPosition();
var ShipArtwork_1 = require_ShipArtwork();
var SLOT_GROUPS = ["main", "backup"];
var DEFAULT_EMPTY_LABELS = {
  main: (index) => `\u4F4D\u7F6E ${index + 1}`,
  backup: (index) => `\u5907\u9009 ${index + 1}`
};
/** 拖拽负载：槽位 {source:"slot",group,index}，图鉴 {source:"gallery",shipId}。 */
function slotDragPayload(payload) {
  return JSON.stringify(payload);
}
function parseSlotDragPayload(raw) {
  if (!raw)
    return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object")
    return null;
  if (data.source === "gallery") {
    const shipId = Number(data.shipId);
    return Number.isInteger(shipId) ? { group: "gallery", shipId } : null;
  }
  if (data.source !== "slot" || !SLOT_GROUPS.includes(data.group))
    return null;
  const index = Number(data.index);
  if (!Number.isInteger(index) || index < 0)
    return null;
  return { group: data.group, index };
}
/**
 * 7.8/R43：常规编队与决战编队共用的槽位板。
 * 负责两列槽位的 DOM、点击/删除/拖拽委托与滚动位置保持；
 * 具体模式差异（是否可编辑、附加校验徽标、状态映射）由调用方描述符决定。
 */
var FleetSlotBoardView = class {
  constructor(options) {
    this.options = options;
    this.host = options.host;
    this.mime = options.mime;
    this.mainList = options.mainList;
    this.backupList = options.backupList;
    this.mainScroll = options.mainList.closest(".fleet-slot-scroll");
    this.backupScroll = options.backupList.parentElement;
    this.backupDragScroll = null;
    this.eventController = new AbortController();
    this.bindList(this.mainList);
    this.bindList(this.backupList);
  }
  dispose() {
    this.eventController.abort();
  }
  listOf(group) {
    return group === "backup" ? this.backupList : this.mainList;
  }
  scrollOf(group) {
    return group === "backup" ? this.backupScroll : this.mainScroll;
  }
  rememberBackupScroll() {
    this.backupDragScroll = (0, scrollPosition_1.captureScrollPosition)(this.backupScroll);
  }
  clearBackupDragScroll() {
    this.backupDragScroll = null;
  }
  clearDragOver() {
    for (const list of [this.mainList, this.backupList]) {
      list.querySelectorAll(".fleet-slot.drag-over").forEach((slot) => slot.classList.remove("drag-over"));
    }
  }
  scrollSlotIntoView(group, index, behavior) {
    requestAnimationFrame(() => {
      const options = {
        block: "nearest",
        inline: "nearest"
      };
      if (behavior)
        options.behavior = behavior;
      this.listOf(group).querySelector(`[data-slot-index="${index}"]`)?.scrollIntoView(options);
    });
  }
  /** 重新渲染一列槽位，并保持（或拖拽期间的）滚动位置。 */
  render(group, slots) {
    const scroll = this.scrollOf(group);
    const position = group === "backup" ? this.backupDragScroll ?? (0, scrollPosition_1.captureScrollPosition)(scroll) : (0, scrollPosition_1.captureScrollPosition)(scroll);
    const fragment = document.createDocumentFragment();
    for (const slot of slots) {
      fragment.append(this.createSlot(group, slot));
    }
    this.listOf(group).replaceChildren(fragment);
    (0, scrollPosition_1.restoreScrollPosition)(scroll, position);
  }
  createSlot(group, slot) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `fleet-slot fleet-${group === "main" ? "formation" : "backup"}-slot`;
    element.dataset["slotGroup"] = group;
    element.dataset["slotIndex"] = String(slot.index);
    element.dataset["slotDraggable"] = String(Boolean(slot.draggable));
    element.classList.toggle("active", Boolean(slot.active));
    element.classList.toggle("candidate-only", Boolean(slot.candidateOnly));
    element.draggable = Boolean(slot.draggable);
    if (slot.title)
      element.title = slot.title;
    if (slot.ariaLabel)
      element.setAttribute("aria-label", slot.ariaLabel);
    if (slot.candidateOnly && slot.placeholderBackgroundUrl) {
      const background = document.createElement("img");
      background.className = "fleet-slot-placeholder-background";
      background.src = slot.placeholderBackgroundUrl;
      background.alt = "";
      background.draggable = false;
      element.append(background);
    }
    if (slot.ship) {
      const artwork = (0, ShipArtwork_1.createShipArtwork)(slot.ship, {
        shipTypeLabel: slot.shipTypeLabel,
        displayName: slot.ship.name
      });
      if (slot.badge) {
        const preview = document.createElement("span");
        preview.className = "fleet-validation-preview";
        const badge = document.createElement("span");
        badge.className = ["fleet-validation-badge", slot.badge.relaxed ? "is-relaxed" : "is-strict"].join(" ");
        badge.textContent = slot.badge.text;
        preview.append(badge);
        artwork.append(preview);
      }
      element.append(artwork);
    } else {
      const empty = document.createElement("span");
      empty.className = "fleet-slot-empty";
      empty.textContent = slot.emptyLabel ?? slot.fallbackName ?? DEFAULT_EMPTY_LABELS[group](slot.index);
      element.append(empty);
    }
    const removable = slot.removable !== false && Boolean(slot.ship || slot.fallbackName);
    if (removable) {
      const label = slot.removeLabel ?? `\u79FB\u9664 ${slot.ship ? slot.ship.name : slot.fallbackName}`;
      const remove = document.createElement("span");
      remove.className = "fleet-slot-remove";
      remove.dataset["slotRemove"] = String(slot.index);
      remove.setAttribute("role", "button");
      remove.setAttribute("aria-label", label);
      remove.title = label;
      remove.textContent = "\xD7";
      element.append(remove);
    }
    return element;
  }
  bindList(list) {
    const listenerOptions = {
      signal: this.eventController.signal
    };
    list.addEventListener("click", (event) => {
      const target = event.target;
      const slot = target.closest("[data-slot-index]");
      if (!slot)
        return;
      const group = slot.dataset["slotGroup"];
      const index = Number(slot.dataset["slotIndex"]);
      if (!Number.isInteger(index) || index < 0)
        return;
      if (target.closest("[data-slot-remove]")) {
        event.stopPropagation();
        this.host.onRemove(group, index);
        return;
      }
      this.host.onSelect(group, index);
    }, listenerOptions);
    list.addEventListener("dragstart", (event) => {
      const slot = event.target.closest("[data-slot-index]");
      if (!slot || !event.dataTransfer || slot.dataset["slotDraggable"] !== "true")
        return;
      const group = slot.dataset["slotGroup"];
      const index = Number(slot.dataset["slotIndex"]);
      this.rememberBackupScroll();
      slot.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(this.mime, slotDragPayload({
        source: "slot",
        group,
        index
      }));
    }, listenerOptions);
    list.addEventListener("dragend", (event) => {
      const slot = event.target.closest("[data-slot-index]");
      if (slot)
        slot.classList.remove("is-dragging");
      this.clearBackupDragScroll();
      this.clearDragOver();
    }, listenerOptions);
    list.addEventListener("dragover", (event) => {
      const slot = event.target.closest("[data-slot-index]");
      if (!slot || !event.dataTransfer?.types.includes(this.mime))
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      slot.classList.add("drag-over");
    }, listenerOptions);
    list.addEventListener("dragleave", (event) => {
      const slot = event.target.closest("[data-slot-index]");
      if (slot && !slot.contains(event.relatedTarget)) {
        slot.classList.remove("drag-over");
      }
    }, listenerOptions);
    list.addEventListener("drop", (event) => {
      const slot = event.target.closest("[data-slot-index]");
      if (!slot || !event.dataTransfer)
        return;
      event.preventDefault();
      slot.classList.remove("drag-over");
      const payload = parseSlotDragPayload(event.dataTransfer.getData(this.mime));
      const index = Number(slot.dataset["slotIndex"]);
      try {
        if (payload && Number.isInteger(index))
          this.host.onDrop(payload, slot.dataset["slotGroup"], index);
      } finally {
        this.host.afterDrop?.();
        this.clearBackupDragScroll();
        this.clearDragOver();
      }
    }, listenerOptions);
  }
};
exports.FleetSlotBoardView = FleetSlotBoardView;