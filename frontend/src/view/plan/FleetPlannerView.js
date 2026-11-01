"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetPlannerView = void 0;
var DialogHelper_1 = require_DialogHelper();
var TeamPlanLoaderView_1 = require_TeamPlanLoaderView();
var FleetGalleryView_1 = require_FleetGalleryView();
var FleetEditorView_1 = require_FleetEditorView();
var FleetPlannerView = class {
  constructor(host) {
    this.host = host;
    this.presetNameInput = document.getElementById("fleet-preset-name");
    this.editorView = new FleetEditorView_1.FleetEditorView({
      currentDraft: () => this.currentFleet(),
      editDraft: (intent) => this.host.editDraft(intent),
      shipById: (id) => this.galleryView.shipById(id),
      colorfulBackgroundUrl: () => this.galleryView.colorfulBackgroundUrl(),
      shipTypeDisplay: (ship) => this.galleryView.shipTypeDisplay(ship),
      renderGallerySelection: () => this.galleryView.renderSelection(),
      updateGalleryCardTargets: () => this.galleryView.updateCardTargets(),
      getBackupFollowMode: () => this.host.getBackupFollowMode(),
      setBackupFollowMode: (mode) => this.host.setBackupFollowMode(mode)
    });
    this.galleryView = new FleetGalleryView_1.FleetGalleryView("fleet", {
      getRefitFilter: () => this.host.getRefitFilter(),
      setRefitFilter: (enabled) => this.host.setRefitFilter(enabled),
      getGalleryState: () => this.host.getGalleryState(),
      setGalleryState: (state) => this.host.setGalleryState(state),
      activeSlotDescription: () => this.editorView.activeSlotDescription(),
      isExcluded: (ship) => this.editorView.selectedShips().some((selected) => selected.id === ship.id),
      assignShip: (ship) => this.editorView.assignShip(ship),
      drag: {
        onStart: () => this.editorView.rememberBackupScroll(),
        onEnd: () => this.editorView.clearBackupDragScroll()
      }
    });
    this.teamPlanLoaderView = new TeamPlanLoaderView_1.TeamPlanLoaderView({
      ensureLibrary: () => this.host.loadShipLibrary(false),
      loadPlans: () => this.host.loadTeamPlans(),
      ships: () => this.galleryView.ships(),
      colorfulBackgroundUrl: () => this.galleryView.colorfulBackgroundUrl(),
      shipTypeDisplay: (ship) => this.galleryView.shipTypeDisplay(ship),
      hasUnsavedChanges: () => this.hasUnsavedFleetChanges(),
      applyPlan: (planId) => this.host.applyTeamPlan(planId)
    });
    this.bindActions();
    this.editorView.render();
  }
  bindActions() {
    this.presetNameInput.addEventListener("input", () => {
      this.host.setDraftName(this.presetNameInput.value);
    });
    document.getElementById("btn-save-team-plan")?.addEventListener("click", () => {
      void this.host.saveTeamPlan(this.presetNameInput.value);
    });
    document.getElementById("btn-new-team-plan")?.addEventListener("click", () => {
      void this.newTeamPlan();
    });
    document.getElementById("btn-load-team-plan")?.addEventListener("click", () => {
      void this.teamPlanLoaderView.open();
    });
  }
  currentFleet() {
    return this.host.currentDraft();
  }
  hasUnsavedFleetChanges() {
    return this.host.hasUnsavedDraftChanges(this.presetNameInput.value);
  }
  dispose() {
    this.editorView.dispose();
    this.galleryView.dispose();
  }
  async newTeamPlan() {
    if (this.hasUnsavedFleetChanges()) {
      const confirmed = await (0, DialogHelper_1.showConfirm)("\u65B0\u5EFA\u8230\u961F\u9884\u8BBE", "\u5F53\u524D\u8230\u961F\u7F16\u961F\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u7EE7\u7EED\u65B0\u5EFA\u5C06\u4E22\u5931\u8FD9\u4E9B\u4FEE\u6539\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F");
      if (!confirmed)
        return;
    }
    this.host.resetDraft();
    this.presetNameInput.value = "";
    this.editorView.reset();
    this.presetNameInput.focus();
  }
  showShipLibrary(library) {
    this.galleryView.showLibrary(library);
  }
  showShipLibraryLoading() {
    this.galleryView.showLoading();
  }
  showShipLibraryError(message) {
    this.galleryView.showLoadError(message);
  }
  async confirmTeamPlanOverwrite() {
    return (0, DialogHelper_1.showConfirm)("\u8986\u76D6\u914D\u7F6E", "\u5B58\u5728\u540C\u540D\u914D\u7F6E\uFF0C\u662F\u5426\u8986\u76D6");
  }
  showTeamPlanSaved(name) {
    (0, DialogHelper_1.showSaveSuccess)(`\u8230\u961F\u65B9\u6848\u300C${name}\u300D\u4FDD\u5B58\u6210\u529F`);
  }
  async showTeamPlanSaveError(message) {
    await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", message);
  }
  async showTeamPlanLoadError(message) {
    await (0, DialogHelper_1.showAlert)("\u52A0\u8F7D\u5931\u8D25", message);
  }
  showDraftName(name) {
    this.presetNameInput.value = name;
  }
  showDraft(name) {
    this.showDraftName(name);
    this.editorView.reset();
  }
  openTeamPlan(planId) {
    return this.teamPlanLoaderView.open(planId);
  }
};
exports.FleetPlannerView = FleetPlannerView;