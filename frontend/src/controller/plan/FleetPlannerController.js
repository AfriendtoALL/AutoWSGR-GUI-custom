"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetPlannerController = void 0;
var IpcAdapter_1 = require_IpcAdapter();
var StorageAdapter_1 = require_StorageAdapter();
var FleetDraft_1 = require_FleetDraft();
var FleetDraftEditor_1 = require_FleetDraftEditor();
var FleetPlannerView_1 = require_FleetPlannerView();
var fleetViewObjects_js_1 = require_fleetViewObjects();
var PlanManagementController_js_1 = require_PlanManagementController();
var galleryStateStorage_js_1 = require_galleryStateStorage();
var REFIT_FILTER_STORAGE_KEY = "fleetPlannerRefitFilter";
var BACKUP_FOLLOW_MODE_STORAGE_KEY = "fleetPlannerBackupFollowMode";
var GALLERY_STATE_STORAGE_KEY = "fleetPlannerGalleryState";
var FleetPlannerController = class {
  constructor(repository = IpcAdapter_1.fleetPlannerRepository, storage = StorageAdapter_1.browserStorageStore) {
    this.repository = repository;
    this.storage = storage;
    this.draft = (0, FleetDraft_1.createFleetDraft)();
    this.savedDraftSnapshot = (0, FleetDraft_1.fleetDraftSnapshot)(this.draft);
    this.teamPlans = /* @__PURE__ */ new Map();
    this.teamPlanIds = /* @__PURE__ */ new Map();
    this.shipLibrary = null;
    this.shipLibraryLoading = null;
    this.nextTeamPlanId = 1;
    this.teamPlanSavedHandler = null;
    this.view = new FleetPlannerView_1.FleetPlannerView({
      loadShipLibrary: (force) => this.loadShipLibrary(force),
      loadTeamPlans: () => this.loadTeamPlans(),
      saveTeamPlan: (name) => this.saveTeamPlan(name),
      applyTeamPlan: (planId) => this.applyTeamPlan(planId),
      getRefitFilter: () => this.storage.get(REFIT_FILTER_STORAGE_KEY) === "true",
      setRefitFilter: (enabled) => this.storage.set(REFIT_FILTER_STORAGE_KEY, String(enabled)),
      getGalleryState: () => (0, galleryStateStorage_js_1.loadGalleryViewState)(this.storage, GALLERY_STATE_STORAGE_KEY),
      setGalleryState: (state) => (0, galleryStateStorage_js_1.saveGalleryViewState)(this.storage, GALLERY_STATE_STORAGE_KEY, state),
      getBackupFollowMode: () => this.storage.get(BACKUP_FOLLOW_MODE_STORAGE_KEY) === "position" ? "position" : "ship",
      setBackupFollowMode: (mode) => this.storage.set(BACKUP_FOLLOW_MODE_STORAGE_KEY, mode),
      currentDraft: () => this.toFleetDraftViewObject(),
      editDraft: (intent) => this.editDraft(intent),
      setDraftName: (name) => {
        this.draft.name = name;
      },
      resetDraft: () => this.resetDraft(),
      hasUnsavedDraftChanges: (name) => (0, FleetDraft_1.hasFleetDraftChanges)({
        ...this.draft,
        name
      }, this.savedDraftSnapshot)
    });
    this.planManagementCtrl = new PlanManagementController_js_1.PlanManagementController(repository);
    this.planManagementCtrl.onOpenTeamPlan = (file, source) => this.openTeamPlan(file, source);
  }
  set onOpenBattlePlan(handler) {
    this.planManagementCtrl.onOpenBattlePlan = handler;
  }
  set onTeamPlanSaved(handler) {
    this.teamPlanSavedHandler = handler;
  }
  setTaskGroupsProvider(provider) {
    this.planManagementCtrl.setTaskGroupsProvider(provider);
  }
  load(force = false) {
    return this.loadShipLibrary(force);
  }
  loadManagement() {
    return this.planManagementCtrl.load();
  }
  dispose() {
    this.view.dispose();
  }
  loadShipLibrary(force) {
    if (this.shipLibraryLoading)
      return this.shipLibraryLoading;
    if (this.shipLibrary && !force) {
      this.view.showShipLibrary(this.shipLibrary);
      return Promise.resolve();
    }
    this.view.showShipLibraryLoading();
    this.shipLibraryLoading = this.repository.getShipLibraryManifest().then((manifest) => {
      this.shipLibrary = (0, fleetViewObjects_js_1.toFleetShipLibraryViewObject)(manifest);
      this.view.showShipLibrary(this.shipLibrary);
    }).catch((error) => {
      this.view.showShipLibraryError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      this.shipLibraryLoading = null;
    });
    return this.shipLibraryLoading;
  }
  toFleetRuleViewObject(rule) {
    return {
      shipTypes: [...rule.shipTypes],
      levelEnabled: rule.levelEnabled,
      minLevel: rule.minLevel,
      maxLevel: rule.maxLevel,
      relaxed: rule.relaxed
    };
  }
  toFleetDraftViewObject() {
    return {
      name: this.draft.name,
      slots: this.draft.slots.map((slot) => ({
        primary: slot.primary,
        candidates: slot.candidates.map((candidate) => ({
          ship: candidate.ship,
          ...this.toFleetRuleViewObject(candidate)
        })),
        ...this.toFleetRuleViewObject(slot)
      }))
    };
  }
  editDraft(intent) {
    return (0, FleetDraftEditor_1.applyFleetDraftEdit)(this.draft, intent);
  }
  async loadTeamPlans() {
    const result = await this.repository.listTeamPlans();
    this.teamPlans.clear();
    const plans = result.plans.map((plan, index) => {
      const source = plan.source ?? "user";
      const identity = this.teamPlanIdentity(source, plan.file ?? `missing-${index}-${plan.name}`);
      let id = this.teamPlanIds.get(identity);
      if (!id) {
        id = `team-plan-${this.nextTeamPlanId}`;
        this.nextTeamPlanId += 1;
        this.teamPlanIds.set(identity, id);
      }
      this.teamPlans.set(id, plan);
      const selected = Boolean(plan.file && this.draft.file && source === this.draft.source && this.teamPlanIdentity(source, plan.file) === this.teamPlanIdentity(this.draft.source, this.draft.file));
      return (0, fleetViewObjects_js_1.toTeamPlanViewObject)(id, (0, fleetViewObjects_js_1.userTeamPlanToFleetPreset)(plan), source, plan.modifiedAt, selected);
    });
    return {
      plans,
      errorCount: result.errors.length
    };
  }
  async saveTeamPlan(rawName) {
    try {
      const plan = (0, FleetDraft_1.fleetDraftToTeamPlan)(this.draft, rawName);
      const currentFile = this.draft.file ?? void 0;
      const currentSource = this.draft.source;
      let result = await this.repository.saveUserTeamPlan(plan, false, currentFile, currentSource);
      if (result.exists) {
        if (!await this.view.confirmTeamPlanOverwrite())
          return;
        result = await this.repository.saveUserTeamPlan(plan, true, currentFile, currentSource);
      }
      if (!result.success) {
        throw new Error(result.error || "\u4FDD\u5B58\u5931\u8D25");
      }
      this.draft.name = plan.name;
      this.draft.file = result.file ?? result.plan?.file ?? null;
      this.draft.source = result.plan?.source ?? "user";
      this.savedDraftSnapshot = (0, FleetDraft_1.fleetDraftSnapshot)(this.draft);
      this.view.showDraftName(plan.name);
      this.view.showTeamPlanSaved(plan.name);
      const savedPlan = result.plan ?? {
        ...plan,
        file: this.draft.file ?? void 0,
        source: this.draft.source
      };
      await this.teamPlanSavedHandler?.(result.renamedFrom ?? null, savedPlan);
      await this.planManagementCtrl.load();
    } catch (error) {
      await this.view.showTeamPlanSaveError(error instanceof Error ? error.message : String(error));
    }
  }
  async applyTeamPlan(planId) {
    const plan = this.teamPlans.get(planId);
    if (!plan) {
      return {
        success: false,
        error: "\u672A\u627E\u5230\u5BF9\u5E94\u7684\u8230\u961F\u65B9\u6848"
      };
    }
    try {
      this.draft = (0, FleetDraft_1.fleetDraftFromTeamPlan)(plan, this.shipLibrary?.ships ?? []);
      this.savedDraftSnapshot = (0, FleetDraft_1.fleetDraftSnapshot)(this.draft);
      this.view.showDraft(this.draft.name);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async openTeamPlan(file, source) {
    await this.loadShipLibrary(false);
    await this.loadTeamPlans();
    const id = this.teamPlanIds.get(this.teamPlanIdentity(source, file));
    if (!id || !this.teamPlans.has(id)) {
      await this.view.showTeamPlanLoadError("\u672A\u627E\u5230\u5BF9\u5E94\u7684\u8230\u961F\u65B9\u6848");
      return;
    }
    await this.view.openTeamPlan(id);
  }
  resetDraft() {
    this.draft = (0, FleetDraft_1.createFleetDraft)();
    this.savedDraftSnapshot = (0, FleetDraft_1.fleetDraftSnapshot)(this.draft);
  }
  teamPlanIdentity(source, file) {
    return `${source}:${file.trim().toLocaleLowerCase("en-US")}`;
  }
};
exports.FleetPlannerController = FleetPlannerController;