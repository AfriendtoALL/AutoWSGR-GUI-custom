"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskGroupView = void 0;
var scrollPosition_1 = require_scrollPosition();
var TaskGroupView = class {
  constructor() {
    this.nameInput = document.getElementById("task-group-name");
    this.itemsEl = document.getElementById("task-group-items");
    this.countEl = document.getElementById("task-group-count");
    document.getElementById("btn-tg-new")?.addEventListener("click", () => this.onNewGroup?.());
    document.getElementById("btn-tg-save")?.addEventListener("click", () => this.onSaveGroup?.());
    document.getElementById("btn-tg-open-loader")?.addEventListener("click", () => this.onOpenGroupLoader?.());
    this.nameInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter")
        return;
      event.preventDefault();
      this.onSaveGroup?.();
    });
    document.getElementById("btn-tg-load-all")?.addEventListener("click", () => this.onLoadAll?.());
    document.getElementById("btn-tg-add-managed-plan")?.addEventListener("click", () => this.onAddManagedPlan?.());
    document.getElementById("btn-tg-add-daily-plan")?.addEventListener("click", () => this.onAddDailyPlan?.());
    document.addEventListener("click", () => this.hideContextMenu());
    document.getElementById("ctx-edit")?.addEventListener("click", () => {
      this.hideContextMenu();
      this.onContextMenuEdit?.();
    });
  }
  showContextMenu(x, y) {
    const menu = document.getElementById("context-menu");
    if (!menu)
      return;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "";
  }
  hideContextMenu() {
    const menu = document.getElementById("context-menu");
    if (menu)
      menu.style.display = "none";
  }
  render(vo) {
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(this.itemsEl);
    if (this.nameInput.dataset["activeGroup"] !== vo.activeGroupName) {
      this.nameInput.value = vo.activeGroupName;
      this.nameInput.dataset["activeGroup"] = vo.activeGroupName;
    }
    if (this.countEl)
      this.countEl.textContent = `${vo.items.length} \u9879`;
    this.itemsEl.innerHTML = "";
    if (vo.items.length === 0) {
      this.itemsEl.innerHTML = '<p class="tg-empty">\u6682\u65E0\u4EFB\u52A1\uFF0C\u53EF\u901A\u8FC7\u300C\u52A0\u8F7D\u8BA1\u5212\u300D\u6216\u300C\u52A0\u8F7D\u65E5\u5E38\u4EFB\u52A1\u300D\u6DFB\u52A0\u3002</p>';
      (0, scrollPosition_1.restoreScrollPosition)(this.itemsEl, scrollPosition);
      return;
    }
    for (let i = 0; i < vo.items.length; i++) {
      const item = vo.items[i];
      const meta = vo.itemMetas?.[i] ?? null;
      this.itemsEl.appendChild(this.createItemRow(item, i, meta));
    }
    (0, scrollPosition_1.restoreScrollPosition)(this.itemsEl, scrollPosition);
  }
  getGroupName() {
    return this.nameInput.value.trim();
  }
  createItemRow(item, index, meta) {
    const row = document.createElement("div");
    row.className = "tg-item";
    row.draggable = true;
    row.dataset["index"] = String(index);
    const handle = document.createElement("span");
    handle.className = "tg-drag-handle";
    handle.textContent = "\u283F";
    row.appendChild(handle);
    const order = document.createElement("span");
    order.className = "tg-order";
    order.textContent = String(index + 1).padStart(2, "0");
    row.appendChild(order);
    const content = document.createElement("div");
    content.className = "tg-content";
    const heading = document.createElement("div");
    heading.className = "tg-item-heading";
    const label = document.createElement("span");
    label.className = "tg-label";
    label.textContent = item.label;
    label.title = item.dailyFile ?? item.managedFile ?? item.path ?? item.templateId ?? "";
    const fleetTag = document.createElement("span");
    fleetTag.className = "tg-fleet-tag";
    fleetTag.textContent = meta?.fleetPresetName ?? "";
    fleetTag.title = `\u4F7F\u7528\u961F\u4F0D\uFF1A${meta?.fleetPresetName ?? ""}`;
    fleetTag.hidden = !meta?.fleetPresetName;
    const source = document.createElement("span");
    source.className = `tg-source ${this.sourceClass(item)}`;
    source.textContent = this.sourceLabel(item);
    heading.append(label, fleetTag, source);
    const detail = document.createElement("span");
    detail.className = "tg-detail";
    const fileName = item.dailyFile ?? item.managedFile ?? item.path?.split(/[\\/]/).pop() ?? item.templateId ?? item.label;
    const parts = [fileName];
    if (meta) {
      if (meta.typeLabel)
        parts.push(meta.typeLabel);
      if (meta.mapName)
        parts.push(meta.mapName);
      if (meta.fleetId)
        parts.push(`\u7B2C ${meta.fleetId} \u8230\u961F`);
      if (meta.repairMode)
        parts.push(meta.repairMode);
    }
    detail.textContent = parts.filter(Boolean).join(" \xB7 ");
    detail.title = [
      item.managedFile ?? item.path ?? "",
      meta?.fleet?.filter(Boolean).join(" / ") ?? ""
    ].filter(Boolean).join("\n");
    content.append(heading, detail);
    row.appendChild(content);
    const controls = document.createElement("div");
    controls.className = "tg-controls";
    const timesField = document.createElement("label");
    timesField.className = "tg-times-field";
    const timesLabel = document.createElement("span");
    timesLabel.textContent = "\u6267\u884C";
    const times = document.createElement("input");
    times.type = "number";
    times.className = "input tg-times";
    times.min = "1";
    times.max = "9999";
    times.title = "\u6267\u884C\u6B21\u6570";
    times.value = String(item.times);
    times.disabled = item.dailyTaskType === "exercise";
    times.addEventListener("change", () => {
      this.onTimesChange?.(index, Math.max(1, parseInt(times.value, 10) || 1));
    });
    const timesUnit = document.createElement("span");
    timesUnit.textContent = "\u6B21";
    timesField.append(timesLabel, times, timesUnit);
    const load = document.createElement("button");
    load.type = "button";
    load.className = "btn btn-small tg-load-item";
    load.textContent = "\u52A0\u5165\u961F\u5217";
    load.addEventListener("click", () => this.onLoadItem?.(index));
    const remove = document.createElement("button");
    remove.className = "tg-remove";
    remove.title = "\u79FB\u9664";
    remove.textContent = "\u2715";
    remove.addEventListener("click", () => this.onRemoveItem?.(index));
    controls.append(timesField, load, remove);
    row.appendChild(controls);
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.onEditItem?.(index, e.clientX, e.clientY);
    });
    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.setData("application/x-tg-item", String(index));
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      this.itemsEl.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      this.itemsEl.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const fromStr = e.dataTransfer.getData("text/plain");
      const from = parseInt(fromStr, 10);
      const to = parseInt(row.dataset["index"], 10);
      if (!isNaN(from) && !isNaN(to) && from !== to) {
        this.onMoveItem?.(from, to);
      }
    });
    return row;
  }
  sourceClass(item) {
    if (item.kind === "daily")
      return "daily";
    if (item.managedSource === "system")
      return "system";
    if (item.managedSource === "user")
      return "user";
    if (item.kind === "template")
      return "template";
    return "local";
  }
  sourceLabel(item) {
    if (item.kind === "daily")
      return "\u65E5\u5E38\u4EFB\u52A1";
    if (item.managedSource === "system")
      return "\u7CFB\u7EDF\u9884\u8BBE";
    if (item.managedSource === "user")
      return "\u7528\u6237\u9884\u8BBE";
    if (item.kind === "template")
      return "\u4EFB\u52A1\u6A21\u677F";
    if (item.kind === "preset")
      return "\u4EFB\u52A1\u9884\u8BBE";
    return "\u672C\u5730\u6587\u4EF6";
  }
};
exports.TaskGroupView = TaskGroupView;