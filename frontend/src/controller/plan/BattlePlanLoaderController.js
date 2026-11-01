"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattlePlanLoaderController = void 0;
var lootPlans_js_1 = require_lootPlans();
var NormalFightDailyQuota_js_1 = require_NormalFightDailyQuota();
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
var IpcAdapter_1 = require_IpcAdapter();
var BattlePlanLoaderController = class {
  constructor(view, host, repository = (0, IpcAdapter_1.getPlansGateway)()) {
    this.view = view;
    this.host = host;
    this.repository = repository;
    this.plans = [];
    this.selectedPlan = null;
    this.selectedFleetIndex = null;
    this.automationDailyMax = 1;
    this.automationInitialTask = null;
    this.sortField = "modifiedAt";
    this.purpose = "editor";
    this.resolveSelection = null;
    this.lootPlanDraft = [];
    this.resolveLootPlans = null;
  }
  bindActions() {
    this.view.bindActions({
      onCancel: () => this.close(),
      onImportLocal: () => void this.importLocal(),
      onRefresh: () => void this.refresh(),
      onFiltersChange: () => this.render(),
      onSortFieldChange: (field) => {
        this.sortField = field;
        this.view.setSortField(field);
        this.render();
      },
      onSelectPlan: (file, source) => this.selectPlan(file, source),
      onSelectFleet: (index) => this.selectFleet(index),
      onAutomationDailyMaxChange: (value) => {
        this.automationDailyMax = (0, NormalFightDailyQuota_js_1.normalFightDailyLimit)(value);
        return this.automationDailyMax;
      },
      onAddLootPlan: (file, source) => this.addLootPlan(file, source),
      onDeleteLootPlan: (source, file) => {
        void this.deleteLootPlan(source, file);
      },
      onConfirm: () => void this.confirm()
    });
    this.view.setSortField(this.sortField);
  }
  openForEditor() {
    this.finishSelection(null);
    this.purpose = "editor";
    this.selectedFleetIndex = null;
    this.automationInitialTask = null;
    this.prepareAndOpen();
    return this.refresh().then(() => this.view.focusSearch());
  }
  pick(purpose, currentAutomationTask) {
    this.finishSelection(null);
    this.purpose = purpose;
    this.selectedFleetIndex = null;
    this.automationInitialTask = purpose === "automation" && currentAutomationTask ? structuredClone(currentAutomationTask) : null;
    this.automationDailyMax = (0, NormalFightDailyQuota_js_1.normalFightDailyLimit)(this.automationInitialTask?.times);
    this.prepareAndOpen();
    void this.refresh().then(() => this.view.focusSearch());
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
    });
  }
  pickLootPlans(currentPlans) {
    this.finishSelection(null);
    this.finishLootPlans(null);
    this.purpose = "loot-automation";
    this.selectedFleetIndex = null;
    this.automationInitialTask = null;
    this.lootPlanDraft = (0, lootPlans_js_1.normalizeLootAutomationPlans)(currentPlans, []);
    this.prepareAndOpen();
    void this.refresh().then(() => this.view.focusSearch());
    return new Promise((resolve) => {
      this.resolveLootPlans = resolve;
    });
  }
  prepareAndOpen() {
    this.view.setPurposeCopy(this.purpose);
    this.view.resetSearch();
    this.view.open();
  }
  close() {
    this.view.close();
    this.finishSelection(null);
    this.finishLootPlans(null);
    this.selectedFleetIndex = null;
    this.automationInitialTask = null;
    this.purpose = "editor";
    this.view.setPurposeCopy(this.purpose);
  }
  finishSelection(selection) {
    const resolve = this.resolveSelection;
    this.resolveSelection = null;
    resolve?.(selection);
  }
  finishLootPlans(plans) {
    const resolve = this.resolveLootPlans;
    this.resolveLootPlans = null;
    resolve?.(plans);
  }
  async importLocal() {
    if (!this.repository?.importLocalCombatPlan) {
      await (0, DialogHelper_1.showAlert)("\u5BFC\u5165\u5931\u8D25", "\u8BF7\u5B8C\u6574\u91CD\u542F GUI \u540E\u518D\u64CD\u4F5C");
      return;
    }
    this.view.setImportLoading(true);
    try {
      const result = await this.repository.importLocalCombatPlan();
      if (result.canceled)
        return;
      if (!result.success || !result.file) {
        throw new Error(result.error || "\u672C\u5730 YAML \u5BFC\u5165\u5931\u8D25");
      }
      await this.refresh();
      const imported = this.plans.find((plan) => plan.source === "user" && plan.file === result.file);
      if (imported)
        this.selectPlan(imported.file, imported.source);
      Logger_1.Logger.info(`\u672C\u5730\u51FA\u5F81\u8BA1\u5212\u5DF2\u5347\u7EA7\u5E76\u5BFC\u5165: ${result.file}`);
      (0, DialogHelper_1.showSaveSuccess)(result.kind === "preset" ? "\u5DF2\u6DFB\u52A0\u672C\u5730\u4EFB\u52A1\u9884\u8BBE" : `\u5DF2\u6DFB\u52A0\u672C\u5730 YAML\uFF0C\u5E76\u5347\u7EA7 ${result.teamFiles?.length ?? 0} \u652F\u5173\u8054\u7F16\u961F`);
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u5BFC\u5165\u5931\u8D25", error instanceof Error ? error.message : String(error));
    } finally {
      this.view.setImportLoading(false);
    }
  }
  async refresh() {
    if (!this.repository?.getPlanManagement) {
      this.view.setStatus("\u8BF7\u5B8C\u6574\u91CD\u542F GUI \u540E\u518D\u64CD\u4F5C");
      return;
    }
    this.view.setStatus("\u6B63\u5728\u8BFB\u53D6\u4F5C\u6218\u8BA1\u5212...");
    try {
      const result = await this.repository.getPlanManagement();
      const detailedPlans = result.battlePlans;
      const compatibilityMode = !Array.isArray(detailedPlans) || detailedPlans.some((plan) => !Array.isArray(plan.fleets) || typeof plan.fleetId !== "number");
      this.plans = compatibilityMode ? this.plansFromBindings(result.bindings, result.teamPlans) : detailedPlans;
      const visiblePlans = this.visiblePlans();
      const current = this.host.getCurrentPlanIdentity();
      const initialAutomationTask = this.automationInitialTask;
      const currentAutomationPlan = initialAutomationTask ? visiblePlans.find((plan) => this.matchesAutomationTask(plan, initialAutomationTask)) : null;
      this.selectedPlan = currentAutomationPlan ?? visiblePlans.find((plan) => Boolean(current.file) && plan.file === current.file && plan.source === current.source) ?? visiblePlans[0] ?? null;
      this.resetFleetSelection(this.selectedPlan);
      this.resetAutomationDailyMax(this.selectedPlan);
      this.view.setCount(this.plans.length);
      const errorCount = result.errors.filter((error) => error.kind === "battle").length;
      const message = compatibilityMode ? "\u5F53\u524D\u4E3B\u8FDB\u7A0B\u672A\u66F4\u65B0\uFF0C\u5DF2\u663E\u793A\u57FA\u7840\u5217\u8868\uFF1B\u5B8C\u6574\u91CD\u542F GUI \u540E\u663E\u793A\u8BA1\u5212\u6458\u8981" : errorCount > 0 ? `${errorCount} \u4E2A YAML \u65E0\u6CD5\u8BFB\u53D6\uFF0C\u5DF2\u4ECE\u5217\u8868\u4E2D\u6392\u9664` : "";
      this.view.setStatus(message);
      this.render();
    } catch (error) {
      this.plans = [];
      this.selectedPlan = null;
      this.selectedFleetIndex = null;
      this.view.setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      this.render();
    }
  }
  plansFromBindings(bindings, teamPlans) {
    const plans = /* @__PURE__ */ new Map();
    bindings.forEach((binding) => {
      const key = `${binding.source}/${binding.planFile}`;
      const existing = plans.get(key);
      if (existing) {
        if (binding.teamName) {
          existing.fleets.push(this.compatibilityFleetSummary(binding.teamName, binding.source, teamPlans));
          existing.fleetCount = existing.fleets.length;
        }
        return;
      }
      const fleets = binding.teamName ? [this.compatibilityFleetSummary(binding.teamName, binding.source, teamPlans)] : [];
      plans.set(key, {
        kind: "battle",
        file: binding.planFile,
        name: binding.planName,
        source: binding.source,
        modifiedAt: 0,
        chapter: "?",
        map: "?",
        times: 0,
        gap: 0,
        fleetId: 1,
        repairMode: 1,
        result: null,
        lootCountGe: -1,
        shipCountGe: -1,
        fleetCount: fleets.length,
        nodeCount: 0,
        fleets
      });
    });
    return [...plans.values()];
  }
  compatibilityFleetSummary(name, battleSource, teamPlans) {
    const matchingPlan = teamPlans.find((plan) => plan.name === name && plan.source === battleSource) ?? teamPlans.find((plan) => plan.name === name);
    return {
      name,
      source: matchingPlan?.source ?? "deleted",
      primaryCount: 0,
      backupCount: 0
    };
  }
  visiblePlans() {
    const filters = this.view.getFilters();
    const direction = filters.ascending ? 1 : -1;
    return this.plans.filter((plan) => this.purpose !== "automation" && this.purpose !== "loot-automation" || plan.kind === "battle").filter((plan) => !filters.excludeSystem || plan.source !== "system").filter((plan) => {
      if (!filters.keyword)
        return true;
      return [
        plan.name,
        plan.file,
        String(plan.chapter),
        String(plan.map),
        `${plan.chapter}-${plan.map}`,
        plan.taskType ?? "",
        plan.campaignName ?? ""
      ].some((value) => value.toLocaleLowerCase("zh-CN").includes(filters.keyword));
    }).sort((left, right) => {
      const result = this.sortField === "name" ? left.name.localeCompare(right.name, "zh-CN") : left.modifiedAt - right.modifiedAt;
      return (result || left.name.localeCompare(right.name, "zh-CN")) * direction;
    });
  }
  render() {
    const visiblePlans = this.visiblePlans();
    const previousSelection = this.selectedPlan;
    if (!this.selectedPlan || !visiblePlans.some((plan) => this.samePlan(plan, this.selectedPlan))) {
      this.selectedPlan = visiblePlans[0] ?? null;
    }
    if (!this.samePlan(this.selectedPlan, previousSelection)) {
      this.resetFleetSelection(this.selectedPlan);
      this.resetAutomationDailyMax(this.selectedPlan);
    }
    const fleetSelectionEnabled = this.isPickingWithFleet();
    const requiresFleetSelection = this.selectedPlan ? this.requiresFleetSelection(this.selectedPlan) : false;
    this.view.render({
      plans: visiblePlans,
      totalPlanCount: this.plans.length,
      selectedPlan: this.selectedPlan,
      selectedFleetIndex: this.selectedFleetIndex,
      purpose: this.purpose,
      lootPlans: this.lootPlanDraft,
      automationDailyMax: this.automationDailyMax,
      fleetSelectionEnabled,
      confirmEnabled: this.purpose === "loot-automation" || this.selectedPlan !== null && (!requiresFleetSelection || this.selectedFleetIndex !== null)
    });
  }
  selectPlan(file, source) {
    const selected = this.plans.find((plan) => plan.file === file && plan.source === source);
    if (!selected)
      return;
    if (!this.samePlan(selected, this.selectedPlan)) {
      this.resetFleetSelection(selected);
      this.resetAutomationDailyMax(selected);
    }
    this.selectedPlan = selected;
    this.render();
  }
  resetFleetSelection(plan) {
    this.selectedFleetIndex = this.isPickingWithFleet() && plan?.kind === "battle" && plan.fleets.length === 1 ? 0 : null;
  }
  resetAutomationDailyMax(plan) {
    if (this.purpose !== "automation")
      return;
    const initialLimit = plan && this.automationInitialTask && this.matchesAutomationTask(plan, this.automationInitialTask) ? this.automationInitialTask.times : plan?.times;
    this.automationDailyMax = (0, NormalFightDailyQuota_js_1.normalFightDailyLimit)(initialLimit);
  }
  matchesAutomationTask(plan, task) {
    if (task.source && task.source !== plan.source)
      return false;
    const taskPath = task.name.trim().replace(/\\/g, "/").toLocaleLowerCase();
    const planFile = plan.file.trim().replace(/\\/g, "/").toLocaleLowerCase();
    return taskPath === planFile || !task.source && taskPath.endsWith(`/${planFile}`);
  }
  selectFleet(index) {
    if (!this.isPickingWithFleet() || !this.selectedPlan?.fleets[index]) {
      return;
    }
    this.selectedFleetIndex = index;
    this.render();
  }
  addLootPlan(file, source) {
    if (this.purpose !== "loot-automation")
      return;
    const plan = this.plans.find((item) => item.kind === "battle" && item.file === file && item.source === source);
    if (!plan)
      return;
    const next = {
      source: plan.source,
      file: plan.file,
      name: plan.name
    };
    const key = (0, lootPlans_js_1.lootAutomationPlanKey)(next);
    if (this.lootPlanDraft.some((item) => (0, lootPlans_js_1.lootAutomationPlanKey)(item) === key)) {
      return;
    }
    this.lootPlanDraft.push(next);
    this.render();
  }
  async deleteLootPlan(source, file) {
    if (this.purpose !== "loot-automation")
      return;
    const target = this.lootPlanDraft.find((plan) => plan.source === source && plan.file === file);
    if (!target)
      return;
    const confirmed = await (0, DialogHelper_1.showConfirm)("\u5220\u9664\u81EA\u52A8\u80D6\u6B21\u8BA1\u5212", `\u786E\u5B9A\u4ECE\u81EA\u52A8\u80D6\u6B21\u4E0B\u62C9\u5217\u8868\u4E2D\u5220\u9664\u300C${target.name}\u300D\u5417\uFF1F`);
    if (!confirmed)
      return;
    this.lootPlanDraft = this.lootPlanDraft.filter((plan) => plan.source !== source || plan.file !== file);
    this.render();
  }
  async confirm() {
    if (this.purpose === "loot-automation") {
      this.finishLootPlans(structuredClone(this.lootPlanDraft));
      this.close();
      return;
    }
    if (!this.selectedPlan)
      return;
    if (this.isPickingWithFleet()) {
      if (this.requiresFleetSelection(this.selectedPlan) && this.selectedFleetIndex === null) {
        return;
      }
      this.finishSelection({
        plan: this.selectedPlan,
        ...this.selectedFleetIndex === null ? {} : { fleetPresetIndex: this.selectedFleetIndex },
        ...this.purpose === "automation" ? { dailyMaxExecutions: this.automationDailyMax } : {}
      });
      this.close();
      return;
    }
    const { file, source } = this.selectedPlan;
    const loaded = await this.host.openManagedPlan(file, source);
    if (loaded)
      this.close();
  }
  isPickingWithFleet() {
    return this.purpose === "queue" || this.purpose === "task-list" || this.purpose === "automation";
  }
  requiresFleetSelection(plan) {
    if (plan.kind === "preset")
      return false;
    return this.isPickingWithFleet() && plan.fleets.length > 0;
  }
  samePlan(left, right) {
    return Boolean(left && right && left.file === right.file && left.source === right.source);
  }
};
exports.BattlePlanLoaderController = BattlePlanLoaderController;