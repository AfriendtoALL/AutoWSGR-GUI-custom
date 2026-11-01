"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyTaskLoaderController = void 0;
var DialogHelper_1 = require_DialogHelper();
var IpcAdapter_1 = require_IpcAdapter();
var DailyTaskLoaderController = class {
  constructor(view, actions, repository = (0, IpcAdapter_1.getPlansGateway)()) {
    this.view = view;
    this.actions = actions;
    this.repository = repository;
    this.plans = [];
    this.activeType = "exercise";
    this.selectedPlan = null;
    this.drafts = /* @__PURE__ */ new Map();
  }
  bindActions() {
    this.view.bindActions({
      onClose: () => this.view.close(),
      onTabChange: (type) => this.changeTab(type),
      onSelect: (plan) => this.select(plan),
      onTimesChange: (plan, times) => {
        const draft = this.draft(plan);
        draft.times = Math.max(1, times);
        this.selectedPlan = plan;
        this.render();
      },
      onQuickRepairChange: (plan, useQuickRepair) => {
        const draft = this.draft(plan);
        draft.useQuickRepair = useQuickRepair;
        this.selectedPlan = plan;
        this.render();
      },
      onAddToList: () => this.addToList(),
      onAddToQueue: () => void this.addToQueue()
    });
  }
  open() {
    this.view.open();
    void this.refresh();
  }
  async refresh() {
    if (!this.repository?.listDailyPlans) {
      this.view.setStatus("\u8BF7\u5B8C\u6574\u91CD\u542F GUI \u540E\u518D\u64CD\u4F5C");
      return;
    }
    this.view.setStatus("\u6B63\u5728\u8BFB\u53D6\u65E5\u5E38\u4EFB\u52A1...");
    try {
      const result = await this.repository.listDailyPlans();
      this.plans = result.plans;
      this.plans.forEach((plan) => this.draft(plan));
      const visible = this.visiblePlans();
      const selectedPlan = this.selectedPlan;
      if (!selectedPlan || !this.plans.some((plan) => this.samePlan(plan, selectedPlan))) {
        this.selectedPlan = visible[0] ?? null;
      }
      this.view.setStatus(result.errors.length > 0 ? `${result.errors.length} \u4E2A\u65E5\u5E38\u4EFB\u52A1 YAML \u65E0\u6CD5\u8BFB\u53D6` : "");
      this.render();
    } catch (error) {
      this.plans = [];
      this.selectedPlan = null;
      this.view.setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      this.render();
    }
  }
  changeTab(type) {
    this.activeType = type;
    const visible = this.visiblePlans();
    if (!this.selectedPlan || this.selectedPlan.taskType !== type) {
      this.selectedPlan = visible[0] ?? null;
    }
    this.render();
  }
  select(plan) {
    this.selectedPlan = plan;
    this.render();
  }
  addToList() {
    const selection = this.selection();
    if (!selection)
      return;
    this.actions.addToList(selection);
    this.view.close();
  }
  async addToQueue() {
    const selection = this.selection();
    if (!selection)
      return;
    try {
      await this.actions.addToQueue(selection);
      this.view.close();
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u52A0\u5165\u6267\u884C\u961F\u5217\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
  selection() {
    if (!this.selectedPlan)
      return null;
    const draft = this.draft(this.selectedPlan);
    return {
      plan: this.selectedPlan,
      times: this.selectedPlan.taskType === "exercise" ? 1 : draft.times,
      useQuickRepair: this.selectedPlan.taskType === "decisive" ? draft.useQuickRepair : void 0
    };
  }
  draft(plan) {
    const key = this.planKey(plan);
    const existing = this.drafts.get(key);
    if (existing)
      return existing;
    const created = {
      times: Math.max(1, plan.times || 1),
      useQuickRepair: plan.useQuickRepair !== false
    };
    this.drafts.set(key, created);
    return created;
  }
  render() {
    this.view.render(this.plans, this.activeType, this.selection());
  }
  visiblePlans() {
    return this.plans.filter((plan) => plan.taskType === this.activeType);
  }
  samePlan(left, right) {
    return left.source === right.source && left.file === right.file;
  }
  planKey(plan) {
    return `${plan.source}/${plan.file}`;
  }
};
exports.DailyTaskLoaderController = DailyTaskLoaderController;