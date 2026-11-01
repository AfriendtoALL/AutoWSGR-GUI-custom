"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanController = void 0;
var PlanModel_1 = require_PlanModel();
var MapDataLoader_1 = require_MapDataLoader();
var taskPreset_1 = require_taskPreset();
var BattlePlanLoaderView_1 = require_BattlePlanLoaderView();
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
var presetFlow_1 = require_presetFlow();
var adapter_1 = require_adapter();
var IpcAdapter_1 = require_IpcAdapter();
var nodeEditor_1 = require_nodeEditor();
var rendering_1 = require_rendering();
var BattlePlanLoaderController_1 = require_BattlePlanLoaderController();
var PlanFleetPresetController_js_1 = require_PlanFleetPresetController();
var selectedNodes_1 = require_selectedNodes();
var PlanController = class {
  constructor(planView, host, fleetPresetRepository, managedPlans = (0, IpcAdapter_1.getPlansGateway)()) {
    this.planView = planView;
    this.host = host;
    this.managedPlans = managedPlans;
    this.currentPlan = null;
    this.currentMapData = null;
    this.editingNodeId = null;
    this.currentPreset = null;
    this.currentPresetFilePath = "";
    this.currentPresetSource = "user";
    this.mapLoadVersion = 0;
    this.planPresetName = "";
    this.currentManagedPlanFile = null;
    this.currentPlanSource = "user";
    this.savedPlanSnapshot = "";
    this.eventMapCatalog = [];
    this.fleetPresetController = new PlanFleetPresetController_js_1.PlanFleetPresetController(fleetPresetRepository);
    this.battlePlanLoader = new BattlePlanLoaderController_1.BattlePlanLoaderController(new BattlePlanLoaderView_1.BattlePlanLoaderView(), {
      getCurrentPlanIdentity: () => ({
        file: this.currentManagedPlanFile,
        source: this.currentPlanSource
      }),
      openManagedPlan: (file, source) => this.openManagedPlan(file, source)
    }, this.managedPlans);
  }
  // ── 公共访问器 ──
  getCurrentPlan() {
    return this.currentPlan;
  }
  async synchronizeTeamPlan(previousName, plan) {
    await this.fleetPresetController.load();
    if (!this.currentPlan) {
      this.renderFleetPresetSelector();
      return;
    }
    const hadUnsavedChanges = this.hasUnsavedPlanChanges();
    const previousNameForCurrentPlan = this.currentPlanSource === "user" ? previousName : null;
    const synchronized = this.fleetPresetController.synchronizePreset(this.currentPlan.data.fleet_presets ?? [], plan.name, previousNameForCurrentPlan, "user");
    if (!synchronized) {
      this.renderFleetPresetSelector();
      return;
    }
    this.applyFleetPresets(synchronized);
    if (!hadUnsavedChanges) {
      this.savedPlanSnapshot = this.planDraftSnapshot();
    }
    this.renderPlanPreview();
  }
  pickManagedBattlePlan() {
    return this.battlePlanLoader.pick("task-list");
  }
  async pickManagedBattlePlanForQueue() {
    if (this.hasUnsavedPlanChanges()) {
      const confirmed = await (0, DialogHelper_1.showConfirm)("\u672A\u4FDD\u5B58\u4FEE\u6539", "\u5F53\u524D\u51FA\u5F81\u89C4\u5212\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u662F\u5426\u5148\u4FDD\u5B58\u518D\u9009\u62E9\u52A0\u5165\u961F\u5217\uFF1F");
      if (!confirmed || !await this.savePlan())
        return null;
    }
    return this.battlePlanLoader.pick("queue");
  }
  pickManagedBattlePlanForAutomation(currentTask) {
    return this.battlePlanLoader.pick("automation", currentTask);
  }
  pickManagedLootPlans(currentPlans) {
    return this.battlePlanLoader.pickLootPlans(currentPlans);
  }
  setCurrentPlan(plan, mapData) {
    this.editingNodeId = null;
    this.planView.resetNodeEditorDrafts();
    this.planView.hideNodeEditor();
    this.mapLoadVersion++;
    this.currentPlan = plan;
    this.currentMapData = mapData;
    this.planPresetName = this.planNameFromPath(plan.fileName);
    this.currentManagedPlanFile = null;
    this.currentPlanSource = "user";
    this.savedPlanSnapshot = this.planDraftSnapshot();
    this.refreshFleetPresetCatalog();
  }
  async ensureEventMapCatalog() {
    this.eventMapCatalog = await (0, MapDataLoader_1.loadEventMapCatalog)();
  }
  getCurrentPresetInfo() {
    return this.currentPreset && this.currentPresetFilePath ? {
      preset: this.currentPreset,
      filePath: this.currentPresetFilePath,
      source: this.currentPresetSource
    } : null;
  }
  // ── PresetState 适配（供 presetFlow 函数读写） ──
  get presetState() {
    const self = this;
    return {
      get currentPreset() {
        return self.currentPreset;
      },
      set currentPreset(v) {
        self.currentPreset = v;
      },
      get currentPresetFilePath() {
        return self.currentPresetFilePath;
      },
      set currentPresetFilePath(v) {
        self.currentPresetFilePath = v;
      },
      get currentPresetSource() {
        return self.currentPresetSource;
      },
      set currentPresetSource(v) {
        self.currentPresetSource = v;
      }
    };
  }
  // ════════════════════════════════════════
  // 事件绑定
  // ════════════════════════════════════════
  bindActions() {
    this.planView.onNewPlan = () => void this.newPlan();
    this.planView.onLoadPlan = () => void this.loadPlan();
    this.planView.onSavePlan = () => void this.savePlan();
    this.battlePlanLoader.bindActions();
    this.planView.onNodeClick = (nodeId) => {
      if (!this.currentPlan)
        return;
      const mapData = this.currentMapData;
      const nodeType = mapData ? (0, MapDataLoader_1.getNodeType)(mapData, nodeId) : "Normal";
      this.editingNodeId = nodeId;
      const args = this.currentPlan.getNodeArgs(nodeId);
      const rulesText = (args.enemy_rules ?? []).map((r) => `${r[0]}, ${r[1]}`).join("\n");
      const mapNight = this.currentMapData ? (0, MapDataLoader_1.isNightNode)(this.currentMapData, nodeId) : false;
      const isEnabled = this.currentPlan.data.selected_nodes.includes(nodeId);
      const canDetour = this.currentMapData ? (0, MapDataLoader_1.isDetourNode)(this.currentMapData, nodeId) : false;
      const isEndpoint = (this.currentPlan.data.endpoint_nodes ?? []).includes(nodeId);
      const isTerminal = this.currentMapData ? (0, MapDataLoader_1.isTerminalNode)(this.currentMapData, nodeId) : false;
      this.planView.showNodeEditor(nodeId, nodeType, {
        enabled: isEnabled,
        formation: args.formation ?? 2,
        night: args.night ?? false,
        longMissileSupport: args.long_missile_support ?? false,
        proceed: args.proceed ?? true,
        detour: args.detour ?? false,
        canDetour,
        slWhenDetourFails: args.SL_when_detour_fails ?? true,
        isEndpoint,
        result: this.currentPlan.data.result,
        isTerminal,
        enemyRules: rulesText
      }, mapNight);
    };
    this.planView.onCloseNodeEditor = () => {
      this.editingNodeId = null;
      this.planView.hideNodeEditor();
    };
    this.planView.onSaveNodeEditor = () => {
      if ((0, nodeEditor_1.saveNodeEditorValues)(this.planView, this.currentPlan, this.editingNodeId)) {
        this.editingNodeId = null;
        this.renderPlanPreview();
      }
    };
    this.planView.onMapChange = (chapter, map) => {
      void this.changeMap(chapter, map);
    };
    this.planView.onPresetNameChange = (name) => {
      this.planPresetName = name;
    };
    this.planView.onPlanFieldChange = (field, value) => {
      if (!this.currentPlan)
        return;
      if (field === "repair_mode")
        this.currentPlan.data.repair_mode = value;
      else if (field === "fight_condition")
        this.currentPlan.data.fight_condition = value;
      else if (field === "fleet_id")
        this.currentPlan.data.fleet_id = value;
      else if (field === "times")
        this.currentPlan.data.times = value;
      else if (field === "gap")
        this.currentPlan.data.gap = value;
      else if (field === "loot_count_ge" || field === "ship_count_ge" || field === "level_slot" || field === "level_ge") {
        if (!this.currentPlan.data.stop_condition)
          this.currentPlan.data.stop_condition = {};
        const sc = this.currentPlan.data.stop_condition;
        if (value === void 0)
          delete sc[field];
        else
          sc[field] = value;
        if (sc.level_ge == null)
          delete sc.level_slot;
        if (sc.loot_count_ge == null && sc.ship_count_ge == null && sc.level_ge == null)
          this.currentPlan.data.stop_condition = void 0;
      }
    };
    this.planView.onAddFleetPreset = (planId) => {
      if (!this.currentPlan)
        return;
      const presets = this.fleetPresetController.appendPreset(this.currentPlan.data.fleet_presets ?? [], planId);
      if (!presets)
        return;
      this.applyFleetPresets(presets);
      this.renderFleetPresetSelector();
    };
    this.planView.onRemoveFleetPreset = (index) => {
      if (!this.currentPlan)
        return;
      const presets = this.fleetPresetController.removePreset(this.currentPlan.data.fleet_presets ?? [], index);
      if (!presets)
        return;
      this.applyFleetPresets(presets);
      this.renderFleetPresetSelector();
    };
  }
  applyFleetPresets(presets) {
    if (!this.currentPlan)
      return;
    this.currentPlan.data.fleet_presets = presets.map((team) => ({
      name: team.name,
      ships: team.ships.map((slot) => slot === null || typeof slot === "string" ? slot : {
        name: slot.name,
        candidates: slot.candidates ? slot.candidates.map((candidate) => ({
          ...candidate,
          ship_type: candidate.ship_type ? [...candidate.ship_type] : void 0
        })) : void 0,
        search_name: slot.search_name,
        ship_type: slot.ship_type ? [...slot.ship_type] : void 0,
        min_level: slot.min_level,
        max_level: slot.max_level,
        relaxed: slot.relaxed
      })
    }));
  }
  renderFleetPresetSelector() {
    if (!this.currentPlan)
      return;
    this.planView.renderFleetPresetSelector(this.fleetPresetController.toViewObject(this.currentPlan.data.fleet_presets ?? []));
  }
  refreshFleetPresetCatalog() {
    const loading = this.fleetPresetController.load();
    this.renderFleetPresetSelector();
    void loading.then(() => {
      this.renderFleetPresetSelector();
    });
  }
  // ── 委托方法 ──
  async openManagedPlan(file, source, skipDiscardConfirm = false) {
    if (!skipDiscardConfirm && !await this.confirmDiscardUnsaved()) {
      return false;
    }
    if (!this.managedPlans?.readManagedCombatPlan) {
      await (0, DialogHelper_1.showAlert)("\u52A0\u8F7D\u5931\u8D25", "\u8BF7\u5B8C\u6574\u91CD\u542F GUI \u540E\u518D\u64CD\u4F5C");
      return false;
    }
    try {
      const result = await this.managedPlans.readManagedCombatPlan(source, file);
      if (!result.success || !result.path || result.content === void 0) {
        await (0, DialogHelper_1.showAlert)("\u52A0\u8F7D\u5931\u8D25", result.error || "\u65E0\u6CD5\u8BFB\u53D6\u51FA\u5F81\u8BA1\u5212");
        return false;
      }
      const parsed = (0, adapter_1.parseYamlRecord)(result.content, "\u4EFB\u52A1\u6587\u4EF6");
      if (taskPreset_1.taskPresetCodec.isStandalone(parsed)) {
        this.importTaskPreset(taskPreset_1.taskPresetCodec.normalize(parsed), result.path, source);
        return true;
      }
      const plan = PlanModel_1.PlanModel.fromYaml(result.content, result.path);
      await this.ensureEventMapCatalog();
      const { chapter, map } = plan.data;
      const mapData = plan.isEvent ? await (0, MapDataLoader_1.loadEventMapData)(plan.data.event ?? "", chapter, map) : await (0, MapDataLoader_1.loadMapData)(Number(chapter), Number(map));
      this.setCurrentPlan(plan, mapData);
      this.currentManagedPlanFile = file;
      this.currentPlanSource = source;
      this.savedPlanSnapshot = this.planDraftSnapshot();
      this.renderPlanPreview();
      this.host.switchPage("plan");
      if (result.missingTeamNames?.length) {
        (0, DialogHelper_1.showWarningNotice)(`\u5F53\u524D YAML \u5173\u8054\u7684\u7F16\u961F\u914D\u7F6E\u4E0D\u5B58\u5728\uFF1A${result.missingTeamNames.join("\u3001")}\uFF0C\u8BF7\u68C0\u67E5`);
      }
      return true;
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u52A0\u8F7D\u5931\u8D25", error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  async newPlan() {
    if (this.hasUnsavedPlanChanges()) {
      const confirmed = await (0, DialogHelper_1.showConfirm)("\u65B0\u5EFA\u51FA\u5F81\u9884\u8BBE", "\u5F53\u524D\u51FA\u5F81\u89C4\u5212\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u7EE7\u7EED\u65B0\u5EFA\u5C06\u4E22\u5931\u8FD9\u4E9B\u4FEE\u6539\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F");
      if (!confirmed)
        return;
    }
    this.planView.resetNodeEditorDrafts();
    this.currentPlan = null;
    this.currentMapData = null;
    this.planPresetName = "";
    this.currentManagedPlanFile = null;
    this.currentPlanSource = "user";
    this.planView.hideNodeEditor();
    this.refreshFleetPresetCatalog();
    await this.changeMap("1", 1);
    this.savedPlanSnapshot = this.planDraftSnapshot();
    this.planView.focusPresetName();
  }
  async loadPlan() {
    await this.battlePlanLoader.openForEditor();
  }
  async confirmDiscardUnsaved(action = "\u52A0\u8F7D") {
    if (!this.hasUnsavedPlanChanges())
      return true;
    return (0, DialogHelper_1.showConfirm)("\u672A\u4FDD\u5B58\u4FEE\u6539", `\u5F53\u524D\u51FA\u5F81\u89C4\u5212\u5B58\u5728\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u7EE7\u7EED${action}\u5C06\u4E22\u5931\u8FD9\u4E9B\u4FEE\u6539\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F`);
  }
  planDraftSnapshot() {
    if (!this.currentPlan)
      return "";
    return adapter_1.jsonCodec.stringify({
      name: this.planPresetName,
      yaml: this.currentPlan.toYaml()
    });
  }
  hasUnsavedPlanChanges() {
    return this.planDraftSnapshot() !== this.savedPlanSnapshot;
  }
  planNameFromPath(filePath) {
    const file = filePath.split(/[\\/]/).pop() ?? "";
    return file.replace(/\.ya?ml$/i, "").replace(/^bettle-/i, "");
  }
  normalizePlanName(value) {
    return value.trim().replace(/\.ya?ml$/i, "").replace(/^bettle-/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 100);
  }
  async savePlan() {
    if (!this.currentPlan)
      return false;
    if (!this.managedPlans?.saveManagedCombatPlan) {
      await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u4FDD\u5B58\u51FA\u5F81\u89C4\u5212");
      return false;
    }
    const name = this.normalizePlanName(this.planView.getPresetName());
    if (!name) {
      await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", "\u8BF7\u5148\u586B\u5199\u9884\u8BBE\u540D\u79F0");
      return false;
    }
    try {
      const content = this.currentPlan.toYaml();
      const copiedFromSystem = this.currentPlanSource === "system";
      const currentFile = copiedFromSystem ? void 0 : this.currentManagedPlanFile ?? void 0;
      let result = await this.managedPlans.saveManagedCombatPlan(name, content, false, currentFile);
      if (result.exists) {
        const conflictDetails = result.conflicts?.length ? `

${result.conflicts.join("\n")}` : "";
        const overwrite = await (0, DialogHelper_1.showConfirm)("\u8986\u76D6\u914D\u7F6E", `\u5B58\u5728\u540C\u540D\u914D\u7F6E\uFF0C\u662F\u5426\u8986\u76D6\uFF1F${conflictDetails}`);
        if (!overwrite)
          return false;
        result = await this.managedPlans.saveManagedCombatPlan(name, content, true, currentFile);
      }
      if (!result.success) {
        throw new Error(result.error || "\u4FDD\u5B58\u5931\u8D25");
      }
      this.currentPlan.fileName = result.path ?? this.currentPlan.fileName;
      this.currentManagedPlanFile = result.file ?? `bettle-${name}.yaml`;
      this.currentPlanSource = result.source ?? "user";
      this.planPresetName = name;
      this.savedPlanSnapshot = this.planDraftSnapshot();
      this.renderPlanPreview();
      Logger_1.Logger.info(`\u51FA\u5F81\u89C4\u5212\u5DF2\u4FDD\u5B58: ${this.currentManagedPlanFile}`);
      (0, DialogHelper_1.showSaveSuccess)(copiedFromSystem ? `\u51FA\u5F81\u89C4\u5212\u300C${name}\u300D\u5DF2\u4FDD\u5B58\u4E3A\u7528\u6237\u914D\u7F6E` : `\u51FA\u5F81\u89C4\u5212\u300C${name}\u300D\u4FDD\u5B58\u6210\u529F`);
      return true;
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  importTaskPreset(preset, filePath, source = "user") {
    this.mapLoadVersion++;
    (0, presetFlow_1.importTaskPresetFlow)(preset, filePath, this.planView, this.host, this.presetState, source);
  }
  closePresetDetail() {
    (0, presetFlow_1.closePresetDetailFlow)(this.planView, this.presetState);
  }
  async executePreset() {
    let ships = [];
    if (this.currentPreset?.task_type === "decisive" && this.currentPresetSource !== "system") {
      if (!this.managedPlans?.getShipLibraryManifest) {
        await (0, DialogHelper_1.showAlert)("\u52A0\u5165\u961F\u5217\u5931\u8D25", "\u8230\u8239\u8D44\u6599\u5E93\u8BFB\u53D6\u63A5\u53E3\u4E0D\u53EF\u7528");
        return;
      }
      try {
        ships = (await this.managedPlans.getShipLibraryManifest()).ships;
      } catch (error) {
        await (0, DialogHelper_1.showAlert)("\u52A0\u5165\u961F\u5217\u5931\u8D25", error instanceof Error ? error.message : String(error));
        return;
      }
    }
    (0, presetFlow_1.executePresetFlow)(this.planView, this.host, this.presetState, ships);
  }
  renderPlanPreview() {
    if (!this.currentPlan) {
      this.planView.render(null);
      return;
    }
    const vo = (0, rendering_1.buildPlanPreviewVO)(this.currentPlan, this.currentMapData, this.eventMapCatalog, this.fleetPresetController.toViewObject(this.currentPlan.data.fleet_presets ?? []));
    this.planView.render(vo);
    this.planView.setPresetName(this.planPresetName);
    this.planView.showPlanView();
  }
  async ensureDefaultPlan() {
    this.refreshFleetPresetCatalog();
    if (this.currentPreset)
      return;
    if (this.currentPlan) {
      this.renderPlanPreview();
      return;
    }
    await this.changeMap("1", 1);
    this.savedPlanSnapshot = this.planDraftSnapshot();
  }
  async changeMap(chapterValue, map) {
    await this.ensureEventMapCatalog();
    const version = ++this.mapLoadVersion;
    const eventMatch = chapterValue.match(/^event:([^:]+):(E|H)$/);
    const eventName = eventMatch?.[1];
    const eventChapter = eventMatch?.[2];
    let chapter;
    let mapValue;
    let mapData;
    if (eventName && eventChapter) {
      chapter = eventChapter;
      mapValue = String(map).trim().toLowerCase();
      mapData = await (0, MapDataLoader_1.loadEventMapData)(eventName, chapter, mapValue);
    } else {
      chapter = Number(chapterValue);
      mapValue = Number(map);
      mapData = await (0, MapDataLoader_1.loadMapData)(Number(chapter), mapValue);
    }
    if (version !== this.mapLoadVersion)
      return;
    if (!mapData) {
      Logger_1.Logger.error(`\u5730\u56FE ${chapterValue}-${mapValue} \u6570\u636E\u4E0D\u5B58\u5728`);
      this.renderPlanPreview();
      return;
    }
    this.planView.resetNodeEditorDrafts();
    const selectedNodes = (0, selectedNodes_1.initialSelectedNodesForNewPlan)();
    if (!this.currentPlan) {
      this.currentPlan = PlanModel_1.PlanModel.create(chapter, mapValue, selectedNodes, eventName);
    } else {
      this.currentPlan.data.chapter = chapter;
      this.currentPlan.data.map = mapValue;
      this.currentPlan.data.mode = void 0;
      this.currentPlan.data.event = eventName;
      this.currentPlan.data.selected_nodes = selectedNodes;
      this.currentPlan.data.endpoint_nodes = void 0;
      this.currentPlan.data.result = void 0;
      this.currentPlan.data.node_args = {};
    }
    this.currentMapData = mapData;
    this.editingNodeId = null;
    this.planView.hideNodeEditor();
    this.renderPlanPreview();
    Logger_1.Logger.info(`\u5DF2\u5207\u6362\u5730\u56FE ${this.currentPlan.mapName}`);
  }
};
exports.PlanController = PlanController;