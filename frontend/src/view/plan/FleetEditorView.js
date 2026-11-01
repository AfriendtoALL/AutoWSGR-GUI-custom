"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetEditorView = void 0;
var DialogHelper_1 = require_DialogHelper();
var FleetGalleryView_1 = require_FleetGalleryView();
var FleetRuleView_1 = require_FleetRuleView();
var FleetSlotBoardView_1 = require_FleetSlotBoardView();
var FLEET_SLOT_COUNT = 6;
/** 7.8/R43：槽位 DOM 与拖拽交给 FleetSlotBoardView，这里只保留常规编队的编辑规则。 */
var FleetEditorView = class {
  constructor(host) {
    this.host = host;
    this.slotBoard = new FleetSlotBoardView_1.FleetSlotBoardView({
      mainList: document.getElementById("fleet-slot-list"),
      backupList: document.getElementById("fleet-backup-slot-list"),
      mime: FleetGalleryView_1.FLEET_DRAG_MIME,
      host: {
        onSelect: (group, index) => this.selectSlot(group, index),
        onRemove: (group, index) => this.removeSlot(group, index),
        onDrop: (payload, group, index) => this.handleDrop(payload, group, index)
      }
    });
    this.backupTitle = document.getElementById("fleet-backup-title");
    this.backupFollowButton = document.getElementById("btn-backup-follow-mode");
    this.backupCopyDialog = document.getElementById("fleet-backup-copy-dialog");
    this.backupCopyDescription = document.getElementById("fleet-backup-copy-description");
    this.backupCopyTargets = document.getElementById("fleet-backup-copy-targets");
    this.activeSlotGroup = "formation";
    this.activePosition = 0;
    this.activeBackupIndex = 0;
    this.backupFollowMode = this.host.getBackupFollowMode();
    this.ruleView = new FleetRuleView_1.FleetRuleView({
      primaryRule: () => this.currentSlot(),
      backupRule: () => this.currentBackupRule(),
      updatePrimaryRule: (update) => this.updateRule(update),
      updateBackupRule: (update) => this.updateRule(update, this.activeBackupIndex)
    });
    this.bindActions();
  }
  render() {
    this.renderBackupFollowMode();
    this.renderSlots();
    this.renderBackupSlots();
    this.ruleView.render();
  }
  reset() {
    this.activeSlotGroup = "formation";
    this.activePosition = 0;
    this.activeBackupIndex = 0;
    this.render();
    this.host.renderGallerySelection();
  }
  dispose() {
    this.slotBoard.dispose();
  }
  activeSlotDescription() {
    if (this.activeSlotGroup === "formation") {
      return `\u7F16\u961F\u4F4D\u7F6E ${this.activePosition + 1}`;
    }
    return `\u4F4D\u7F6E ${this.activePosition + 1} \u7684\u7B2C ${this.activeBackupIndex + 1} \u4E2A\u5907\u9009\u69FD\u4F4D`;
  }
  selectedShips() {
    if (this.activeSlotGroup === "formation") {
      return this.currentFleet().slots.map((slot) => slot.primary).filter((ship) => ship !== null);
    }
    return this.currentSlot().candidates.map((candidate) => candidate.ship).filter((ship) => ship !== null);
  }
  assignShip(ship) {
    this.applyEdit({
      type: "assign-ship",
      selection: this.currentSelection(),
      ship
    });
    this.render();
    this.host.renderGallerySelection();
  }
  rememberBackupScroll() {
    this.slotBoard.rememberBackupScroll();
  }
  clearBackupDragScroll() {
    this.slotBoard.clearBackupDragScroll();
  }
  isSlotEmpty(slot) {
    return slot.primary === null && slot.candidates.every((candidate) => candidate.ship === null);
  }
  bindActions() {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape")
        this.closeBackupCopyDialog();
    });
    document.getElementById("btn-clear-fleet")?.addEventListener("click", () => {
      this.applyEdit({ type: "clear" });
      this.render();
      this.host.renderGallerySelection();
    });
    this.backupFollowButton.addEventListener("click", () => {
      this.backupFollowMode = this.backupFollowMode === "ship" ? "position" : "ship";
      this.host.setBackupFollowMode(this.backupFollowMode);
      this.renderBackupFollowMode();
      this.renderBackupSlots();
    });
    document.getElementById("btn-add-fleet-backup")?.addEventListener("click", () => {
      const result = this.applyEdit({
        type: "ensure-candidate",
        position: this.activePosition
      });
      const target = result.selection?.candidateIndex ?? this.activeBackupIndex;
      this.render();
      this.slotBoard.scrollSlotIntoView("backup", target, "smooth");
    });
    document.getElementById("btn-copy-fleet-backup")?.addEventListener("click", () => {
      void this.openBackupCopyDialog();
    });
    document.getElementById("btn-cancel-backup-copy")?.addEventListener("click", () => this.closeBackupCopyDialog());
    this.backupCopyDialog.addEventListener("click", (event) => {
      if (event.target === this.backupCopyDialog) {
        this.closeBackupCopyDialog();
      }
    });
    this.backupCopyTargets.addEventListener("click", (event) => {
      const target = event.target.closest("[data-backup-copy-position]");
      if (!target || target.disabled)
        return;
      const position = Number(target.dataset["backupCopyPosition"]);
      if (Number.isInteger(position)) {
        void this.copyBackupsToPosition(position);
      }
    });
  }
  selectSlot(group, index) {
    if (group === "main") {
      if (!Number.isInteger(index) || index < 0 || index >= FLEET_SLOT_COUNT)
        return;
      const gallerySelectionChanged = this.activeSlotGroup !== "formation";
      this.activeSlotGroup = "formation";
      this.activePosition = index;
      this.activeBackupIndex = 0;
      this.render();
      if (gallerySelectionChanged) {
        this.host.renderGallerySelection();
      } else {
        this.host.updateGalleryCardTargets();
      }
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.currentSlot().candidates.length)
      return;
    const gallerySelectionChanged = this.activeSlotGroup !== "backup";
    this.activeSlotGroup = "backup";
    this.activeBackupIndex = index;
    this.render();
    if (gallerySelectionChanged) {
      this.host.renderGallerySelection();
    } else {
      this.host.updateGalleryCardTargets();
    }
    this.scrollBackupSlotIntoView(index);
  }
  removeSlot(group, index) {
    if (group === "main") {
      if (!Number.isInteger(index) || index < 0 || index >= FLEET_SLOT_COUNT)
        return;
      this.applyEdit({
        type: "remove-primary",
        position: index,
        selection: this.currentSelection()
      });
    } else {
      if (!Number.isInteger(index) || index < 0 || index >= this.currentSlot().candidates.length)
        return;
      this.applyEdit({
        type: "remove-candidate",
        position: this.activePosition,
        candidateIndex: index
      });
    }
    this.render();
    this.host.renderGallerySelection();
  }
  handleDrop(payload, group, targetIndex) {
    const source = this.resolveDragSource(payload);
    if (!source)
      return;
    if (group === "main") {
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= FLEET_SLOT_COUNT)
        return;
      const result2 = this.applyEdit({
        type: "drop-formation",
        source,
        targetPosition: targetIndex,
        selection: this.currentSelection(),
        backupFollowMode: this.backupFollowMode
      });
      if (!result2.changed)
        return;
    } else {
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= this.currentSlot().candidates.length)
        return;
      const result2 = this.applyEdit({
        type: "drop-backup",
        source,
        targetPosition: this.activePosition,
        targetCandidateIndex: targetIndex
      });
      if (!result2.changed)
        return;
    }
    this.render();
    this.host.renderGallerySelection();
  }
  resolveDragSource(payload) {
    if (payload.group === "gallery") {
      const ship = this.host.shipById(payload.shipId);
      return ship ? { group: "gallery", ship } : null;
    }
    if (payload.group === "main") {
      if (payload.index < 0 || payload.index >= FLEET_SLOT_COUNT)
        return null;
      return {
        group: "formation",
        position: payload.index
      };
    }
    if (payload.group === "backup") {
      return {
        group: "backup",
        position: this.activePosition,
        candidateIndex: payload.index
      };
    }
    return null;
  }
  backupQueuesEqual(source, target) {
    const sourceBackups = source.filter((candidate) => candidate.ship !== null);
    const targetBackups = target.filter((candidate) => candidate.ship !== null);
    if (sourceBackups.length !== targetBackups.length)
      return false;
    return sourceBackups.every((candidate, index) => {
      const targetCandidate = targetBackups[index];
      const sameShipTypes = candidate.shipTypes.length === targetCandidate.shipTypes.length && candidate.shipTypes.every((shipType) => targetCandidate.shipTypes.includes(shipType));
      return candidate.ship?.id === targetCandidate.ship?.id && sameShipTypes && candidate.levelEnabled === targetCandidate.levelEnabled && candidate.minLevel === targetCandidate.minLevel && candidate.maxLevel === targetCandidate.maxLevel && candidate.relaxed === targetCandidate.relaxed;
    });
  }
  currentSelection() {
    return {
      group: this.activeSlotGroup,
      position: this.activePosition,
      candidateIndex: this.activeBackupIndex
    };
  }
  applyEdit(intent) {
    const result = this.host.editDraft(intent);
    if (result.selection) {
      this.activeSlotGroup = result.selection.group;
      this.activePosition = result.selection.position;
      this.activeBackupIndex = result.selection.candidateIndex;
    }
    if (result.error) {
      void (0, DialogHelper_1.showAlert)(result.error.title, result.error.message);
    }
    return result;
  }
  updateRule(update, candidateIndex) {
    const result = this.applyEdit({
      type: "update-rule",
      position: this.activePosition,
      candidateIndex,
      update
    });
    if (!result.changed)
      return;
    if (candidateIndex === void 0) {
      this.renderSlots();
    } else {
      this.renderBackupSlots();
    }
  }
  validationBadge(relaxed) {
    return {
      text: relaxed ? "\u5F31\u6821\u9A8C" : "\u5F3A\u6821\u9A8C",
      relaxed
    };
  }
  renderSlots() {
    this.slotBoard.render("main", this.currentFleet().slots.map((slot, index) => {
      const candidateOnly = slot.primary === null && !this.isSlotEmpty(slot);
      return {
        index,
        ship: slot.primary,
        active: index === this.activePosition,
        draggable: slot.primary !== null || candidateOnly,
        candidateOnly,
        badge: slot.primary ? this.validationBadge(slot.relaxed) : null,
        shipTypeLabel: slot.primary ? this.host.shipTypeDisplay(slot.primary) : void 0,
        placeholderBackgroundUrl: candidateOnly ? this.host.colorfulBackgroundUrl() : void 0,
        ariaLabel: candidateOnly ? `\u4F4D\u7F6E ${index + 1} \u6CA1\u6709\u4E3B\u9009\uFF0C\u5DF2\u6709\u5907\u9009\u8230\u8239` : void 0,
        emptyLabel: candidateOnly ? "\u4F7F\u7528\u5907\u9009\u961F\u5217" : void 0
      };
    }));
  }
  renderBackupSlots() {
    this.slotBoard.render("backup", this.currentSlot().candidates.map((candidate, index) => ({
      index,
      ship: candidate.ship,
      active: this.activeSlotGroup === "backup" && index === this.activeBackupIndex,
      draggable: candidate.ship !== null,
      badge: candidate.ship ? this.validationBadge(candidate.relaxed) : null,
      shipTypeLabel: candidate.ship ? this.host.shipTypeDisplay(candidate.ship) : void 0
    })));
    const primary = this.currentSlot().primary;
    this.backupTitle.textContent = this.backupFollowMode === "ship" && primary ? `${primary.name} \u7684\u5907\u9009\u961F\u5217` : `\u4F4D\u7F6E ${this.activePosition + 1} \u7684\u5907\u9009\u961F\u5217`;
  }
  renderBackupFollowMode() {
    const followsPosition = this.backupFollowMode === "position";
    this.backupFollowButton.textContent = followsPosition ? "\u4F4D\u7F6E\u8DDF\u968F" : "\u8230\u8239\u8DDF\u968F";
    this.backupFollowButton.dataset["mode"] = this.backupFollowMode;
    this.backupTitle.dataset["followMode"] = this.backupFollowMode;
    this.backupFollowButton.setAttribute("aria-pressed", String(followsPosition));
    this.backupFollowButton.title = followsPosition ? "\u5907\u9009\u56FA\u5B9A\u5728\u5F53\u524D\u4F4D\u7F6E\uFF0C\u70B9\u51FB\u5207\u6362\u4E3A\u8230\u8239\u8DDF\u968F" : "\u5907\u9009\u8DDF\u968F\u4E3B\u9009\u8230\u8239\u79FB\u52A8\uFF0C\u70B9\u51FB\u5207\u6362\u4E3A\u4F4D\u7F6E\u8DDF\u968F";
  }
  scrollBackupSlotIntoView(index) {
    this.slotBoard.scrollSlotIntoView("backup", index);
  }
  currentFleet() {
    return this.host.currentDraft();
  }
  currentSlot() {
    return this.currentFleet().slots[this.activePosition];
  }
  currentBackupRule() {
    return this.currentSlot().candidates[this.activeBackupIndex];
  }
  async openBackupCopyDialog() {
    const source = this.currentSlot();
    const sourceBackups = source.candidates.filter((candidate) => candidate.ship !== null);
    if (sourceBackups.length === 0) {
      await (0, DialogHelper_1.showAlert)("\u65E0\u6CD5\u590D\u5236", "\u5F53\u524D\u4F4D\u7F6E\u6CA1\u6709\u53EF\u590D\u5236\u7684\u5907\u9009\u8230\u8239");
      return;
    }
    const sourceName = source.primary?.name ?? `\u4F4D\u7F6E${this.activePosition + 1}`;
    this.backupCopyDescription.textContent = `\u5C06\u3010${sourceName}\u3011\u7684 ${sourceBackups.length} \u8258\u5907\u9009\u590D\u5236\u5230\u5176\u4ED6\u4F4D\u7F6E\u3002`;
    const fragment = document.createDocumentFragment();
    this.currentFleet().slots.forEach((slot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fleet-backup-copy-target";
      button.dataset["backupCopyPosition"] = String(index);
      const sameBackupQueue = this.backupQueuesEqual(source.candidates, slot.candidates);
      const backupCount = slot.candidates.filter((candidate) => candidate.ship !== null).length;
      button.disabled = index === this.activePosition || sameBackupQueue;
      const name = document.createElement("strong");
      name.textContent = slot.primary ? `\u4F4D\u7F6E ${index + 1} \xB7 ${slot.primary.name}` : `\u4F4D\u7F6E ${index + 1} \xB7 \u65E0\u4E3B\u9009`;
      const summary = document.createElement("span");
      summary.textContent = slot.primary ? `${backupCount} \u8258\u73B0\u6709\u5907\u9009` : backupCount > 0 ? `${backupCount} \u8258\u73B0\u6709\u7EAF\u5907\u9009` : "\u7A7A\u4F4D\u7F6E\uFF0C\u53EF\u590D\u5236\u4E3A\u7EAF\u5907\u9009";
      if (index === this.activePosition) {
        summary.textContent = "\u5F53\u524D\u5907\u9009\u961F\u5217";
      } else if (sameBackupQueue) {
        summary.textContent = "\u5907\u9009\u961F\u5217\u5B8C\u5168\u4E00\u81F4";
      }
      button.append(name, summary);
      fragment.append(button);
    });
    this.backupCopyTargets.replaceChildren(fragment);
    this.backupCopyDialog.style.display = "flex";
  }
  closeBackupCopyDialog() {
    this.backupCopyDialog.style.display = "none";
  }
  async copyBackupsToPosition(targetPosition) {
    if (targetPosition < 0 || targetPosition >= FLEET_SLOT_COUNT || targetPosition === this.activePosition) {
      return;
    }
    const source = this.currentSlot();
    const target = this.currentFleet().slots[targetPosition];
    if (!target)
      return;
    const sourceBackups = source.candidates.filter((candidate) => candidate.ship !== null);
    if (sourceBackups.length === 0)
      return;
    if (this.backupQueuesEqual(source.candidates, target.candidates))
      return;
    const targetBackupCount = target.candidates.filter((candidate) => candidate.ship !== null).length;
    if (targetBackupCount > 0) {
      const targetName = target.primary?.name ?? `\u4F4D\u7F6E${targetPosition + 1}`;
      const overwrite = await (0, DialogHelper_1.showConfirm)("\u8986\u76D6\u5907\u9009\u961F\u5217", `\u3010${targetName}\u3011\u5DF2\u6709 ${targetBackupCount} \u8258\u5907\u9009\uFF0C\u662F\u5426\u8986\u76D6\uFF1F`);
      if (!overwrite)
        return;
    }
    const result = this.applyEdit({
      type: "copy-backups",
      sourcePosition: this.activePosition,
      targetPosition
    });
    if (!result.changed)
      return;
    this.closeBackupCopyDialog();
    this.render();
    this.host.renderGallerySelection();
  }
};
exports.FleetEditorView = FleetEditorView;