"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamPlanLoaderView = void 0;
var shipLibrary_js_1 = require_shipLibrary();
var DialogHelper_1 = require_DialogHelper();
var LoaderDialog_1 = require_LoaderDialog();
var scrollPosition_1 = require_scrollPosition();
var ShipArtwork_1 = require_ShipArtwork();
var TeamPlanListUi_1 = require_TeamPlanListUi();
var FLEET_SLOT_COUNT = 6;
var TeamPlanLoaderView = class {
  constructor(host) {
    this.host = host;
    this.dialog = document.getElementById("fleet-team-loader");
    this.modal = new LoaderDialog_1.LoaderDialog(this.dialog);
    this.search = document.getElementById("fleet-team-loader-search");
    this.list = document.getElementById("fleet-team-loader-list");
    this.count = document.getElementById("fleet-team-loader-count");
    this.filterSystem = document.getElementById("fleet-team-loader-filter-system");
    this.sortButtons = Array.from(document.querySelectorAll("[data-team-loader-sort-field]"));
    this.sortAscending = document.getElementById("fleet-team-loader-sort-asc");
    this.previewTitle = document.getElementById("fleet-team-loader-preview-title");
    this.previewSlots = document.getElementById("fleet-team-loader-preview-slots");
    this.backupTitle = document.getElementById("fleet-team-loader-backup-title");
    this.backupSlots = document.getElementById("fleet-team-loader-backup-slots");
    this.status = document.getElementById("fleet-team-loader-status");
    this.confirmButton = document.getElementById("btn-confirm-team-loader");
    this.plans = [];
    this.selectedPlan = null;
    this.selectedPosition = 0;
    this.sortField = "modifiedAt";
    this.bindActions();
  }
  async open(targetId) {
    await this.host.ensureLibrary();
    this.search.value = "";
    await this.refresh();
    if (targetId) {
      const selected = this.plans.find((plan) => plan.id === targetId);
      if (!selected) {
        await (0, DialogHelper_1.showAlert)("\u52A0\u8F7D\u5931\u8D25", "\u672A\u627E\u5230\u5BF9\u5E94\u7684\u8230\u961F\u65B9\u6848");
        return;
      }
      this.selectedPlan = selected;
      this.selectedPosition = 0;
      if (await this.confirmLoad()) {
        document.querySelector('[data-plan-tab="fleet"]')?.click();
      }
      return;
    }
    this.modal.open();
    this.search.focus();
  }
  close() {
    this.modal.close();
  }
  bindActions() {
    document.getElementById("btn-refresh-team-loader")?.addEventListener("click", () => {
      void this.refresh();
    });
    document.getElementById("btn-cancel-team-loader")?.addEventListener("click", () => this.close());
    this.confirmButton.addEventListener("click", () => {
      void this.confirmLoad();
    });
    this.search.addEventListener("input", () => this.render());
    this.filterSystem.addEventListener("change", () => {
      this.ensureVisibleSelection();
      this.render();
    });
    this.sortAscending.addEventListener("change", () => this.render());
    this.sortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.dataset["teamLoaderSortField"];
        if (field !== "name" && field !== "modifiedAt")
          return;
        this.sortField = field;
        this.sortButtons.forEach((option) => {
          option.classList.toggle("active", option === button);
        });
        this.render();
      });
    });
    this.list.addEventListener("click", (event) => {
      const item = event.target.closest("[data-team-plan-index]");
      if (!item)
        return;
      const index = Number(item.dataset["teamPlanIndex"]);
      const plan = this.plans[index];
      if (!plan)
        return;
      this.selectedPlan = plan;
      this.selectedPosition = 0;
      this.list.querySelectorAll("[data-team-plan-index]").forEach((option) => {
        const optionIndex = Number(option.dataset["teamPlanIndex"]);
        option.classList.toggle("active", this.plans[optionIndex] === plan);
      });
      this.renderPreview();
    });
    this.previewSlots.addEventListener("click", (event) => {
      const item = event.target.closest("[data-team-preview-position]");
      if (!item)
        return;
      const position = Number(item.dataset["teamPreviewPosition"]);
      if (!Number.isInteger(position) || position < 0)
        return;
      this.selectedPosition = position;
      this.renderPreview();
    });
    this.modal.bindDismiss(() => this.close());
  }
  async refresh() {
    this.count.textContent = "\u6B63\u5728\u8BFB\u53D6\u7F16\u961F\u9884\u8BBE\u2026";
    this.status.textContent = "";
    try {
      const result = await this.host.loadPlans();
      this.plans = result.plans;
      const visiblePlans = this.visiblePlans();
      const firstSortedPlan = [...visiblePlans].sort((left, right) => this.comparePlans(left, right))[0];
      this.selectedPlan = visiblePlans.find((plan) => plan.selected) ?? firstSortedPlan ?? null;
      this.selectedPosition = 0;
      this.count.textContent = `\u5171\u8BFB\u53D6 ${result.plans.length} \u4E2A\u8230\u961F\u9884\u8BBE`;
      this.status.textContent = result.errorCount > 0 ? `\u6709 ${result.errorCount} \u4E2A\u914D\u7F6E\u683C\u5F0F\u4E0D\u5408\u6CD5\uFF0C\u5DF2\u8DF3\u8FC7` : "";
      this.render();
    } catch (error) {
      this.plans = [];
      this.selectedPlan = null;
      this.selectedPosition = 0;
      this.count.textContent = "\u8BFB\u53D6\u5931\u8D25";
      this.status.textContent = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }
  render() {
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(this.list);
    const fragment = document.createDocumentFragment();
    const visiblePlans = (0, TeamPlanListUi_1.filterAndSortTeamPlans)(this.plans, {
      search: this.search.value,
      filterSystem: this.filterSystem.checked,
      sortField: this.sortField,
      ascending: this.sortAscending.checked
    });
    visiblePlans.forEach(({ plan, index }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fleet-team-loader-item";
      button.dataset["teamPlanIndex"] = String(index);
      button.classList.toggle("active", plan === this.selectedPlan);
      (0, TeamPlanListUi_1.appendTeamPlanCardContent)(button, (0, TeamPlanListUi_1.teamPlanCardData)(plan));
      fragment.append(button);
    });
    if (!fragment.childNodes.length) {
      const empty = document.createElement("div");
      empty.className = "fleet-library-empty";
      empty.textContent = this.plans.length > 0 ? "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u8FC7\u6EE4\u6761\u4EF6\u7684\u8230\u961F\u9884\u8BBE" : "\u7CFB\u7EDF\u548C\u7528\u6237\u7F16\u961F\u76EE\u5F55\u4E2D\u6CA1\u6709\u53EF\u52A0\u8F7D\u7684\u914D\u7F6E";
      fragment.append(empty);
    }
    this.list.replaceChildren(fragment);
    (0, scrollPosition_1.restoreScrollPosition)(this.list, scrollPosition);
    this.renderPreview();
  }
  comparePlans(left, right) {
    return (0, TeamPlanListUi_1.compareTeamPlans)(left, right, this.sortField, this.sortAscending.checked);
  }
  visiblePlans() {
    return this.plans.filter((plan) => !this.filterSystem.checked || plan.source !== "system");
  }
  ensureVisibleSelection() {
    const visiblePlans = this.visiblePlans();
    if (!this.selectedPlan || !visiblePlans.includes(this.selectedPlan)) {
      this.selectedPlan = [...visiblePlans].sort((left, right) => this.comparePlans(left, right))[0] ?? null;
      this.selectedPosition = 0;
    }
  }
  renderPreview() {
    const plan = this.selectedPlan;
    this.confirmButton.disabled = !plan;
    this.previewTitle.textContent = `\u7F16\u961F\u9884\u89C8\uFF1A${plan?.name ?? "\u672A\u9009\u62E9"}`;
    const fragment = document.createDocumentFragment();
    Array.from({ length: FLEET_SLOT_COUNT }, (_, index) => {
      const slot = plan?.ships[index];
      const backupCount = slot?.candidates.length ?? 0;
      const primary = slot?.primary;
      const item = document.createElement("div");
      item.className = "fleet-team-main-item";
      const card = this.createPreviewCard(primary, "main", index, !primary && backupCount > 0);
      card.dataset["teamPreviewPosition"] = String(index);
      card.classList.toggle("active", Boolean(plan) && index === this.selectedPosition);
      card.setAttribute("aria-pressed", String(Boolean(plan) && index === this.selectedPosition));
      if (card instanceof HTMLButtonElement)
        card.disabled = !plan;
      item.append(card);
      const levels = this.createLevelSummary(primary);
      if (levels)
        item.append(levels);
      fragment.append(item);
    });
    this.previewSlots.replaceChildren(fragment);
    this.renderBackupPreview();
  }
  renderBackupPreview() {
    const plan = this.selectedPlan;
    const slot = plan?.ships[this.selectedPosition];
    const candidates = slot?.candidates ?? [];
    this.backupTitle.textContent = slot?.primary?.name ? `\u3010${slot.primary.name}\u3011\u7684\u5907\u9009\u961F\u5217` : `\u3010\u4F4D\u7F6E${this.selectedPosition + 1}\u3011\u7684\u5907\u9009\u961F\u5217`;
    if (candidates.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fleet-team-loader-preview-empty";
      empty.textContent = plan ? `\u4F4D\u7F6E ${this.selectedPosition + 1} \u6CA1\u6709\u5907\u9009\u8239\u53EA` : "\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u8230\u961F\u9884\u8BBE";
      this.backupSlots.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    candidates.forEach((candidate) => {
      fragment.append(this.createPreviewCard(candidate, "backup", this.selectedPosition));
    });
    this.backupSlots.replaceChildren(fragment);
  }
  createPreviewCard(rule, size, position, candidateOnly = false) {
    const card = document.createElement(size === "main" ? "button" : "div");
    if (card instanceof HTMLButtonElement)
      card.type = "button";
    card.className = `fleet-team-${size}-card`;
    const name = rule?.name ?? rule?.searchName ?? null;
    card.setAttribute("aria-label", name ? `\u4F4D\u7F6E ${position + 1}\uFF1A${name}` : `\u4F4D\u7F6E ${position + 1}\uFF1A\u7A7A`);
    if (!name) {
      if (candidateOnly) {
        card.classList.add("candidate-only");
        const backgroundUrl = this.host.colorfulBackgroundUrl();
        if (backgroundUrl) {
          const background = document.createElement("img");
          background.className = "fleet-team-placeholder-background";
          background.src = backgroundUrl;
          background.alt = "";
          background.draggable = false;
          card.append(background);
        }
      }
      const empty = document.createElement("span");
      empty.className = "fleet-team-card-empty";
      empty.textContent = candidateOnly ? "\u4F7F\u7528\u5907\u9009\u961F\u5217" : "\u7A7A";
      card.append(empty);
      return card;
    }
    const ships = this.host.ships();
    const ship = (0, shipLibrary_js_1.findShipLibraryShip)(ships, {
      name: rule?.name ?? name,
      searchName: rule?.searchName
    });
    if (ship) {
      card.append((0, ShipArtwork_1.createShipArtwork)(ship, {
        shipTypeLabel: this.host.shipTypeDisplay(ship),
        showNumber: false,
        showName: true,
        displayName: name,
        nameStyle: size === "backup" ? "plain" : "rarity"
      }));
    } else {
      const unknown = document.createElement("span");
      unknown.className = "fleet-team-card-empty fleet-team-card-unknown";
      unknown.textContent = name;
      card.append(unknown);
    }
    return card;
  }
  createLevelSummary(rule) {
    if (!rule || rule.minLevel === void 0 && rule.maxLevel === void 0) {
      return null;
    }
    const summary = document.createElement("span");
    summary.className = "fleet-team-level-summary";
    if (rule.minLevel !== void 0) {
      const min = document.createElement("span");
      min.textContent = `\u6700\u5C0F\u7B49\u7EA7\uFF1A${rule.minLevel}`;
      summary.append(min);
    }
    if (rule.maxLevel !== void 0) {
      const max = document.createElement("span");
      max.textContent = `\u6700\u5927\u7B49\u7EA7\uFF1A${rule.maxLevel}`;
      summary.append(max);
    }
    return summary;
  }
  async confirmLoad() {
    const plan = this.selectedPlan;
    if (!plan)
      return false;
    if (this.host.hasUnsavedChanges()) {
      const confirmed = await (0, DialogHelper_1.showConfirm)("\u672A\u4FDD\u5B58\u4FEE\u6539", "\u5F53\u524D\u8230\u961F\u7F16\u961F\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u7EE7\u7EED\u52A0\u8F7D\u5C06\u4E22\u5931\u8FD9\u4E9B\u4FEE\u6539\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F");
      if (!confirmed)
        return false;
    }
    try {
      const result = await this.host.applyPlan(plan.id);
      if (!result.success) {
        throw new Error(result.error || "\u5F53\u524D YAML \u683C\u5F0F\u4E0D\u7B26\u5408\u89C4\u5219");
      }
      this.close();
      return true;
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u52A0\u8F7D\u5931\u8D25", error instanceof Error ? error.message : String(error));
      return false;
    }
  }
};
exports.TeamPlanLoaderView = TeamPlanLoaderView;