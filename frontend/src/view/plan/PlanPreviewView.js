"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanPreviewView = void 0;
var MapView_1 = require_MapView();
var NodeEditorView_1 = require_NodeEditorView();
var FleetPresetView_1 = require_FleetPresetView();
var MAP_COUNT_BY_CHAPTER = {
  "1": 5,
  "2": 6,
  "3": 4,
  "4": 4,
  "5": 5,
  "6": 4,
  "7": 5,
  "8": 5,
  "9": 5,
  "10": 1
};
var PlanPreviewView = class {
  set onAddFleetPreset(fn) {
    this.fleetPresetView.onAddFleetPreset = fn;
  }
  set onRemoveFleetPreset(fn) {
    this.fleetPresetView.onRemoveFleetPreset = fn;
  }
  set onCloseNodeEditor(fn) {
    this.nodeEditor.onClose = fn;
  }
  set onSaveNodeEditor(fn) {
    this.nodeEditor.onSave = fn;
  }
  constructor() {
    this.eventMapCatalog = [];
    this.detailEl = document.getElementById("plan-detail");
    this.chapterSelect = document.getElementById("plan-edit-chapter");
    this.mapSelect = document.getElementById("plan-edit-map");
    this.presetNameInput = document.getElementById("plan-preset-name");
    this.repairSelect = document.getElementById("plan-edit-repair");
    this.fightCondSelect = document.getElementById("plan-edit-fight-cond");
    this.fleetSelect = document.getElementById("plan-edit-fleet");
    this.timesInput = document.getElementById("plan-edit-times");
    this.gapInput = document.getElementById("plan-edit-gap");
    this.lootEnabledInput = document.getElementById("plan-edit-loot-enabled");
    this.lootGeInput = document.getElementById("plan-edit-loot-ge");
    this.lootFieldsEl = document.getElementById("plan-edit-loot-fields");
    this.shipEnabledInput = document.getElementById("plan-edit-ship-enabled");
    this.shipGeInput = document.getElementById("plan-edit-ship-ge");
    this.shipFieldsEl = document.getElementById("plan-edit-ship-fields");
    this.levelEnabledInput = document.getElementById("plan-edit-level-enabled");
    this.levelSlotSelect = document.getElementById("plan-edit-level-slot");
    this.levelGeInput = document.getElementById("plan-edit-level-ge");
    this.levelFieldsEl = document.getElementById("plan-edit-level-fields");
    this.levelHintEl = document.getElementById("plan-edit-level-hint");
    this.mapView = new MapView_1.MapView();
    this.nodeEditor = new NodeEditorView_1.NodeEditorView();
    this.fleetPresetView = new FleetPresetView_1.FleetPresetView();
    document.getElementById("btn-new-battle-plan")?.addEventListener("click", () => this.onNewPlan?.());
    document.getElementById("btn-load-battle-plan")?.addEventListener("click", () => this.onLoadPlan?.());
    document.getElementById("btn-save-plan")?.addEventListener("click", () => this.onSavePlan?.());
    document.getElementById("btn-add-to-group")?.addEventListener("click", () => this.onAddCurrentPlanToGroup?.());
    document.getElementById("btn-close-preset")?.addEventListener("click", () => this.onClosePreset?.());
    document.getElementById("btn-tp-add-queue")?.addEventListener("click", () => this.onExecutePreset?.());
    document.getElementById("btn-tp-add-group")?.addEventListener("click", () => this.onAddPresetToGroup?.());
    const exerciseFleetToggle = document.getElementById("tp-fleet-enable-ex");
    exerciseFleetToggle?.addEventListener("change", () => {
      const grid = document.getElementById("tp-fleet-grid-ex");
      if (grid) {
        grid.style.display = exerciseFleetToggle.checked ? "" : "none";
      }
    });
    this.mapView.onNodeClick = (nodeId) => this.onNodeClick?.(nodeId);
    this.chapterSelect.addEventListener("change", () => {
      this.updateMapOptions(this.chapterSelect.value);
      this.emitMapChange();
    });
    this.mapSelect.addEventListener("change", () => {
      this.emitMapChange();
    });
    this.presetNameInput.addEventListener("input", () => {
      this.onPresetNameChange?.(this.presetNameInput.value);
    });
    this.repairSelect.addEventListener("change", () => {
      this.onPlanFieldChange?.("repair_mode", Number(this.repairSelect.value));
    });
    this.fightCondSelect.addEventListener("change", () => {
      this.onPlanFieldChange?.("fight_condition", Number(this.fightCondSelect.value));
    });
    this.fleetSelect.addEventListener("change", () => {
      this.onPlanFieldChange?.("fleet_id", Number(this.fleetSelect.value));
    });
    this.timesInput.addEventListener("change", () => {
      const v = parseInt(this.timesInput.value, 10);
      this.onPlanFieldChange?.("times", v > 0 ? v : 1);
    });
    this.gapInput.addEventListener("change", () => {
      const v = parseInt(this.gapInput.value, 10);
      this.onPlanFieldChange?.("gap", v >= 0 ? v : 0);
    });
    this.bindStopConditionControl(this.lootEnabledInput, this.lootGeInput, this.lootFieldsEl, "loot_count_ge", 50);
    this.bindStopConditionControl(this.shipEnabledInput, this.shipGeInput, this.shipFieldsEl, "ship_count_ge", 500);
    this.bindLevelStopControl();
  }
  /* ── 渲染 ── */
  render(vo) {
    if (!vo) {
      this.detailEl.style.display = "none";
      return;
    }
    this.detailEl.style.display = "flex";
    this.renderMapSelection(vo);
    this.repairSelect.value = String(vo.repairModeValue);
    this.fightCondSelect.value = String(vo.fightConditionValue);
    this.fleetSelect.value = String(vo.fleetId);
    this.timesInput.value = String(vo.times ?? 1);
    this.gapInput.value = String(vo.gap ?? 0);
    this.renderStopConditionControl(this.lootEnabledInput, this.lootGeInput, this.lootFieldsEl, vo.lootCountGe, 50);
    this.renderStopConditionControl(this.shipEnabledInput, this.shipGeInput, this.shipFieldsEl, vo.shipCountGe, 500);
    this.renderLevelStopControl(vo);
    this.fleetPresetView.render(vo.fleetPresetSelector);
    this.mapView.renderNodes(vo.allNodes, vo.selectedNodes, vo.edges, vo.mapAspectRatio);
  }
  bindStopConditionControl(enabledInput, valueInput, fieldsEl, field, max) {
    enabledInput.addEventListener("change", () => {
      fieldsEl.hidden = !enabledInput.checked;
      valueInput.disabled = !enabledInput.checked;
      if (!enabledInput.checked) {
        this.onPlanFieldChange?.(field, void 0);
        return;
      }
      const value = this.clampStopConditionValue(valueInput.value, max);
      valueInput.value = String(value);
      this.onPlanFieldChange?.(field, value);
    });
    valueInput.addEventListener("change", () => {
      if (!enabledInput.checked)
        return;
      const value = this.clampStopConditionValue(valueInput.value, max);
      valueInput.value = String(value);
      this.onPlanFieldChange?.(field, value);
    });
  }
  renderStopConditionControl(enabledInput, valueInput, fieldsEl, value, max) {
    const enabled = value !== void 0 && value >= 1;
    enabledInput.checked = enabled;
    fieldsEl.hidden = !enabled;
    valueInput.disabled = !enabled;
    valueInput.value = String(enabled ? this.clampStopConditionValue(String(value), max) : 1);
  }
  clampStopConditionValue(value, max) {
    const parsed = parseInt(value, 10);
    return Math.min(max, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
  }
  /** 等级停止条件：开关 + 监控槽位 + 目标等级，复用战利品/掉落的结构。 */
  bindLevelStopControl() {
    const emit = () => {
      const slot = parseInt(this.levelSlotSelect.value, 10);
      const ge = this.clampStopConditionValue(this.levelGeInput.value, 125);
      this.levelGeInput.value = String(ge);
      this.onPlanFieldChange?.("level_slot", Number.isFinite(slot) ? slot : 0);
      this.onPlanFieldChange?.("level_ge", ge);
    };
    const setVisible = (enabled) => {
      this.levelFieldsEl.hidden = !enabled;
      if (this.levelHintEl)
        this.levelHintEl.style.display = enabled ? "block" : "none";
      this.levelSlotSelect.disabled = !enabled;
      this.levelGeInput.disabled = !enabled;
    };
    this.levelEnabledInput.addEventListener("change", () => {
      setVisible(this.levelEnabledInput.checked);
      if (!this.levelEnabledInput.checked) {
        this.onPlanFieldChange?.("level_ge", void 0);
        this.onPlanFieldChange?.("level_slot", void 0);
        return;
      }
      emit();
    });
    this.levelSlotSelect.addEventListener("change", () => {
      if (this.levelEnabledInput.checked)
        emit();
    });
    this.levelGeInput.addEventListener("change", () => {
      if (this.levelEnabledInput.checked)
        emit();
    });
  }
  renderLevelStopControl(vo) {
    const enabled = Number.isInteger(vo.levelGe) && vo.levelGe >= 1;
    this.levelEnabledInput.checked = enabled;
    this.levelFieldsEl.hidden = !enabled;
    if (this.levelHintEl)
      this.levelHintEl.style.display = enabled ? "block" : "none";
    this.levelSlotSelect.disabled = !enabled;
    this.levelGeInput.disabled = !enabled;
    this.levelSlotSelect.value = String(Number.isInteger(vo.levelSlot) ? vo.levelSlot : 0);
    this.levelGeInput.value = String(enabled ? this.clampStopConditionValue(String(vo.levelGe), 125) : 80);
  }
  getPresetName() {
    return this.presetNameInput.value.trim();
  }
  setPresetName(name) {
    this.presetNameInput.value = name;
  }
  focusPresetName() {
    this.presetNameInput.focus();
  }
  eventChapterValue(event, chapter) {
    return `event:${event}:${chapter}`;
  }
  parseEventChapter(value) {
    const match = value.match(/^event:([^:]+):(E|H)$/);
    if (!match)
      return null;
    return {
      event: match[1],
      chapter: match[2] === "E" ? "E" : "H"
    };
  }
  eventMapsFor(chapterValue) {
    const selection = this.parseEventChapter(chapterValue);
    if (!selection)
      return [];
    const event = this.eventMapCatalog.find((entry) => entry.event === selection.event);
    return event?.chapters[selection.chapter] ?? [];
  }
  emitMapChange() {
    if (this.mapSelect.disabled || !this.mapSelect.value)
      return;
    const chapter = this.chapterSelect.value;
    const map = this.parseEventChapter(chapter) ? this.mapSelect.value : Number(this.mapSelect.value);
    this.onMapChange?.(chapter, map);
  }
  eventMapLabel(map) {
    const match = map.match(/^(\d+)([ab])$/);
    if (!match)
      return map;
    return `${match[1]} ${match[2] === "a" ? "\u03B1" : "\u03B2"}`;
  }
  renderEventChapterOptions(vo) {
    this.chapterSelect.querySelectorAll("option[data-event-map]").forEach((option) => option.remove());
    const entries = [...this.eventMapCatalog];
    if (vo.event && !entries.some((entry) => entry.event === vo.event)) {
      const chapter = String(vo.chapter).toUpperCase();
      entries.push({
        event: vo.event,
        chapters: {
          E: chapter === "E" ? [String(vo.map)] : [],
          H: chapter === "H" ? [String(vo.map)] : []
        }
      });
    }
    for (const entry of entries) {
      const chapters = ["E", "H"];
      for (const chapter of chapters) {
        if (entry.chapters[chapter].length === 0)
          continue;
        const option = document.createElement("option");
        option.value = this.eventChapterValue(entry.event, chapter);
        option.textContent = `${entry.event} ${chapter}`;
        option.title = `\u6D3B\u52A8 ${entry.event} ${chapter === "E" ? "\u7B80\u5355" : "\u56F0\u96BE"}`;
        option.dataset.eventMap = "true";
        this.chapterSelect.appendChild(option);
      }
    }
  }
  updateMapOptions(chapter, selectedMap) {
    const eventMaps = this.eventMapsFor(chapter);
    if (this.parseEventChapter(chapter)) {
      const selected2 = selectedMap === void 0 ? eventMaps[0] ?? "" : String(selectedMap);
      const maps = !selected2 || eventMaps.includes(selected2) ? eventMaps : [...eventMaps, selected2];
      this.mapSelect.replaceChildren(...maps.map((map) => {
        const option = document.createElement("option");
        option.value = map;
        option.textContent = this.eventMapLabel(map);
        return option;
      }));
      this.mapSelect.value = selected2;
      this.mapSelect.disabled = maps.length === 0;
      return;
    }
    const count = MAP_COUNT_BY_CHAPTER[chapter] ?? 1;
    this.mapSelect.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = String(index + 1);
      return option;
    }));
    const selected = Number(selectedMap ?? 1);
    this.mapSelect.value = String(Math.min(Math.max(Number.isFinite(selected) ? selected : 1, 1), count));
    this.mapSelect.disabled = false;
  }
  renderMapSelection(vo) {
    this.eventMapCatalog = vo.eventMaps;
    this.renderEventChapterOptions(vo);
    const activityChapter = String(vo.chapter).toUpperCase();
    if (vo.event && (activityChapter === "E" || activityChapter === "H")) {
      const chapter2 = activityChapter === "E" ? "E" : "H";
      const chapterValue = this.eventChapterValue(vo.event, chapter2);
      this.chapterSelect.value = chapterValue;
      this.updateMapOptions(chapterValue, vo.map);
      return;
    }
    const chapter = String(vo.chapter);
    if (chapter in MAP_COUNT_BY_CHAPTER) {
      this.chapterSelect.value = chapter;
      this.updateMapOptions(chapter, vo.map);
      return;
    }
    this.chapterSelect.value = "1";
    this.updateMapOptions("1", 1);
    this.mapSelect.disabled = true;
  }
  /* ── 节点编辑（委托 + 跨视图协调） ── */
  showNodeEditor(nodeId, nodeType, args, mapNight = false) {
    this.fleetPresetView.hideSelector();
    this.nodeEditor.show(nodeId, nodeType, args, mapNight);
  }
  hideNodeEditor() {
    this.nodeEditor.hide();
    this.mapView.clearSelection();
  }
  resetNodeEditorDrafts() {
    this.nodeEditor.resetDrafts();
  }
  collectNodeEditorValues() {
    return this.nodeEditor.collectValues();
  }
  /* ── 编队预设 ── */
  renderFleetPresetSelector(viewObject) {
    this.fleetPresetView.render(viewObject);
  }
  /* ── 预设详情面板 ── */
  showPresetDetail() {
    const presetEl = document.getElementById("task-preset-detail");
    if (this.detailEl)
      this.detailEl.style.display = "none";
    const tplCard = document.getElementById("template-library-card");
    if (tplCard)
      tplCard.style.display = "none";
    if (presetEl)
      presetEl.style.display = "";
  }
  hidePresetDetail() {
    const presetEl = document.getElementById("task-preset-detail");
    if (presetEl)
      presetEl.style.display = "none";
    const tplCard = document.getElementById("template-library-card");
    if (tplCard)
      tplCard.style.display = "";
  }
  fillPresetDetailForm(vo) {
    document.getElementById("tp-name").textContent = vo.name;
    document.getElementById("tp-type-badge").textContent = vo.typeLabel;
    for (const id of ["tp-cfg-exercise", "tp-cfg-campaign", "tp-cfg-decisive", "tp-cfg-fight"]) {
      const el = document.getElementById(id);
      if (el)
        el.style.display = "none";
    }
    switch (vo.taskType) {
      case "exercise": {
        document.getElementById("tp-cfg-exercise").style.display = "";
        document.getElementById("tp-exercise-fleet").value = String(vo.exerciseFleetId ?? 1);
        const cb = document.getElementById("tp-fleet-enable-ex");
        cb.checked = false;
        document.getElementById("tp-fleet-grid-ex").style.display = "none";
        document.querySelectorAll(".tp-ship-ex").forEach((inp) => {
          inp.value = "";
        });
        break;
      }
      case "campaign":
        document.getElementById("tp-cfg-campaign").style.display = "";
        document.getElementById("tp-campaign-name").value = vo.campaignName ?? "\u56F0\u96BE\u6F5C\u8247";
        break;
      case "decisive":
        document.getElementById("tp-cfg-decisive").style.display = "";
        document.getElementById("tp-decisive-chapter").value = String(vo.chapter ?? 6);
        document.getElementById("tp-decisive-level1").value = (vo.level1 ?? []).join("\n");
        document.getElementById("tp-decisive-level2").value = (vo.level2 ?? []).join("\n");
        document.getElementById("tp-decisive-flagship").value = (vo.flagshipPriority ?? []).join("\n");
        document.getElementById("tp-decisive-quick-repair").checked = vo.useQuickRepair !== false;
        break;
      case "normal_fight":
      case "event_fight":
        document.getElementById("tp-cfg-fight").style.display = "";
        document.getElementById("tp-fight-plan").value = vo.planId ?? "";
        document.getElementById("tp-fight-fleet").value = String(vo.fleetId ?? 1);
        break;
    }
    const timesGroup = document.getElementById("tp-times-group");
    const timesEl = document.getElementById("tp-times");
    if (vo.taskType === "exercise") {
      timesGroup.style.display = "none";
    } else {
      timesGroup.style.display = "";
      timesEl.value = String(vo.times ?? 1);
      timesEl.disabled = false;
    }
  }
  collectPresetFormValues() {
    const parseLines = (id) => document.getElementById(id).value.split("\n").map((s) => s.trim()).filter(Boolean);
    return {
      times: Math.max(1, parseInt(document.getElementById("tp-times").value, 10) || 1),
      exerciseFleetId: parseInt(document.getElementById("tp-exercise-fleet").value),
      campaignName: document.getElementById("tp-campaign-name").value,
      chapter: parseInt(document.getElementById("tp-decisive-chapter").value),
      level1: parseLines("tp-decisive-level1"),
      level2: parseLines("tp-decisive-level2"),
      flagshipPriority: parseLines("tp-decisive-flagship"),
      useQuickRepair: document.getElementById("tp-decisive-quick-repair").checked,
      planId: document.getElementById("tp-fight-plan").value || void 0,
      fightFleetId: parseInt(document.getElementById("tp-fight-fleet").value)
    };
  }
  /* ── 视图切换 ── */
  showPlanView() {
    const tplCard = document.getElementById("template-library-card");
    const presetEl = document.getElementById("task-preset-detail");
    if (tplCard)
      tplCard.style.display = "none";
    if (presetEl)
      presetEl.style.display = "none";
  }
};
exports.PlanPreviewView = PlanPreviewView;