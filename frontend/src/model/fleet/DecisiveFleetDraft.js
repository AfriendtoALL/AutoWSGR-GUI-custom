"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisiveFleetDraft = exports.DEFAULT_DECISIVE_PLAN_SETTINGS = void 0;
exports.cloneDecisiveFleetDraft = cloneDecisiveFleetDraft;
exports.decisiveFleetDraftSnapshot = decisiveFleetDraftSnapshot;
exports.hasDecisiveFleetDraftChanges = hasDecisiveFleetDraftChanges;
var decisivePlan_js_1 = require_decisivePlan();
var decisivePlan_js_2 = require_decisivePlan();
var FleetQueueOps_js_1 = require_FleetQueueOps();
Object.defineProperty(exports, "DEFAULT_DECISIVE_PLAN_SETTINGS", { enumerable: true, get: function() {
  return decisivePlan_js_2.DEFAULT_DECISIVE_PLAN_SETTINGS;
} });
function cloneDecisiveFleetDraft(settings) {
  return {
    chapter: settings.chapter,
    useQuickRepair: settings.useQuickRepair,
    level1: [...settings.level1],
    level2: [...settings.level2]
  };
}
function decisiveFleetDraftSnapshot(settings) {
  return JSON.stringify({
    chapter: settings.chapter,
    useQuickRepair: settings.useQuickRepair,
    level1: [...settings.level1],
    level2: [...settings.level2]
  });
}
function hasDecisiveFleetDraftChanges(settings, savedSnapshot) {
  return decisiveFleetDraftSnapshot(settings) !== savedSnapshot;
}
var DecisiveFleetDraft = class {
  constructor(settings = decisivePlan_js_1.DEFAULT_DECISIVE_PLAN_SETTINGS) {
    this.settings = cloneDecisiveFleetDraft(settings);
    this.savedSnapshot = decisiveFleetDraftSnapshot(this.settings);
  }
  get chapter() {
    return this.settings.chapter;
  }
  get useQuickRepair() {
    return this.settings.useQuickRepair;
  }
  get dirty() {
    return hasDecisiveFleetDraftChanges(this.settings, this.savedSnapshot);
  }
  setChapter(chapter) {
    this.settings.chapter = chapter;
  }
  setUseQuickRepair(useQuickRepair) {
    this.settings.useQuickRepair = useQuickRepair;
  }
  queue(level) {
    return this.settings[level];
  }
  find(name) {
    for (const level of ["level1", "level2"]) {
      const index = this.settings[level].indexOf(name);
      if (index >= 0)
        return { level, index };
    }
    return null;
  }
  /** 7.8/R43：候选/主选顺序统一由 FleetQueueOps 实现。 */
  place(name, level, requestedIndex, maxIndex) {
    return (0, FleetQueueOps_js_1.placeQueueItem)(this.settings[level], name, requestedIndex, maxIndex);
  }
  remove(level, index) {
    return (0, FleetQueueOps_js_1.removeQueueItem)(this.settings[level], index);
  }
  move(sourceLevel, sourceIndex, targetLevel, targetIndex) {
    return (0, FleetQueueOps_js_1.moveQueueItem)(this.settings[sourceLevel], sourceIndex, this.settings[targetLevel], targetIndex);
  }
  resetTeams(defaults = decisivePlan_js_1.DEFAULT_DECISIVE_PLAN_SETTINGS) {
    this.settings.level1 = [
      ...defaults.level1
    ];
    this.settings.level2 = [
      ...defaults.level2
    ];
  }
  load(settings) {
    this.settings = cloneDecisiveFleetDraft(settings);
    this.savedSnapshot = decisiveFleetDraftSnapshot(this.settings);
  }
  toSettings() {
    return cloneDecisiveFleetDraft(this.settings);
  }
};
exports.DecisiveFleetDraft = DecisiveFleetDraft;