"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisivePlanController = void 0;
var IpcAdapter_1 = require_IpcAdapter();
var StorageAdapter_js_1 = require_StorageAdapter();
var DecisiveFleetDraft_1 = require_DecisiveFleetDraft();
var DecisivePlanView_1 = require_DecisivePlanView();
var galleryStateStorage_js_1 = require_galleryStateStorage();
var GALLERY_STATE_STORAGE_KEY = "decisivePlanGalleryState";
var DecisivePlanController = class {
  constructor(repository = IpcAdapter_1.decisivePlanRepository, storage = StorageAdapter_js_1.browserStorageStore) {
    this.repository = repository;
    this.storage = storage;
    this.draft = new DecisiveFleetDraft_1.DecisiveFleetDraft();
    this.view = new DecisivePlanView_1.DecisivePlanView({
      getState: () => this.getViewState(),
      getGalleryState: () => (0, galleryStateStorage_js_1.loadGalleryViewState)(this.storage, GALLERY_STATE_STORAGE_KEY),
      setGalleryState: (state) => (0, galleryStateStorage_js_1.saveGalleryViewState)(this.storage, GALLERY_STATE_STORAGE_KEY, state),
      setChapter: (chapter) => this.draft.setChapter(chapter),
      changeChapter: (chapter) => this.changeChapter(chapter),
      setUseQuickRepair: (useQuickRepair) => this.draft.setUseQuickRepair(useQuickRepair),
      findShip: (name) => this.draft.find(name),
      placeShip: (name, level, requestedIndex, maxIndex) => this.draft.place(name, level, requestedIndex, maxIndex),
      removeShip: (level, index) => this.draft.remove(level, index),
      moveShip: (sourceLevel, sourceIndex, targetLevel, targetIndex) => this.draft.move(sourceLevel, sourceIndex, targetLevel, targetIndex),
      resetTeams: () => this.resetTeams(),
      save: () => this.save()
    });
  }
  bindActions() {
    this.view.bindActions();
  }
  dispose() {
    this.view.dispose();
  }
  async load() {
    try {
      this.draft.load(await this.repository.loadSettings());
      const manifest = await this.repository.loadShipLibrary();
      this.view.showLoaded(manifest);
    } catch (error) {
      this.draft.load(DecisiveFleetDraft_1.DEFAULT_DECISIVE_PLAN_SETTINGS);
      this.view.showLoadFailure();
      console.error("[DecisivePlan] \u8BFB\u53D6\u914D\u7F6E\u5931\u8D25", error);
    }
  }
  getViewState() {
    return {
      chapter: this.draft.chapter,
      useQuickRepair: this.draft.useQuickRepair,
      level1: [...this.draft.queue("level1")],
      level2: [...this.draft.queue("level2")],
      dirty: this.draft.dirty
    };
  }
  async save() {
    try {
      this.draft.load(await this.repository.saveSettings(this.draft.toSettings()));
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }
  async changeChapter(chapter) {
    try {
      this.draft.load(await this.repository.loadChapter(chapter));
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }
  async resetTeams() {
    try {
      const defaults = await this.repository.loadSystemDefaults(this.draft.chapter);
      this.draft.resetTeams(defaults);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }
};
exports.DecisivePlanController = DecisivePlanController;