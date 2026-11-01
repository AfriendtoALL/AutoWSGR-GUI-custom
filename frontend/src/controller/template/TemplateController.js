"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateController = void 0;
var TemplateLibraryView_1 = require_TemplateLibraryView();
var TemplateWizardView_1 = require_TemplateWizardView();
var Logger_1 = require_Logger();
var wizard_1 = require_wizard();
var useTemplate_1 = require_useTemplate();
var selectors_1 = require_selectors();
var crud_1 = require_crud();
var adapter_1 = require_adapter();
var IpcAdapter_js_1 = require_IpcAdapter();
var TemplateController = class _TemplateController {
  constructor(templateModel, taskGroupModel, renderTaskGroup, plansDir, appRoot, repository = (0, IpcAdapter_js_1.getPlansGateway)()) {
    this.templateModel = templateModel;
    this.taskGroupModel = taskGroupModel;
    this.renderTaskGroup = renderTaskGroup;
    this.plansDir = plansDir;
    this.appRoot = appRoot;
    this.repository = repository;
    this.wizardPlanPathsRef = { value: [] };
    this.editingIdRef = { value: null };
    this.libraryView = new TemplateLibraryView_1.TemplateLibraryView();
    this.wizardView = new TemplateWizardView_1.TemplateWizardView();
  }
  // ════════════════════════════════════════
  // 公共接口
  // ════════════════════════════════════════
  bindActions() {
    this.libraryView.onCreate = () => {
      (0, wizard_1.showWizard)(this.wizardView, this.wizardPlanPathsRef, this.editingIdRef);
    };
    this.libraryView.onImport = () => {
      void (0, crud_1.importTemplatesFlow)(this.templateModel, this.wizardView, this.wizardPlanPathsRef, this.appRoot, () => this.renderLibrary(), this.repository);
    };
    this.wizardView.onPrevious = () => {
      (0, wizard_1.wizardNav)(-1, this.wizardView, () => this.doFinishWizard());
    };
    this.wizardView.onNext = () => {
      (0, wizard_1.wizardNav)(1, this.wizardView, () => this.doFinishWizard());
    };
    this.wizardView.onCancel = () => this.wizardView.hide();
    this.wizardView.onTypeChange = (type) => this.wizardView.setConfigPanel(type);
    this.wizardView.onBrowsePlan = () => void this.browsePlan();
    this.wizardView.onScanPlans = () => void this.scanPlans();
    this.wizardView.onRemovePlan = (index) => {
      if (index < this.wizardPlanPathsRef.value.length) {
        this.wizardPlanPathsRef.value.splice(index, 1);
        this.wizardView.renderPlanList(this.wizardPlanPathsRef.value);
      }
    };
    this.libraryView.onUse = (id) => this.doUseTemplate(id);
    this.libraryView.onEdit = (id) => (0, crud_1.editTemplate)(id, this.templateModel, this.wizardView, this.wizardPlanPathsRef, this.editingIdRef);
    this.libraryView.onDelete = (id) => (0, crud_1.deleteTemplate)(id, this.templateModel, () => this.renderLibrary());
    this.libraryView.onRename = (id) => (0, crud_1.renameTemplate)(id, this.templateModel, () => this.renderLibrary());
    this.renderLibrary();
  }
  renderLibrary() {
    const templates = this.templateModel.getAll().filter((tpl) => tpl.type !== "decisive");
    const items = templates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      type: tpl.type,
      typeLabel: _TemplateController.TEMPLATE_TYPE_LABELS[tpl.type] ?? tpl.type,
      planCount: tpl.planPaths?.length ?? (tpl.planPath ? 1 : 0),
      defaultTimes: tpl.defaultTimes ?? 0,
      description: tpl.description,
      isBuiltin: !!tpl.builtin
    }));
    this.libraryView.render(items);
  }
  async browsePlan() {
    if (!this.repository)
      return;
    const result = await this.repository.openFileDialog([{ name: "YAML \u65B9\u6848", extensions: ["yaml", "yml"] }], this.plansDir || void 0);
    if (!result)
      return;
    const filePath = result.path;
    if (!this.wizardPlanPathsRef.value.includes(filePath)) {
      this.wizardPlanPathsRef.value.push(filePath);
      this.wizardView.renderPlanList(this.wizardPlanPathsRef.value);
    }
    this.wizardView.setPlanPathInput(filePath);
    if (this.wizardPlanPathsRef.value.length !== 1)
      return;
    try {
      const parsed = adapter_1.yamlCodec.parse(result.content);
      if (!parsed || typeof parsed !== "object")
        return;
      if (typeof parsed.fleet_id === "number") {
        this.wizardView.setFleetId(parsed.fleet_id);
      }
      const presets = Array.isArray(parsed.fleet_presets) ? parsed.fleet_presets : [];
      const fixedShips = presets[0]?.ships.filter((ship) => typeof ship === "string") ?? [];
      if (fixedShips.length > 0) {
        this.wizardView.fillFleetGrid("nf", fixedShips);
      }
      const stopCondition = parsed.stop_condition;
      if (stopCondition?.loot_count_ge != null && stopCondition.loot_count_ge >= 0) {
        this.wizardView.setStopConditions(stopCondition.loot_count_ge, void 0);
      }
      if (stopCondition?.ship_count_ge != null && stopCondition.ship_count_ge >= 0) {
        this.wizardView.setStopConditions(void 0, stopCondition.ship_count_ge);
      }
      if (stopCondition?.level_ge != null && stopCondition.level_ge >= 1) {
        this.wizardView.setStopConditions(void 0, void 0, {
          slot: Number.isInteger(stopCondition.level_slot) ? stopCondition.level_slot : 0,
          ge: stopCondition.level_ge
        });
      }
      const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? "";
      if (fileName)
        this.wizardView.setName(fileName);
      if (typeof parsed.times === "number" && parsed.times > 0) {
        this.wizardView.setDefaultTimes(parsed.times);
      }
    } catch {
    }
  }
  async scanPlans() {
    if (!this.repository)
      return;
    const files = await this.repository.listPlanFiles();
    let added = 0;
    for (const file of files) {
      const fullPath = `${this.plansDir}\\${file.file}`;
      if (this.wizardPlanPathsRef.value.includes(fullPath))
        continue;
      this.wizardPlanPathsRef.value.push(fullPath);
      added += 1;
    }
    if (added > 0) {
      this.wizardView.renderPlanList(this.wizardPlanPathsRef.value);
      Logger_1.Logger.info(`\u626B\u63CF\u5230 ${files.length} \u4E2A\u65B9\u6848\u6587\u4EF6\uFF0C\u65B0\u589E ${added} \u4E2A`);
    }
  }
  // ════════════════════════════════════════
  // 内部代理
  // ════════════════════════════════════════
  async doFinishWizard() {
    await (0, wizard_1.finishWizard)(this.wizardView, this.templateModel, this.wizardPlanPathsRef.value, this.editingIdRef, () => this.renderLibrary());
  }
  async doUseTemplate(id) {
    const callbacks = {
      showPlanSelector: (tpl, paths, gn) => (0, selectors_1.showPlanSelector)(tpl, paths, gn, this.wizardView, this.taskGroupModel, this.renderTaskGroup, this.repository),
      showCampaignSelector: (tpl, gn) => (0, selectors_1.showCampaignSelector)(tpl, gn, this.wizardView, this.taskGroupModel, this.renderTaskGroup),
      showExerciseFleetSelector: (tpl, gn) => (0, selectors_1.showExerciseFleetSelector)(tpl, gn, this.wizardView, this.taskGroupModel, this.renderTaskGroup),
      showDecisiveChapterSelector: (tpl, gn) => (0, selectors_1.showDecisiveChapterSelector)(tpl, gn, this.wizardView, this.taskGroupModel, this.renderTaskGroup)
    };
    await (0, useTemplate_1.useTemplateFlow)(id, this.templateModel, this.taskGroupModel, this.renderTaskGroup, callbacks);
  }
};
exports.TemplateController = TemplateController;
TemplateController.TEMPLATE_TYPE_LABELS = {
  normal_fight: "\u666E\u901A\u51FA\u51FB",
  event_fight: "\u6D3B\u52A8\u51FA\u51FB",
  exercise: "\u6F14\u4E60",
  campaign: "\u6218\u5F79",
  decisive: "\u51B3\u6218"
};