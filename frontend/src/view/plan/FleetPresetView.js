"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetPresetView = void 0;
var shipLibrary_js_1 = require_shipLibrary();
var TeamPlanListUi_1 = require_TeamPlanListUi();
var scrollPosition_1 = require_scrollPosition();
var ShipArtwork_1 = require_ShipArtwork();
var FleetPresetView = class {
  constructor() {
    this.userTeams = [];
    this.bindings = [];
    this.shipLibrary = null;
    this.activePreviewTeamId = null;
    this.activePreviewPosition = 0;
    this.selectorSortField = "modifiedAt";
    this.draggedTeamId = null;
    this.teamListDragScrollTop = 0;
    this.fleetPresetSection = document.getElementById("fleet-preset-section");
    this.fleetPresetListEl = document.getElementById("fleet-preset-list");
    this.fleetBindingListEl = document.getElementById("fleet-binding-list");
    this.mainPreview = document.getElementById("fleet-team-main-preview");
    this.backupPreview = document.getElementById("fleet-team-backup-preview");
    this.previewTitle = document.getElementById("fleet-team-preview-title");
    this.backupTitle = document.getElementById("fleet-team-backup-title");
    this.selectorPanel = document.getElementById("fleet-selector-panel");
    this.nodeRoutePanel = document.getElementById("plan-node-route-panel");
    this.selectorSearch = document.getElementById("plan-team-selector-search");
    this.selectorCount = document.getElementById("plan-team-selector-count");
    this.selectorFilterSystem = document.getElementById("plan-team-selector-filter-system");
    this.selectorSortButtons = Array.from(document.querySelectorAll("[data-plan-team-sort-field]"));
    this.selectorSortAscending = document.getElementById("plan-team-selector-sort-asc");
    this.selectorStatus = document.getElementById("plan-team-selector-status");
    document.getElementById("btn-open-fleet-selector")?.addEventListener("click", () => this.showSelector());
    document.getElementById("btn-close-fleet-selector")?.addEventListener("click", () => this.hideSelector());
    this.selectorSearch.addEventListener("input", () => {
      this.renderTeamList();
    });
    this.selectorFilterSystem.addEventListener("change", () => {
      this.renderTeamList();
    });
    this.selectorSortAscending.addEventListener("change", () => {
      this.renderTeamList();
    });
    this.selectorSortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.dataset["planTeamSortField"];
        if (field !== "name" && field !== "modifiedAt")
          return;
        this.selectorSortField = field;
        this.selectorSortButtons.forEach((option) => {
          option.classList.toggle("active", option === button);
        });
        this.renderTeamList();
      });
    });
    this.fleetBindingListEl.addEventListener("dragover", (event) => {
      if (this.draggedTeamId === null)
        return;
      event.preventDefault();
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = "copy";
      this.fleetBindingListEl.classList.add("drag-active");
    });
    this.fleetBindingListEl.addEventListener("dragleave", (event) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && this.fleetBindingListEl.contains(nextTarget)) {
        return;
      }
      this.fleetBindingListEl.classList.remove("drag-active");
    });
    this.fleetBindingListEl.addEventListener("drop", (event) => {
      if (this.draggedTeamId === null)
        return;
      event.preventDefault();
      this.applyTeamPreset(this.draggedTeamId);
      this.fleetBindingListEl.classList.remove("drag-active");
    });
  }
  showSelector() {
    this.nodeRoutePanel.hidden = true;
    this.selectorPanel.hidden = false;
  }
  hideSelector() {
    this.selectorPanel.hidden = true;
    this.nodeRoutePanel.hidden = false;
  }
  render(viewObject) {
    this.fleetPresetSection.style.display = "";
    this.userTeams = viewObject.plans;
    this.bindings = viewObject.bindings;
    this.shipLibrary = viewObject.shipLibrary;
    const activePlan = this.userTeams.find((plan) => plan.id === this.activePreviewTeamId);
    if (!activePlan) {
      this.activePreviewTeamId = this.userTeams.find((plan) => plan.selected)?.id ?? (this.bindings.length === 0 ? this.userTeams[0]?.id ?? null : null);
    }
    if (viewObject.status === "loading") {
      this.selectorCount.textContent = "\u6B63\u5728\u8BFB\u53D6\u7F16\u961F\u9884\u8BBE\u2026";
      this.selectorStatus.textContent = "";
    } else if (viewObject.status === "error") {
      this.selectorCount.textContent = "\u8BFB\u53D6\u5931\u8D25";
      this.selectorStatus.textContent = viewObject.message;
    } else {
      this.selectorCount.textContent = `\u5171\u8BFB\u53D6 ${this.userTeams.length} \u4E2A\u8230\u961F\u9884\u8BBE`;
      this.selectorStatus.textContent = viewObject.errorCount > 0 ? `\u6709 ${viewObject.errorCount} \u4E2A\u914D\u7F6E\u683C\u5F0F\u4E0D\u5408\u6CD5\uFF0C\u5DF2\u8DF3\u8FC7` : "";
    }
    this.renderTeamList();
    this.renderBindings();
    this.renderPreview(this.userTeams.find((plan) => plan.id === this.activePreviewTeamId)?.ships ?? this.bindings[0]?.ships);
  }
  renderTeamList() {
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(this.fleetPresetListEl);
    const visibleTeams = (0, TeamPlanListUi_1.filterAndSortTeamPlans)(this.userTeams, {
      search: this.selectorSearch.value,
      filterSystem: this.selectorFilterSystem.checked,
      sortField: this.selectorSortField,
      ascending: this.selectorSortAscending.checked
    });
    const previousPreviewId = this.activePreviewTeamId;
    const firstVisibleId = visibleTeams[0]?.plan.id;
    const activePreviewVisible = visibleTeams.some(({ plan }) => plan.id === this.activePreviewTeamId);
    if (this.activePreviewTeamId === null && this.bindings.length === 0 && firstVisibleId !== void 0) {
      this.activePreviewTeamId = firstVisibleId;
    } else if (this.activePreviewTeamId !== null && !activePreviewVisible) {
      this.activePreviewTeamId = firstVisibleId ?? null;
    }
    this.fleetPresetListEl.replaceChildren();
    if (this.userTeams.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fleet-team-empty";
      empty.textContent = "\u6682\u65E0\u7F16\u961F\u9884\u8BBE\uFF0C\u8BF7\u5148\u5728\u201C\u8230\u961F\u89C4\u5212\u201D\u4E2D\u4FDD\u5B58";
      this.fleetPresetListEl.append(empty);
      (0, scrollPosition_1.restoreScrollPosition)(this.fleetPresetListEl, scrollPosition);
      return;
    }
    if (visibleTeams.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fleet-team-empty";
      empty.textContent = "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u8FC7\u6EE4\u6761\u4EF6\u7684\u8230\u961F\u9884\u8BBE";
      this.fleetPresetListEl.append(empty);
    }
    visibleTeams.forEach(({ plan }) => {
      const item = document.createElement("div");
      item.className = "fleet-team-loader-item fleet-preset-item";
      item.dataset["teamPlanId"] = plan.id;
      item.draggable = true;
      item.title = `\u62D6\u62FD\u201C${plan.name}\u201D\u5230\u7F16\u961F\u914D\u7F6E`;
      item.classList.toggle("selected", plan.selected);
      item.classList.toggle("previewing", this.activePreviewTeamId === plan.id);
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "fleet-preset-preview-button";
      (0, TeamPlanListUi_1.appendTeamPlanCardContent)(previewButton, (0, TeamPlanListUi_1.teamPlanCardData)(plan));
      previewButton.addEventListener("click", () => {
        this.activePreviewTeamId = plan.id;
        this.fleetPresetListEl.querySelectorAll("[data-team-plan-id]").forEach((option) => {
          option.classList.toggle("previewing", option.dataset["teamPlanId"] === plan.id);
        });
        this.renderPreview(plan.ships);
      });
      item.append(previewButton);
      item.addEventListener("dragstart", (event) => {
        this.draggedTeamId = plan.id;
        this.teamListDragScrollTop = this.fleetPresetListEl.scrollTop;
        item.classList.add("dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", plan.id);
        }
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        this.draggedTeamId = null;
        this.fleetBindingListEl.classList.remove("drag-active");
        this.restoreTeamListScroll();
      });
      this.fleetPresetListEl.append(item);
    });
    if (this.activePreviewTeamId !== previousPreviewId) {
      this.renderPreview(this.userTeams.find((plan) => plan.id === this.activePreviewTeamId)?.ships);
    }
    (0, scrollPosition_1.restoreScrollPosition)(this.fleetPresetListEl, scrollPosition);
  }
  renderBindings() {
    this.fleetBindingListEl.replaceChildren();
    if (this.bindings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fleet-team-empty fleet-binding-empty";
      empty.textContent = "\u62D6\u62FD\u9884\u8BBE\u5361\u7247\u5230\u8FD9\u91CC";
      this.fleetBindingListEl.append(empty);
      return;
    }
    this.bindings.forEach((binding) => {
      const record = document.createElement("div");
      record.className = "fleet-team-loader-item fleet-binding-record";
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "fleet-binding-preview";
      (0, TeamPlanListUi_1.appendTeamPlanCardContent)(previewButton, this.boundTeamCardData(binding, binding.source, binding.modifiedAt));
      previewButton.addEventListener("click", () => {
        this.showSelector();
        const sourcePlan = this.userTeams.find((plan) => plan.id === binding.catalogPlanId);
        if (sourcePlan) {
          this.selectorSearch.value = "";
          if (sourcePlan.source === "system") {
            this.selectorFilterSystem.checked = false;
          }
        }
        this.activePreviewTeamId = sourcePlan?.id ?? null;
        this.renderTeamList();
        this.renderPreview(binding.ships);
      });
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "fleet-binding-remove";
      removeButton.setAttribute("aria-label", `\u79FB\u9664${binding.name}`);
      removeButton.title = `\u4ECE\u7F16\u961F\u914D\u7F6E\u4E2D\u79FB\u9664\u201C${binding.name}\u201D`;
      removeButton.textContent = "\xD7";
      removeButton.addEventListener("click", () => {
        this.onRemoveFleetPreset?.(binding.index);
      });
      record.append(previewButton, removeButton);
      this.fleetBindingListEl.append(record);
    });
  }
  boundTeamCardData(binding, source, modifiedAt) {
    return {
      name: binding.name,
      source,
      primaryCount: binding.ships.filter((slot) => Boolean(slot.primary)).length,
      backupCount: binding.ships.reduce((count, slot) => count + slot.candidates.length, 0),
      modifiedAt
    };
  }
  applyTeamPreset(planId) {
    const plan = this.userTeams.find((item) => item.id === planId);
    if (!plan || plan.selected) {
      this.restoreTeamListScroll();
      return;
    }
    this.onAddFleetPreset?.(planId);
    this.restoreTeamListScroll();
  }
  restoreTeamListScroll() {
    const scrollTop = this.teamListDragScrollTop;
    this.fleetPresetListEl.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      this.fleetPresetListEl.scrollTop = scrollTop;
    });
  }
  renderPreview(ships) {
    const slots = Array.from({ length: 6 }, (_, index) => this.previewSlot(ships?.[index]));
    this.activePreviewPosition = 0;
    this.previewTitle.textContent = "\u7F16\u961F\u9884\u89C8";
    const mainFragment = document.createDocumentFragment();
    slots.forEach((slot, index) => {
      const item = document.createElement("div");
      item.className = "fleet-team-main-item";
      const card = this.createPreviewCard(slot.primary, "main", index, slot.backups.length > 0);
      card.classList.toggle("active", index === this.activePreviewPosition);
      card.addEventListener("click", () => {
        this.activePreviewPosition = index;
        this.mainPreview.querySelectorAll(".fleet-team-main-card").forEach((mainCard, cardIndex) => mainCard.classList.toggle("active", cardIndex === index));
        this.renderBackupPosition(slots, index);
      });
      item.append(card);
      const level = this.createLevelSummary(slot.primary);
      if (level)
        item.append(level);
      mainFragment.append(item);
    });
    this.mainPreview.replaceChildren(mainFragment);
    this.renderBackupPosition(slots, this.activePreviewPosition);
  }
  renderBackupPosition(slots, position) {
    const backupFragment = document.createDocumentFragment();
    const slot = slots[position];
    this.backupTitle.textContent = slot.primary?.name ? `\u3010${slot.primary.name}\u3011\u7684\u5907\u9009\u961F\u5217` : `\u3010\u4F4D\u7F6E${position + 1}\u3011\u7684\u5907\u9009\u961F\u5217`;
    slot.backups.forEach((rule) => {
      backupFragment.append(this.createPreviewCard(rule, "backup", position));
    });
    if (slot.backups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fleet-team-empty";
      empty.textContent = "\u8BE5\u4F4D\u7F6E\u6CA1\u6709\u5907\u9009\u8230\u5A18";
      backupFragment.append(empty);
    }
    this.backupPreview.replaceChildren(backupFragment);
  }
  previewSlot(slot) {
    return {
      primary: slot?.primary ? {
        name: slot.primary.name,
        searchName: slot.primary.searchName,
        minLevel: slot.primary.minLevel,
        maxLevel: slot.primary.maxLevel
      } : null,
      backups: (slot?.candidates ?? []).map((candidate) => ({
        name: candidate.name,
        searchName: candidate.searchName,
        minLevel: candidate.minLevel,
        maxLevel: candidate.maxLevel
      }))
    };
  }
  createPreviewCard(rule, size, position, candidateOnly = false) {
    const card = document.createElement(size === "main" ? "button" : "div");
    if (card instanceof HTMLButtonElement)
      card.type = "button";
    card.className = `fleet-team-${size}-card`;
    const name = rule?.name ?? null;
    card.setAttribute("aria-label", name ? `\u4F4D\u7F6E ${position + 1}\uFF1A${name}` : `\u4F4D\u7F6E ${position + 1}\uFF1A\u7A7A`);
    if (!name) {
      if (candidateOnly) {
        card.classList.add("candidate-only");
        const backgroundUrl = this.shipLibrary?.colorfulBackgroundUrl;
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
    const ship = (0, shipLibrary_js_1.findShipLibraryShip)(this.shipLibrary?.ships ?? [], {
      name,
      searchName: rule?.searchName
    });
    if (ship) {
      card.append((0, ShipArtwork_1.createShipArtwork)(ship, {
        shipTypeLabel: this.shipLibrary?.labels.ship_types[ship.ship_type] ?? ship.ship_type,
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
};
exports.FleetPresetView = FleetPresetView;