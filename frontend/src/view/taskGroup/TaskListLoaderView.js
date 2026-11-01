"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskListLoaderView = void 0;
var scrollPosition_1 = require_scrollPosition();
var LoaderDialog_1 = require_LoaderDialog();
var TaskListLoaderView = class {
  constructor() {
    this.actions = null;
    this.draggedIndex = null;
    this.dialog = document.getElementById("task-list-loader");
    this.count = document.getElementById("task-list-loader-count");
    this.groups = document.getElementById("task-list-loader-groups");
    this.previewTitle = document.getElementById("task-list-loader-preview-title");
    this.preview = document.getElementById("task-list-loader-preview");
    this.confirmButton = document.getElementById("btn-confirm-task-list-loader");
    this.modal = new LoaderDialog_1.LoaderDialog(this.dialog);
  }
  bindActions(actions) {
    this.actions = actions;
    document.getElementById("btn-cancel-task-list-loader")?.addEventListener("click", actions.onClose);
    this.confirmButton.addEventListener("click", actions.onConfirm);
    this.modal.bindDismiss(actions.onClose);
  }
  open() {
    this.modal.open();
  }
  close() {
    this.modal.close();
    this.draggedIndex = null;
  }
  isOpen() {
    return this.modal.isOpen();
  }
  render(viewObject) {
    this.count.textContent = `\u5171 ${viewObject.groupCount} \u4E2A\u8BA1\u5212\u7EC4`;
    this.confirmButton.disabled = !viewObject.selectedGroupName;
    this.renderGroups(viewObject.groups);
    this.renderPreview(viewObject);
  }
  renderGroups(groups) {
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(this.groups);
    this.groups.innerHTML = "";
    if (groups.length === 0) {
      this.appendEmpty(this.groups, "\u6682\u65E0\u5DF2\u4FDD\u5B58\u7684\u4EFB\u52A1\u5217\u8868");
      (0, scrollPosition_1.restoreScrollPosition)(this.groups, scrollPosition);
      return;
    }
    groups.forEach((group) => {
      const card = document.createElement("div");
      card.className = "task-list-loader-group-card";
      card.classList.toggle("active", group.selected);
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "task-list-loader-group-select";
      const name = document.createElement("strong");
      name.textContent = group.name;
      const count = document.createElement("span");
      count.textContent = `${group.itemCount} \u4E2A\u51FA\u5F81\u8BA1\u5212`;
      selectButton.append(name, count);
      selectButton.addEventListener("click", () => {
        this.actions?.onSelectGroup(group.name);
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "task-list-loader-group-delete";
      deleteButton.textContent = "\u5220\u9664";
      deleteButton.title = `\u5220\u9664\u4EFB\u52A1\u5217\u8868\u300C${group.name}\u300D`;
      deleteButton.addEventListener("click", () => {
        this.actions?.onDeleteGroup(group.name);
      });
      card.append(selectButton, deleteButton);
      this.groups.appendChild(card);
    });
    (0, scrollPosition_1.restoreScrollPosition)(this.groups, scrollPosition);
  }
  renderPreview(viewObject) {
    this.previewTitle.textContent = viewObject.selectedGroupName ? `\u8BA1\u5212\u5217\u8868\u9884\u89C8\uFF1A${viewObject.selectedGroupName}` : "\u8BA1\u5212\u5217\u8868\u9884\u89C8\uFF1A\u672A\u9009\u62E9";
    this.preview.innerHTML = "";
    if (!viewObject.selectedGroupName) {
      this.appendEmpty(this.preview, "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u4E00\u4E2A\u8BA1\u5212\u7EC4");
      return;
    }
    if (viewObject.items.length === 0) {
      this.appendEmpty(this.preview, "\u8BE5\u8BA1\u5212\u7EC4\u5C1A\u672A\u5173\u8054\u51FA\u5F81\u8BA1\u5212");
      return;
    }
    viewObject.items.forEach((item, index) => {
      this.preview.appendChild(this.createPreviewCard(item, index));
    });
  }
  createPreviewCard(item, index) {
    const card = document.createElement("div");
    card.className = "task-list-loader-plan-card";
    card.draggable = true;
    card.dataset["index"] = String(index);
    const handle = document.createElement("span");
    handle.className = "tg-drag-handle";
    handle.textContent = "\u283F";
    const order = document.createElement("span");
    order.className = "tg-order";
    order.textContent = String(index + 1).padStart(2, "0");
    const content = document.createElement("div");
    content.className = "tg-content";
    const heading = document.createElement("div");
    heading.className = "tg-item-heading";
    const label = document.createElement("strong");
    label.className = "tg-label";
    label.textContent = item.label;
    const fleetTag = document.createElement("span");
    fleetTag.className = "tg-fleet-tag";
    fleetTag.textContent = item.fleetPresetName;
    fleetTag.title = `\u4F7F\u7528\u961F\u4F0D\uFF1A${item.fleetPresetName}`;
    fleetTag.hidden = !item.fleetPresetName;
    const source = document.createElement("span");
    source.className = `tg-source ${item.sourceClass}`;
    source.textContent = item.sourceLabel;
    heading.append(label, fleetTag, source);
    const fileName = document.createElement("span");
    fileName.className = "tg-detail";
    fileName.textContent = item.fileName;
    content.append(heading, fileName);
    const times = document.createElement("span");
    times.className = "task-list-loader-plan-times";
    times.textContent = `\u6267\u884C ${item.times} \u6B21`;
    card.append(handle, order, content, times);
    card.addEventListener("dragstart", (event) => {
      this.draggedIndex = index;
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      this.draggedIndex = null;
      card.classList.remove("dragging");
      this.preview.querySelectorAll(".drag-over").forEach((element) => {
        element.classList.remove("drag-over");
      });
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("drag-over");
      const fromIndex = this.draggedIndex;
      this.draggedIndex = null;
      if (fromIndex !== null) {
        this.actions?.onMoveItem(fromIndex, index);
      }
    });
    return card;
  }
  appendEmpty(container, message) {
    const empty = document.createElement("div");
    empty.className = "fleet-team-loader-preview-empty";
    empty.textContent = message;
    container.appendChild(empty);
  }
};
exports.TaskListLoaderView = TaskListLoaderView;