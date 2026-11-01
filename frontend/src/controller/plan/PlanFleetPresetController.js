"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanFleetPresetController = void 0;
var IpcAdapter_js_1 = require_IpcAdapter();
var FleetPresetIdentity_js_1 = require_FleetPresetIdentity();
var fleetViewObjects_js_1 = require_fleetViewObjects();
var PlanFleetPresetController = class {
  constructor(repository = IpcAdapter_js_1.fleetPlannerRepository) {
    this.repository = repository;
    this.idsByIdentity = /* @__PURE__ */ new Map();
    this.records = [];
    this.status = "loading";
    this.message = "";
    this.errorCount = 0;
    this.shipLibrary = null;
    this.loadVersion = 0;
    this.nextId = 1;
  }
  async load() {
    const version = ++this.loadVersion;
    this.status = "loading";
    this.message = "";
    try {
      const [result, manifest] = await Promise.all([
        this.repository.listTeamPlans(),
        this.shipLibrary ? Promise.resolve(null) : this.repository.getShipLibraryManifest()
      ]);
      if (version !== this.loadVersion)
        return;
      this.records = result.plans.map((plan, index) => {
        const source = plan.source ?? "user";
        const preset = (0, fleetViewObjects_js_1.userTeamPlanToFleetPreset)(plan);
        const identity = plan.file ? `${source}:${plan.file}` : `${source}:missing:${index}:${(0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(preset)}`;
        let id = this.idsByIdentity.get(identity);
        if (!id) {
          id = `plan-team-${this.nextId}`;
          this.nextId += 1;
          this.idsByIdentity.set(identity, id);
        }
        return {
          id,
          preset,
          source,
          modifiedAt: plan.modifiedAt
        };
      });
      if (manifest) {
        this.shipLibrary = (0, fleetViewObjects_js_1.toFleetShipLibraryViewObject)(manifest);
      }
      this.errorCount = result.errors.length;
      this.status = "ready";
    } catch (error) {
      if (version !== this.loadVersion)
        return;
      this.status = "error";
      this.message = error instanceof Error ? error.message : String(error);
    }
  }
  appendPreset(selected, planId) {
    const record = this.records.find((item) => item.id === planId);
    if (!record)
      return null;
    const identity = (0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(record.preset);
    if (selected.some((preset) => (0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(preset) === identity)) {
      return null;
    }
    return [
      ...selected.map(fleetViewObjects_js_1.cloneFleetPreset),
      (0, fleetViewObjects_js_1.cloneFleetPreset)(record.preset)
    ];
  }
  removePreset(selected, index) {
    if (index < 0 || index >= selected.length)
      return null;
    return selected.filter((_, presetIndex) => presetIndex !== index).map(fleetViewObjects_js_1.cloneFleetPreset);
  }
  /** 使用目录中的最新编队替换当前计划内的同名或已改名引用。 */
  synchronizePreset(selected, newName, previousName, source) {
    const replacement = this.records.find((record) => record.source === source && record.preset.name === newName);
    if (!replacement)
      return null;
    const matchedNames = /* @__PURE__ */ new Set([newName]);
    if (previousName)
      matchedNames.add(previousName);
    if (!selected.some((preset) => matchedNames.has(preset.name))) {
      return null;
    }
    let changed = false;
    let replacementAdded = false;
    const synchronized = [];
    for (const preset of selected) {
      if (!matchedNames.has(preset.name)) {
        synchronized.push((0, fleetViewObjects_js_1.cloneFleetPreset)(preset));
        continue;
      }
      if (replacementAdded) {
        changed = true;
        continue;
      }
      const nextPreset = (0, fleetViewObjects_js_1.cloneFleetPreset)(replacement.preset);
      synchronized.push(nextPreset);
      replacementAdded = true;
      if ((0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(preset) !== (0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(nextPreset)) {
        changed = true;
      }
    }
    return changed ? synchronized : null;
  }
  toViewObject(selected) {
    const selectedIdentities = new Set(selected.map(FleetPresetIdentity_js_1.fleetPresetIdentityKey));
    const plans = this.records.map((record) => (0, fleetViewObjects_js_1.toTeamPlanViewObject)(record.id, record.preset, record.source, record.modifiedAt, selectedIdentities.has((0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(record.preset))));
    const bindings = selected.map((preset, index) => {
      const identity = (0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(preset);
      const exact = this.records.find((record) => (0, FleetPresetIdentity_js_1.fleetPresetIdentityKey)(record.preset) === identity);
      const sourceRecord = exact ?? this.records.find((record) => record.preset.name === preset.name);
      return {
        index,
        catalogPlanId: sourceRecord?.id,
        name: preset.name,
        source: sourceRecord?.source ?? "deleted",
        modifiedAt: sourceRecord?.modifiedAt,
        ships: preset.ships.map(fleetViewObjects_js_1.toTeamPlanSlotViewObject)
      };
    });
    return {
      status: this.status,
      message: this.message,
      errorCount: this.errorCount,
      plans,
      bindings,
      shipLibrary: this.shipLibrary
    };
  }
};
exports.PlanFleetPresetController = PlanFleetPresetController;