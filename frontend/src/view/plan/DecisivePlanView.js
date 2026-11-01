"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisivePlanView = void 0;
exports.decisiveGalleryShipName = decisiveGalleryShipName;
var shipLibrary_js_1 = require_shipLibrary();
var DialogHelper_1 = require_DialogHelper();
var FleetGalleryView_1 = require_FleetGalleryView();
var FleetSlotBoardView_1 = require_FleetSlotBoardView();
var LEVELS = ["level1", "level2"];
var LEVEL_LABELS = {
  level1: "\u4E3B\u9009\u961F\u5217",
  level2: "\u5907\u9009\u961F\u5217"
};
var GROUP_LEVELS = {
  main: "level1",
  backup: "level2"
};
var MAIN_SLOT_COUNT = 6;
var DEFAULT_BACKUP_SLOT_COUNT = 6;
function decisiveGalleryShipName(ship) {
  return ship.name;
}
function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element)
    throw new Error(`\u7F3A\u5C11\u51B3\u6218\u9875\u9762\u5143\u7D20: #${id}`);
  return element;
}
/** 7.8/R43：槽位 DOM/拖拽与图鉴构建复用与常规编队相同的共享组件。 */
var DecisivePlanView = class {
  constructor(host) {
    this.host = host;
    this.chapter = requiredElement("decisive-plan-chapter");
    this.quickRepair = requiredElement("decisive-plan-quick-repair");
    this.editEnabled = requiredElement("decisive-plan-edit-enabled");
    this.resetButton = requiredElement("btn-reset-decisive-plan");
    this.addBackupButton = requiredElement("btn-add-decisive-backup");
    this.status = requiredElement("decisive-plan-status");
    this.mainList = requiredElement("decisive-level1-list");
    this.backupList = requiredElement("decisive-level2-list");
    this.shipSearchNameByName = /* @__PURE__ */ new Map();
    this.galleryLevel = "level1";
    this.activeMainIndex = 0;
    this.activeBackupIndex = 0;
    this.backupSlotCount = DEFAULT_BACKUP_SLOT_COUNT;
    this.slotBoard = new FleetSlotBoardView_1.FleetSlotBoardView({
      mainList: this.mainList,
      backupList: this.backupList,
      mime: FleetGalleryView_1.DECISIVE_DRAG_MIME,
      host: {
        onSelect: (group, index) => this.selectSlot(GROUP_LEVELS[group], index),
        onRemove: (group, index) => this.removeSlot(group, index),
        onDrop: (payload, group, index) => this.handleDrop(payload, group, index),
        afterDrop: () => this.galleryView.clearDragScroll()
      }
    });
    this.galleryView = new FleetGalleryView_1.FleetGalleryView("decisive", {
      getGalleryState: () => this.host.getGalleryState(),
      setGalleryState: (state) => this.host.setGalleryState(state),
      activeSlotDescription: () => this.activeSlotDescription(),
      isExcluded: (ship) => this.findConfiguredShip(ship) !== null,
      assignShip: (ship) => this.assignGalleryShip(ship),
      shipDisplayName: (ship) => decisiveGalleryShipName(ship),
      isInteractionEnabled: () => this.editEnabled.checked,
      drag: {
        onStart: () => this.slotBoard.rememberBackupScroll(),
        onEnd: () => {
          this.slotBoard.clearBackupDragScroll();
          this.slotBoard.clearDragOver();
        }
      },
      unavailableCountLabel: "\u56FE\u9274\u4E0D\u53EF\u7528",
      unavailableMessage: "\u8230\u8239\u8D44\u6599\u5E93\u4E0D\u53EF\u7528"
    });
  }
  bindActions() {
    this.chapter.addEventListener("change", () => {
      void this.changeChapter(Number(this.chapter.value));
    });
    this.quickRepair.addEventListener("change", () => {
      this.host.setUseQuickRepair(this.quickRepair.checked);
      this.markDirty();
    });
    this.editEnabled.addEventListener("change", () => {
      this.renderEditState();
      this.renderQueues();
    });
    this.addBackupButton.addEventListener("click", () => {
      if (!this.editEnabled.checked)
        return;
      this.backupSlotCount = Math.max(this.backupSlotCount, this.host.getState().level2.length, DEFAULT_BACKUP_SLOT_COUNT) + 1;
      this.galleryLevel = "level2";
      this.activeBackupIndex = this.backupSlotCount - 1;
      this.renderQueues();
      this.renderGalleryTarget();
    });
    requiredElement("btn-save-decisive-plan").addEventListener("click", () => void this.save());
    this.resetButton.addEventListener("click", () => void this.resetTeam());
  }
  dispose() {
    this.galleryView.dispose();
    this.slotBoard.dispose();
  }
  showLoaded(manifest) {
    this.loadShipLibrary(manifest);
    this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.host.getState().level2.length);
    this.render();
    this.setStatus("\u914D\u7F6E\u5DF2\u52A0\u8F7D");
  }
  showLoadFailure() {
    this.loadShipLibrary(null);
    this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.host.getState().level2.length);
    this.render();
    this.setStatus("\u8BFB\u53D6\u5931\u8D25\uFF0C\u5DF2\u4F7F\u7528\u9ED8\u8BA4\u961F\u4F0D", true);
  }
  showChapterLoaded() {
    this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.host.getState().level2.length);
    this.render();
    this.setStatus(`\u7B2C ${this.host.getState().chapter} \u7AE0\u914D\u7F6E\u5DF2\u52A0\u8F7D`);
  }
  loadShipLibrary(manifest) {
    if (!manifest?.ships) {
      this.shipSearchNameByName.clear();
      this.galleryView.clearLibrary();
      this.galleryView.showLoadError("\u8230\u8239\u8D44\u6599\u5E93\u4E0D\u53EF\u7528");
      return;
    }
    const ships = manifest.ships.filter((ship) => Number.isFinite(ship.id) && Boolean(ship.name) && Boolean(ship.search_name) && Boolean(ship.portraitUrl));
    this.shipSearchNameByName = new Map(ships.map((ship) => [ship.name, ship.search_name]));
    this.galleryView.showLibrary({
      labels: manifest.labels,
      ships
    });
  }
  render() {
    const state = this.host.getState();
    this.chapter.value = String(state.chapter);
    this.quickRepair.checked = state.useQuickRepair;
    this.editEnabled.checked = false;
    this.renderEditState();
    this.renderQueues();
    this.galleryView.render(false);
    this.renderGalleryTarget();
  }
  renderEditState() {
    const editing = this.editEnabled.checked;
    this.resetButton.disabled = !editing;
    this.addBackupButton.disabled = !editing;
    this.galleryView.refreshInteractionState();
  }
  renderQueues() {
    const state = this.host.getState();
    this.slotBoard.render("main", Array.from({
      length: MAIN_SLOT_COUNT
    }, (_2, index) => this.createSlotDescriptor("main", index, state.level1[index])));
    this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.backupSlotCount, state.level2.length);
    this.slotBoard.render("backup", Array.from({
      length: this.backupSlotCount
    }, (_2, index) => this.createSlotDescriptor("backup", index, state.level2[index])));
    requiredElement("decisive-level2-count").textContent = `${state.level2.length} \u8258`;
  }
  createSlotDescriptor(group, index, name) {
    const level = GROUP_LEVELS[group];
    const label = LEVEL_LABELS[level];
    const ship = name ? this.findDisplayShip(name) : null;
    return {
      index,
      ship,
      fallbackName: ship ? void 0 : name,
      active: level === this.galleryLevel && index === (group === "main" ? this.activeMainIndex : this.activeBackupIndex),
      draggable: this.editEnabled.checked && Boolean(name),
      title: name ? `${label}\u7B2C ${index + 1} \u4F4D\uFF1A${name}` : `${label}\u7B2C ${index + 1} \u4E2A\u7A7A\u69FD`,
      shipTypeLabel: ship ? this.galleryView.shipTypeDisplay(ship) : void 0,
      removable: this.editEnabled.checked,
      removeLabel: name ? `\u79FB\u9664 ${name}` : void 0
    };
  }
  selectSlot(level, index) {
    if (!LEVELS.includes(level))
      return;
    if (level === "level1") {
      if (!Number.isInteger(index) || index < 0 || index >= MAIN_SLOT_COUNT)
        return;
      this.galleryLevel = "level1";
      this.activeMainIndex = index;
    } else {
      if (!Number.isInteger(index) || index < 0 || index >= this.backupSlotCount)
        return;
      this.galleryLevel = "level2";
      this.activeBackupIndex = index;
    }
    this.renderQueues();
    this.renderGalleryTarget();
    if (level === "level2")
      this.scrollBackupSlotIntoView(index);
  }
  removeSlot(group, index) {
    if (!this.editEnabled.checked)
      return;
    const level = GROUP_LEVELS[group];
    if (!this.host.removeShip(level, index))
      return;
    if (level === "level1") {
      this.activeMainIndex = Math.min(this.activeMainIndex, MAIN_SLOT_COUNT - 1);
    } else {
      this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.host.getState().level2.length);
      this.activeBackupIndex = Math.min(this.activeBackupIndex, this.backupSlotCount - 1);
    }
    this.markDirty();
    this.renderQueues();
    this.galleryView.renderSelection();
  }
  assignGalleryShip(ship) {
    if (!this.editEnabled.checked)
      return;
    const existing = this.findConfiguredShip(ship);
    if (existing) {
      this.selectSlot(existing.level, existing.index);
      return;
    }
    const level = this.galleryLevel;
    let target;
    let replacing;
    const state = this.host.getState();
    if (level === "level1") {
      const queueLength = state.level1.length;
      const firstEmpty = queueLength < MAIN_SLOT_COUNT ? queueLength : -1;
      replacing = this.activeMainIndex < queueLength;
      target = replacing || firstEmpty < 0 ? this.activeMainIndex : firstEmpty;
    } else {
      const queueLength = state.level2.length;
      const firstEmpty = queueLength < this.backupSlotCount ? queueLength : -1;
      replacing = this.activeBackupIndex < queueLength;
      target = replacing || firstEmpty < 0 ? this.activeBackupIndex : firstEmpty;
    }
    this.placeGalleryShip(ship, level, target, !replacing);
  }
  placeGalleryShip(ship, level, requestedIndex, advanceToNextEmpty) {
    if (!this.editEnabled.checked)
      return;
    const existing = this.findConfiguredShip(ship);
    if (existing) {
      this.selectSlot(existing.level, existing.index);
      return;
    }
    const maxIndex = level === "level1" ? MAIN_SLOT_COUNT - 1 : this.backupSlotCount - 1;
    const target = this.host.placeShip(decisiveGalleryShipName(ship), level, requestedIndex, maxIndex);
    const queueLength = this.host.getState()[level].length;
    this.galleryLevel = level;
    if (level === "level1") {
      this.activeMainIndex = target;
      if (advanceToNextEmpty && queueLength < MAIN_SLOT_COUNT) {
        this.activeMainIndex = queueLength;
      }
    } else {
      this.activeBackupIndex = target;
      if (advanceToNextEmpty && target + 1 < this.backupSlotCount) {
        this.activeBackupIndex = target + 1;
      }
    }
    this.markDirty();
    this.renderQueues();
    this.galleryView.renderSelection();
    this.renderGalleryTarget();
    if (level === "level2")
      this.scrollBackupSlotIntoView(this.activeBackupIndex);
  }
  handleDrop(payload, group, targetIndex) {
    if (!this.editEnabled.checked)
      return;
    try {
      if (payload.group === "gallery") {
        const ship = this.galleryView.shipById(Number(payload.shipId));
        if (ship)
          this.placeGalleryShip(ship, GROUP_LEVELS[group], targetIndex, false);
        return;
      }
      this.moveQueueShip(GROUP_LEVELS[payload.group], payload.index, GROUP_LEVELS[group], targetIndex);
    } finally {
      this.galleryView.clearDragScroll();
      this.slotBoard.clearBackupDragScroll();
      this.slotBoard.clearDragOver();
    }
  }
  moveQueueShip(sourceLevel, sourceIndex, targetLevel, targetIndex) {
    const movedTarget = this.host.moveShip(sourceLevel, sourceIndex, targetLevel, targetIndex);
    if (movedTarget === null)
      return;
    this.galleryLevel = targetLevel;
    if (targetLevel === "level1") {
      this.activeMainIndex = Math.min(movedTarget, MAIN_SLOT_COUNT - 1);
    } else {
      this.activeBackupIndex = movedTarget;
    }
    this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.host.getState().level2.length);
    this.markDirty();
    this.renderQueues();
    this.galleryView.renderSelection();
    this.renderGalleryTarget();
    if (targetLevel === "level2")
      this.scrollBackupSlotIntoView(movedTarget);
  }
  scrollBackupSlotIntoView(index) {
    this.slotBoard.scrollSlotIntoView("backup", index);
  }
  findDisplayShip(name) {
    return (0, shipLibrary_js_1.findShipLibraryShip)(this.galleryView.ships(), {
      name
    });
  }
  findConfiguredShip(ship) {
    const exact = this.host.findShip(ship.name);
    if (exact)
      return exact;
    const state = this.host.getState();
    for (const level of LEVELS) {
      const index = state[level].findIndex((name) => (this.shipSearchNameByName.get(name) ?? name) === ship.search_name);
      if (index >= 0)
        return {
          level,
          index
        };
    }
    return null;
  }
  renderGalleryTarget() {
    this.galleryView.updateCardTargets();
  }
  activeSlotDescription() {
    if (this.galleryLevel === "level1") {
      return `\u4E3B\u9009\u4F4D\u7F6E ${this.activeMainIndex + 1}`;
    }
    return `\u7B2C ${this.activeBackupIndex + 1} \u4E2A\u5907\u9009\u69FD\u4F4D`;
  }
  async resetTeam() {
    if (!this.editEnabled.checked)
      return;
    const confirmed = await (0, DialogHelper_1.showConfirm)("\u6062\u590D\u9ED8\u8BA4\u51B3\u6218\u961F\u4F0D", "\u5C06\u6309\u7167GUI2.0\u63D0\u4F9B\u7684\u9ED8\u8BA4\u914D\u7F6E\u6062\u590D\u5F53\u524D\u961F\u4F0D\u961F\u5217\uFF0C\u6B64\u884C\u4E3A\u5C06\u4F1A\u8986\u76D6\u7EE7\u627F\u81F3\u65E7\u76EE\u5F55\u7684\u51B3\u6218\u914D\u7F6E\u3002\u6062\u590D\u540E\u8BF7\u70B9\u51FB\u4FDD\u5B58\u914D\u7F6E\u3002");
    if (!confirmed)
      return;
    const result = await this.host.resetTeams();
    if (!result.success) {
      this.setStatus("\u6062\u590D\u9ED8\u8BA4\u914D\u7F6E\u5931\u8D25", true);
      await (0, DialogHelper_1.showAlert)("\u6062\u590D\u5931\u8D25", result.error instanceof Error ? result.error.message : String(result.error ?? "\u672A\u77E5\u9519\u8BEF"));
      return;
    }
    this.activeMainIndex = 0;
    this.activeBackupIndex = 0;
    this.galleryLevel = "level1";
    this.backupSlotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, this.host.getState().level2.length);
    this.markDirty();
    this.renderQueues();
    this.galleryView.renderSelection();
    this.renderGalleryTarget();
  }
  async changeChapter(chapter) {
    const previousChapter = this.host.getState().chapter;
    if (chapter === previousChapter)
      return;
    if (this.host.getState().dirty) {
      const confirmed = await (0, DialogHelper_1.showConfirm)("\u5207\u6362\u51B3\u6218\u7AE0\u8282", `\u7B2C ${previousChapter} \u7AE0\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u5207\u6362\u7AE0\u8282\u5C06\u653E\u5F03\u8FD9\u4E9B\u4FEE\u6539\u3002\u662F\u5426\u7EE7\u7EED\uFF1F`);
      if (!confirmed) {
        this.chapter.value = String(previousChapter);
        return;
      }
    }
    this.chapter.disabled = true;
    this.setStatus(`\u6B63\u5728\u8BFB\u53D6\u7B2C ${chapter} \u7AE0\u914D\u7F6E\u2026`);
    const result = await this.host.changeChapter(chapter);
    this.chapter.disabled = false;
    if (result.success) {
      this.showChapterLoaded();
      return;
    }
    this.chapter.value = String(previousChapter);
    this.setStatus(`\u7B2C ${chapter} \u7AE0\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25`, true);
    await (0, DialogHelper_1.showAlert)("\u5207\u6362\u7AE0\u8282\u5931\u8D25", result.error instanceof Error ? result.error.message : String(result.error ?? "\u672A\u77E5\u9519\u8BEF"));
  }
  async save(showSavedStatus = true) {
    this.host.setChapter(Number(this.chapter.value));
    this.host.setUseQuickRepair(this.quickRepair.checked);
    const result = await this.host.save();
    if (result.success) {
      if (showSavedStatus) {
        this.setStatus("\u914D\u7F6E\u5DF2\u4FDD\u5B58");
        (0, DialogHelper_1.showSaveSuccess)("\u51B3\u6218\u914D\u7F6E\u4FDD\u5B58\u6210\u529F");
      }
      return true;
    }
    this.setStatus("\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25", true);
    await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", result.error instanceof Error ? result.error.message : String(result.error ?? "\u672A\u77E5\u9519\u8BEF"));
    return false;
  }
  markDirty() {
    this.setStatus("\u6709\u672A\u4FDD\u5B58\u4FEE\u6539");
  }
  setStatus(message, error = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", error);
    this.status.classList.toggle("is-dirty", this.host.getState().dirty && !error);
  }
};
exports.DecisivePlanView = DecisivePlanView;