"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationConflictView = void 0;
var MigrationConflictView = class {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.dialog = this.element("migration-conflict-dialog");
    this.count = this.element("migration-conflict-count");
    this.deleteTitle = this.element("migration-conflict-delete-title");
    this.keepTitle = this.element("migration-conflict-keep-title");
    this.deleteList = this.element("migration-conflict-delete-list");
    this.keepList = this.element("migration-conflict-keep-list");
    this.status = this.element("migration-conflict-status");
    this.selectAllDelete = this.button("btn-select-all-migration-delete");
    this.selectAllKeep = this.button("btn-select-all-migration-keep");
    this.moveKeep = this.button("btn-migration-move-keep");
    this.moveDelete = this.button("btn-migration-move-delete");
    this.keepAll = this.button("btn-migration-keep-all");
    this.confirm = this.button("btn-confirm-migration-conflicts");
    this.conflicts = [];
    this.keepIds = /* @__PURE__ */ new Set();
    this.selectedDeleteIds = /* @__PURE__ */ new Set();
    this.selectedKeepIds = /* @__PURE__ */ new Set();
    this.selectAllDelete.addEventListener("click", () => {
      this.toggleSelectAll(false);
    });
    this.selectAllKeep.addEventListener("click", () => {
      this.toggleSelectAll(true);
    });
    this.moveKeep.addEventListener("click", () => this.moveSelected(true));
    this.moveDelete.addEventListener("click", () => this.moveSelected(false));
    this.keepAll.addEventListener("click", () => {
      this.conflicts.forEach((conflict) => this.keepIds.add(conflict.id));
      this.clearSelections();
      this.render();
    });
    this.confirm.addEventListener("click", () => {
      this.callbacks.onSubmit([...this.keepIds]);
    });
  }
  /** 打开弹窗；默认全部保留，避免用户误操作造成数据丢失。 */
  open(conflicts) {
    this.conflicts = conflicts.map((conflict) => structuredClone(conflict));
    this.keepIds.clear();
    this.conflicts.forEach((conflict) => this.keepIds.add(conflict.id));
    this.clearSelections();
    this.setStatus("");
    this.setBusy(false);
    this.render();
    this.dialog.style.display = "flex";
  }
  close() {
    this.dialog.style.display = "none";
  }
  deleteCount() {
    return this.conflicts.length - this.keepIds.size;
  }
  setBusy(busy) {
    [
      this.selectAllDelete,
      this.selectAllKeep,
      this.moveKeep,
      this.moveDelete,
      this.keepAll,
      this.confirm
    ].forEach((button) => {
      button.disabled = busy;
    });
    this.confirm.textContent = busy ? "\u6B63\u5728\u5904\u7406..." : "\u786E\u8BA4\u5904\u7406";
  }
  setStatus(message) {
    this.status.textContent = message;
    this.status.hidden = !message;
  }
  /** 删除失败时只保留仍需用户处理的项目。 */
  replace(conflicts) {
    this.open(conflicts);
  }
  render() {
    const deleteConflicts = this.conflicts.filter((conflict) => !this.keepIds.has(conflict.id));
    const keepConflicts = this.conflicts.filter((conflict) => this.keepIds.has(conflict.id));
    this.count.textContent = `${this.conflicts.length} \u9879\u51B2\u7A81`;
    this.deleteTitle.textContent = `\u5220\u9664\uFF08${deleteConflicts.length}\uFF09`;
    this.keepTitle.textContent = `\u4FDD\u7559\uFF08${keepConflicts.length}\uFF09`;
    this.renderColumn(this.deleteList, deleteConflicts, this.selectedDeleteIds, "\u6682\u65E0\u5F85\u5220\u9664\u914D\u7F6E");
    this.renderColumn(this.keepList, keepConflicts, this.selectedKeepIds, "\u6682\u65E0\u4FDD\u7559\u914D\u7F6E");
    this.updateSelectionButton(this.selectAllDelete, deleteConflicts, this.selectedDeleteIds);
    this.updateSelectionButton(this.selectAllKeep, keepConflicts, this.selectedKeepIds);
    this.moveKeep.disabled = this.selectedDeleteIds.size === 0;
    this.moveDelete.disabled = this.selectedKeepIds.size === 0;
  }
  renderColumn(target, conflicts, selected, emptyText) {
    target.innerHTML = "";
    if (conflicts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "migration-conflict-empty";
      empty.textContent = emptyText;
      target.appendChild(empty);
      return;
    }
    for (const conflict of conflicts) {
      target.appendChild(this.createCard(conflict, selected));
    }
  }
  /** 卡片沿用任务队列的紧凑结构，并在下方补充冲突原因。 */
  createCard(conflict, selected) {
    const card = document.createElement("label");
    card.className = "task-queue-item migration-conflict-card";
    const mainRow = document.createElement("span");
    mainRow.className = "tq-main-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(conflict.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked)
        selected.add(conflict.id);
      else
        selected.delete(conflict.id);
      this.render();
    });
    const name = document.createElement("span");
    name.className = "tq-name";
    name.textContent = conflict.name;
    const kind = document.createElement("span");
    kind.className = "tq-priority";
    kind.textContent = conflict.kind === "daily" ? "\u65E5\u5E38\u4EFB\u52A1" : "\u51FA\u5F81\u8BA1\u5212";
    mainRow.append(checkbox, name, kind);
    const file = document.createElement("span");
    file.className = "migration-conflict-file";
    file.textContent = conflict.file;
    const reasons = document.createElement("span");
    reasons.className = "migration-conflict-reasons";
    for (const conflictReason of conflict.reasons) {
      const reason = document.createElement("span");
      reason.textContent = `\u51B2\u7A81\u539F\u56E0\uFF1A${conflictReason.reason}`;
      reasons.appendChild(reason);
    }
    card.append(mainRow, file, reasons);
    return card;
  }
  toggleSelectAll(keepColumn) {
    const conflicts = this.conflicts.filter((conflict) => this.keepIds.has(conflict.id) === keepColumn);
    const selected = keepColumn ? this.selectedKeepIds : this.selectedDeleteIds;
    const allSelected = conflicts.length > 0 && conflicts.every((conflict) => selected.has(conflict.id));
    selected.clear();
    if (!allSelected) {
      conflicts.forEach((conflict) => selected.add(conflict.id));
    }
    this.render();
  }
  moveSelected(toKeep) {
    const selected = toKeep ? this.selectedDeleteIds : this.selectedKeepIds;
    for (const id of selected) {
      if (toKeep)
        this.keepIds.add(id);
      else
        this.keepIds.delete(id);
    }
    this.clearSelections();
    this.render();
  }
  updateSelectionButton(button, conflicts, selected) {
    const allSelected = conflicts.length > 0 && conflicts.every((conflict) => selected.has(conflict.id));
    button.textContent = allSelected ? "\u53D6\u6D88\u5168\u9009" : "\u5168\u9009";
    button.disabled = conflicts.length === 0;
  }
  clearSelections() {
    this.selectedDeleteIds.clear();
    this.selectedKeepIds.clear();
  }
  element(id) {
    const element = document.getElementById(id);
    if (!element)
      throw new Error(`\u7F3A\u5C11\u8FC1\u79FB\u51B2\u7A81\u754C\u9762\u5143\u7D20\uFF1A${id}`);
    return element;
  }
  button(id) {
    return this.element(id);
  }
};
exports.MigrationConflictView = MigrationConflictView;