"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanManagementView = void 0;
exports.filterVisibleSelections = filterVisibleSelections;
var scrollPosition_1 = require_scrollPosition();
function filterVisibleSelections(visibleSelections, selections, keyOf) {
  return visibleSelections.filter((selection) => selections.has(keyOf(selection)));
}
var PlanManagementView = class {
  constructor() {
    this.body = document.getElementById("plan-team-management-body");
    this.tabs = Array.from(document.querySelectorAll("[data-plan-management-source]"));
    this.kindButtons = Array.from(document.querySelectorAll("[data-plan-management-kind]"));
    this.search = document.getElementById("plan-management-search");
    this.attentionOnly = document.getElementById("plan-management-attention-only");
    this.selectAll = document.getElementById("plan-management-select-all");
    this.exportButton = document.getElementById("btn-export-user-plans");
    this.deleteButton = document.getElementById("btn-delete-user-plans");
    this.legacyExportButton = document.getElementById("btn-export-legacy-143-plans");
    this.source = "all";
    this.kind = "all";
    this.query = "";
    this.viewObject = {
      rows: [],
      errors: []
    };
    this.selections = /* @__PURE__ */ new Map();
    this.visibleSelections = [];
    this.exporting = false;
    this.deleting = false;
    this.bindActions();
  }
  showLoading() {
    if (!this.body)
      return;
    this.body.innerHTML = '<tr><td colspan="7">\u6B63\u5728\u8BFB\u53D6\u8BA1\u5212\u2026</td></tr>';
  }
  showError(message) {
    if (!this.body)
      return;
    this.body.innerHTML = "";
    const row = this.body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.className = "plan-management-empty";
    cell.textContent = message;
  }
  render(viewObject) {
    this.viewObject = viewObject;
    this.renderCurrent();
  }
  bindActions() {
    document.getElementById("btn-refresh-plan-management")?.addEventListener("click", () => {
      void this.onRefresh?.();
    });
    this.exportButton?.addEventListener("click", () => {
      void this.exportSelectedPlans();
    });
    this.legacyExportButton?.addEventListener("click", () => {
      void this.exportLegacy143Plans();
    });
    this.deleteButton?.addEventListener("click", () => {
      void this.deleteSelectedPlans();
    });
    this.selectAll?.addEventListener("change", () => {
      const selected = this.selectAll?.checked === true;
      this.visibleSelections.forEach((selection) => {
        const key = this.selectionKey(selection);
        if (selected) {
          this.selections.set(key, selection);
        } else {
          this.selections.delete(key);
        }
      });
      this.renderCurrent();
    });
    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const source = tab.dataset["planManagementSource"];
        if (source !== "all" && source !== "system" && source !== "user") {
          return;
        }
        this.source = source;
        this.renderCurrent();
      });
    });
    this.kindButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.dataset["planManagementKind"];
        if (kind !== "all" && kind !== "battle" && kind !== "team")
          return;
        this.kind = kind;
        this.renderCurrent();
      });
    });
    this.search?.addEventListener("input", () => {
      this.query = this.search?.value.trim() ?? "";
      this.renderCurrent();
    });
    this.attentionOnly?.addEventListener("change", () => {
      this.renderCurrent();
    });
    this.body?.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-plan-selection]");
      if (!checkbox)
        return;
      const kind = checkbox.dataset["planKind"];
      const file = checkbox.dataset["planFile"];
      if (kind !== "battle" && kind !== "team" || !file)
        return;
      const selection = { kind, file };
      const key = this.selectionKey(selection);
      if (checkbox.checked) {
        this.selections.set(key, selection);
      } else {
        this.selections.delete(key);
      }
      this.updateSelectionControls();
    });
    this.body?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-plan-operation]");
      if (!button)
        return;
      const file = button.dataset["planFile"];
      if (!file)
        return;
      const operation = button.dataset["planOperation"];
      if (operation === "rename") {
        void this.renameCombatPlan(file);
      } else if (operation === "delete") {
        void this.deleteCombatPlan(file);
      } else if (operation === "edit-battle") {
        const source = button.dataset["planSource"] === "system" ? "system" : "user";
        void this.onOpenBattlePlan?.(file, source);
      } else if (operation === "edit-team") {
        const source = button.dataset["planSource"] === "system" ? "system" : "user";
        void this.onOpenTeamPlan?.(file, source);
      } else if (operation === "delete-team") {
        void this.deleteTeamPlan(file, button.dataset["planName"] ?? "", button.dataset["planWarning"] ?? "");
      } else if (operation === "toggle-unlinked") {
        const kind = button.dataset["planKind"] === "team" ? "team" : "battle";
        const source = button.dataset["planSource"] === "system" ? "system" : "user";
        void this.toggleUnlinkedIgnored(kind, file, source, button.dataset["planIgnored"] !== "true");
      }
    });
  }
  renderCurrent() {
    if (!this.body)
      return;
    const scroll = this.body.closest(".plan-team-management-table-wrap");
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(scroll);
    this.renderActiveFilters();
    const rows = this.viewObject.rows;
    const sourceRows = rows.filter((row) => this.source === "all" || row.source === this.source);
    this.renderCountsAndWarnings(sourceRows);
    const visibleRows = this.filterRows(sourceRows);
    this.syncSelections(rows, visibleRows);
    this.body.replaceChildren();
    if (visibleRows.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "plan-management-empty";
      cell.textContent = sourceRows.length > 0 ? "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u7684 YAML" : "\u5F53\u524D\u76EE\u5F55\u4E2D\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684 YAML";
      row.append(cell);
      this.body.append(row);
      (0, scrollPosition_1.restoreScrollPosition)(scroll, scrollPosition);
      return;
    }
    const fragment = document.createDocumentFragment();
    visibleRows.forEach((item) => fragment.append(this.createRow(item)));
    this.body.append(fragment);
    (0, scrollPosition_1.restoreScrollPosition)(scroll, scrollPosition);
  }
  renderActiveFilters() {
    this.tabs.forEach((tab) => {
      const active = tab.dataset["planManagementSource"] === this.source;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    this.kindButtons.forEach((button) => {
      const active = button.dataset["planManagementKind"] === this.kind;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  renderCountsAndWarnings(rows) {
    const filteredErrors = this.viewObject.errors.filter((error) => this.source === "all" || error.source === this.source);
    const linkedCount = rows.filter((row) => row.kind === "battle" && row.relations.length > 0 && !row.attention).length;
    const setCount = (id, value) => {
      const element = document.getElementById(id);
      if (element)
        element.textContent = String(value);
    };
    setCount("plan-management-battle-count", rows.filter((row) => row.kind === "battle").length);
    setCount("plan-management-team-count", rows.filter((row) => row.kind === "team").length);
    setCount("plan-management-linked-count", linkedCount);
    setCount("plan-management-attention-count", rows.filter((row) => row.attention).length);
    const warning = document.getElementById("plan-management-warning");
    if (!warning)
      return;
    warning.hidden = filteredErrors.length === 0;
    warning.textContent = filteredErrors.length > 0 ? `\u6709 ${filteredErrors.length} \u4E2A YAML \u65E0\u6CD5\u8BFB\u53D6\uFF0C\u53EF\u5728\u4E0B\u65B9\u67E5\u770B\u5E76\u5904\u7406\u3002` : "";
    warning.title = filteredErrors.map((error) => `${error.source}/${error.file}: ${error.message}`).join("\n");
  }
  filterRows(rows) {
    const query = this.query.toLocaleLowerCase("zh-CN");
    const attentionOnly = this.attentionOnly?.checked ?? false;
    return rows.filter((row) => {
      if (this.kind !== "all" && row.kind !== this.kind)
        return false;
      if (attentionOnly && !row.attention)
        return false;
      if (!query)
        return true;
      return [
        row.name,
        row.file,
        row.errorMessage ?? "",
        ...row.relations,
        ...row.taskGroups
      ].some((value) => value.toLocaleLowerCase("zh-CN").includes(query));
    }).sort((left, right) => {
      if (left.attention !== right.attention)
        return left.attention ? -1 : 1;
      if (left.kind !== right.kind)
        return left.kind === "battle" ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }
  syncSelections(rows, visibleRows) {
    const availableKeys = new Set(rows.filter((row) => row.source === "user").map((row) => this.selectionKey({
      kind: row.kind,
      file: row.file
    })));
    this.selections.forEach((_selection, key) => {
      if (!availableKeys.has(key))
        this.selections.delete(key);
    });
    this.visibleSelections = visibleRows.filter((row) => row.source === "user").map((row) => ({ kind: row.kind, file: row.file }));
    this.updateSelectionControls();
  }
  createRow(item) {
    const row = document.createElement("tr");
    row.classList.toggle("needs-attention", item.attention);
    const selectionCell = this.createSelectionCell(item);
    const planCell = this.createPlanCell(item);
    const sourceCell = this.createSourceCell(item);
    const relationCell = this.createRelationCell(item);
    const taskGroupCell = this.createTaskGroupCell(item);
    const statusCell = document.createElement("td");
    if (item.status) {
      const status = document.createElement("span");
      status.className = `plan-management-status ${item.statusClass}`;
      status.textContent = item.status;
      statusCell.append(status);
    }
    row.append(selectionCell, planCell, sourceCell, relationCell, taskGroupCell, statusCell, this.createActionCell(item));
    return row;
  }
  createSelectionCell(item) {
    const cell = document.createElement("td");
    cell.className = "plan-management-selection-cell";
    if (item.source !== "user") {
      cell.title = "\u7CFB\u7EDF\u9884\u8BBE\u4E0D\u652F\u6301\u5BFC\u51FA";
      return cell;
    }
    const selection = {
      kind: item.kind,
      file: item.file
    };
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset["planSelection"] = "true";
    checkbox.dataset["planKind"] = item.kind;
    checkbox.dataset["planFile"] = item.file;
    checkbox.checked = this.selections.has(this.selectionKey(selection));
    checkbox.disabled = this.exporting || this.deleting;
    checkbox.setAttribute("aria-label", `\u9009\u62E9\u7528\u6237\u914D\u7F6E ${item.name}`);
    cell.append(checkbox);
    return cell;
  }
  createPlanCell(item) {
    const cell = document.createElement("td");
    const kind = document.createElement("span");
    kind.className = `plan-kind-badge ${item.kind}`;
    kind.textContent = item.kind === "battle" ? "\u51FA\u5F81" : "\u8230\u961F";
    const identity = document.createElement("span");
    identity.className = "plan-management-identity";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const file = document.createElement("small");
    file.textContent = item.file;
    identity.append(name, file);
    cell.append(kind, identity);
    return cell;
  }
  createSourceCell(item) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `plan-source-badge ${item.source}`;
    badge.textContent = item.source === "system" ? "\u7CFB\u7EDF" : "\u7528\u6237";
    cell.append(badge);
    return cell;
  }
  createRelationCell(item) {
    const cell = document.createElement("td");
    if (item.invalid) {
      cell.textContent = item.errorMessage || "YAML \u683C\u5F0F\u4E0D\u5408\u6CD5";
      cell.className = "plan-management-relation-error";
    } else if (item.relations.length === 0) {
      cell.textContent = item.kind === "battle" ? item.ignoredUnlinked ? "\u8BE5\u8BA1\u5212\u5DF2\u8BBE\u4E3A\u65E0\u9700\u8230\u961F\u65B9\u6848" : "\u672A\u5173\u8054\u8230\u961F\u65B9\u6848" : item.ignoredUnlinked ? "\u8BE5\u8230\u961F\u65B9\u6848\u5DF2\u5FFD\u7565\u5F15\u7528\u68C0\u67E5" : "\u5C1A\u672A\u88AB\u51FA\u5F81\u8BA1\u5212\u5F15\u7528";
      cell.className = "plan-management-relation-empty";
    } else {
      const list = document.createElement("div");
      list.className = "plan-management-relations";
      item.relations.forEach((relation) => {
        const chip = document.createElement("span");
        chip.className = item.missingRelations.includes(relation) ? "plan-relation-chip missing" : "plan-relation-chip";
        chip.textContent = relation;
        if (item.missingRelations.includes(relation)) {
          chip.title = "\u672A\u627E\u5230\u540C\u540D\u8230\u961F\u65B9\u6848";
        }
        list.append(chip);
      });
      cell.append(list);
    }
    return cell;
  }
  createTaskGroupCell(item) {
    const cell = document.createElement("td");
    if (item.kind === "team") {
      cell.textContent = "\u2014";
      cell.className = "plan-management-relation-empty";
    } else if (item.taskGroups.length === 0) {
      cell.textContent = "\u672A\u52A0\u5165\u4EFB\u52A1\u5206\u7EC4";
      cell.className = "plan-management-relation-empty";
    } else {
      const list = document.createElement("div");
      list.className = "plan-management-relations";
      item.taskGroups.forEach((groupName) => {
        const chip = document.createElement("span");
        chip.className = "plan-relation-chip";
        chip.textContent = groupName;
        list.append(chip);
      });
      cell.append(list);
    }
    return cell;
  }
  createActionCell(item) {
    const cell = document.createElement("td");
    cell.className = "plan-management-actions";
    if (item.invalid) {
      if (item.source === "user") {
        cell.append(this.actionButton("\u5220\u9664", item.kind === "battle" ? "delete" : "delete-team", item.file, true, item.source, item.name, item.deleteWarning));
      } else {
        cell.textContent = "\u53EA\u8BFB";
      }
      return cell;
    }
    if (item.kind === "battle") {
      cell.append(this.actionButton(item.source === "system" ? "\u67E5\u770B" : "\u7F16\u8F91", "edit-battle", item.file, false, item.source));
      if (item.relations.length === 0) {
        cell.append(this.unlinkedButton(item));
      }
      if (item.source === "user") {
        cell.append(this.actionButton("\u91CD\u547D\u540D", "rename", item.file), this.actionButton("\u5220\u9664", "delete", item.file, true));
      }
    } else {
      cell.append(this.actionButton(item.source === "system" ? "\u67E5\u770B" : "\u7F16\u8F91", "edit-team", item.file, false, item.source));
      if (item.relations.length === 0) {
        cell.append(this.unlinkedButton(item));
      }
      if (item.source === "user") {
        cell.append(this.actionButton("\u5220\u9664", "delete-team", item.file, true, item.source, item.name, item.deleteWarning));
      }
    }
    return cell;
  }
  unlinkedButton(item) {
    const button = this.actionButton(item.ignoredUnlinked ? "\u6062\u590D\u68C0\u67E5" : "\u5FFD\u7565\u63D0\u793A", "toggle-unlinked", item.file, false, item.source);
    button.dataset["planIgnored"] = String(item.ignoredUnlinked === true);
    button.dataset["planKind"] = item.kind;
    return button;
  }
  selectionKey(selection) {
    return `${selection.kind}:${selection.file.toLocaleLowerCase("en-US")}`;
  }
  /** 当前筛选视图下已勾选、可执行批量删除的用户配置。 */
  selectedVisibleSelections() {
    return filterVisibleSelections(this.visibleSelections, this.selections, (selection) => this.selectionKey(selection));
  }
  updateSelectionControls() {
    const visibleSelected = this.selectedVisibleSelections();
    const visibleSelectedCount = visibleSelected.length;
    if (this.selectAll) {
      this.selectAll.checked = this.visibleSelections.length > 0 && visibleSelectedCount === this.visibleSelections.length;
      this.selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < this.visibleSelections.length;
      this.selectAll.disabled = this.exporting || this.deleting || this.visibleSelections.length === 0;
    }
    if (this.exportButton) {
      this.exportButton.disabled = this.exporting || this.deleting || this.selections.size === 0;
      this.exportButton.title = this.selections.size > 0 ? `\u5BFC\u51FA\u5DF2\u9009\u62E9\u7684 ${this.selections.size} \u4E2A\u7528\u6237\u914D\u7F6E` : "\u8BF7\u5148\u9009\u62E9\u7528\u6237\u914D\u7F6E";
    }
    if (this.legacyExportButton) {
      const battleCount = [...this.selections.values()].filter((selection) => selection.kind === "battle").length;
      this.legacyExportButton.disabled = this.exporting || this.deleting || battleCount === 0;
      this.legacyExportButton.title = battleCount > 0 ? `\u5BFC\u51FA ${battleCount} \u4E2A 1.4.3 \u517C\u5BB9\u51FA\u5F81\u8BA1\u5212` : "\u8BF7\u5148\u9009\u62E9\u7528\u6237\u51FA\u5F81\u8BA1\u5212";
    }
    if (this.deleteButton) {
      this.deleteButton.disabled = this.exporting || this.deleting || visibleSelected.length === 0;
      this.deleteButton.title = visibleSelected.length > 0 ? `\u5220\u9664\u5F53\u524D\u7B5B\u9009\u4E0B\u5DF2\u9009\u62E9\u7684 ${visibleSelected.length} \u4E2A\u7528\u6237\u914D\u7F6E` : "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u5DF2\u9009\u62E9\u7684\u7528\u6237\u914D\u7F6E";
    }
    this.body?.querySelectorAll("[data-plan-selection]").forEach((checkbox) => {
      checkbox.disabled = this.exporting || this.deleting;
    });
  }
  async exportSelectedPlans() {
    if (this.exporting || this.deleting || this.selections.size === 0)
      return;
    const selections = [...this.selections.values()];
    this.exporting = true;
    this.updateSelectionControls();
    try {
      await this.onExportPlans?.(selections);
    } finally {
      this.exporting = false;
      this.updateSelectionControls();
    }
  }
  async exportLegacy143Plans() {
    if (this.exporting || this.deleting)
      return;
    const selections = [...this.selections.values()].filter((selection) => selection.kind === "battle");
    if (selections.length === 0)
      return;
    this.exporting = true;
    this.updateSelectionControls();
    try {
      await this.onExportLegacy143Plans?.(selections);
    } finally {
      this.exporting = false;
      this.updateSelectionControls();
    }
  }
  async deleteSelectedPlans() {
    if (this.exporting || this.deleting || this.selections.size === 0)
      return;
    const selections = this.selectedVisibleSelections();
    if (selections.length === 0)
      return;
    this.deleting = true;
    this.updateSelectionControls();
    try {
      await this.onDeletePlans?.(selections);
    } finally {
      this.deleting = false;
      this.updateSelectionControls();
    }
  }
  actionButton(label, operation, file, danger = false, source, name, warning) {
    const button = document.createElement("button");
    button.type = "button";
    const primary = label === "\u7F16\u8F91" && (operation === "edit-battle" || operation === "edit-team");
    button.className = [
      "btn",
      "btn-small",
      danger ? "btn-danger" : "",
      primary ? "btn-primary" : ""
    ].filter(Boolean).join(" ");
    button.dataset["planOperation"] = operation;
    button.dataset["planFile"] = file;
    if (source)
      button.dataset["planSource"] = source;
    if (name)
      button.dataset["planName"] = name;
    if (warning)
      button.dataset["planWarning"] = warning;
    button.textContent = label;
    return button;
  }
  async toggleUnlinkedIgnored(kind, file, source, ignored) {
    await this.onToggleUnlinked?.(kind, source, file, ignored);
  }
  async renameCombatPlan(file) {
    await this.onRenameCombatPlan?.(file);
  }
  async deleteCombatPlan(file) {
    await this.onDeleteCombatPlan?.(file);
  }
  async deleteTeamPlan(file, name, warning) {
    await this.onDeleteTeamPlan?.(file, name, warning);
  }
};
exports.PlanManagementView = PlanManagementView;