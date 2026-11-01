"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanManagementController = void 0;
var IpcAdapter_js_1 = require_IpcAdapter();
var PlanManagementView_js_1 = require_PlanManagementView();
var DialogHelper_js_1 = require_DialogHelper();
var planManagementViewObjects_js_1 = require_planManagementViewObjects();
var defaultDialogs = {
  alert: DialogHelper_js_1.showAlert,
  confirm: DialogHelper_js_1.showConfirm,
  prompt: DialogHelper_js_1.showPrompt,
  success: DialogHelper_js_1.showSaveSuccess
};
var PlanManagementController = class {
  constructor(repository = IpcAdapter_js_1.fleetPlannerRepository, view = new PlanManagementView_js_1.PlanManagementView(), dialogs = defaultDialogs) {
    this.repository = repository;
    this.dialogs = dialogs;
    this.data = null;
    this.taskGroups = () => [];
    this.openBattlePlanHandler = null;
    this.openTeamPlanHandler = null;
    this.view = view;
    this.view.onRefresh = () => this.load();
    this.view.onExportPlans = (selections) => this.exportPlans(selections);
    this.view.onExportLegacy143Plans = (selections) => this.exportLegacy143Plans(selections);
    this.view.onDeletePlans = (selections) => this.deletePlans(selections);
    this.view.onToggleUnlinked = (kind, source, file, ignored) => this.toggleUnlinked(kind, source, file, ignored);
    this.view.onRenameCombatPlan = (file) => this.renameCombatPlan(file);
    this.view.onDeleteCombatPlan = (file) => this.deleteCombatPlan(file);
    this.view.onDeleteTeamPlan = (file, name, warning) => this.deleteTeamPlan(file, name, warning);
    this.view.onOpenBattlePlan = (file, source) => this.openBattlePlanHandler?.(file, source) ?? Promise.resolve();
    this.view.onOpenTeamPlan = (file, source) => this.openTeamPlanHandler?.(file, source) ?? Promise.resolve();
  }
  set onOpenBattlePlan(handler) {
    this.openBattlePlanHandler = handler;
  }
  set onOpenTeamPlan(handler) {
    this.openTeamPlanHandler = handler;
  }
  setTaskGroupsProvider(provider) {
    this.taskGroups = provider;
  }
  async load() {
    this.view.showLoading();
    try {
      this.data = await this.repository.getPlanManagement();
      this.render();
    } catch (error) {
      this.view.showError(error instanceof Error ? error.message : String(error));
    }
  }
  render() {
    if (!this.data)
      return;
    this.view.render((0, planManagementViewObjects_js_1.buildPlanManagementViewObject)(this.data, this.taskGroups()));
  }
  async exportPlans(selections) {
    try {
      const result = await this.repository.exportUserPlans([...selections]);
      if (result.canceled)
        return;
      if (!result.success) {
        await this.dialogs.alert("\u5BFC\u51FA\u5931\u8D25", result.error || "\u672A\u77E5\u9519\u8BEF");
        return;
      }
      this.dialogs.success(`\u5DF2\u5BFC\u51FA ${result.count ?? selections.length} \u4E2A\u7528\u6237\u914D\u7F6E`);
    } catch (error) {
      await this.dialogs.alert("\u5BFC\u51FA\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
  async exportLegacy143Plans(selections) {
    try {
      const result = await this.repository.exportLegacy143Plans(selections.filter((selection) => selection.kind === "battle"));
      if (result.canceled)
        return;
      if (!result.success) {
        await this.dialogs.alert("\u964D\u7EA7\u5907\u4EFD\u5931\u8D25", result.error || "\u672A\u77E5\u9519\u8BEF");
        return;
      }
      this.dialogs.success(`\u5DF2\u4FDD\u5B58 ${result.count ?? 0} \u4E2A 1.4.3 \u517C\u5BB9\u51FA\u5F81\u8BA1\u5212`);
    } catch (error) {
      await this.dialogs.alert("\u964D\u7EA7\u5907\u4EFD\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
  async deletePlans(selections) {
    const battleCount = selections.filter((selection) => selection.kind === "battle").length;
    const teamCount = selections.length - battleCount;
    const confirmed = await this.dialogs.confirm("\u6279\u91CF\u5220\u9664\u7528\u6237\u914D\u7F6E", `\u5373\u5C06\u5220\u9664 ${selections.length} \u4E2A\u7528\u6237\u914D\u7F6E\uFF08\u51FA\u5F81\u8BA1\u5212 ${battleCount} \u4E2A\uFF0C\u8230\u961F\u65B9\u6848 ${teamCount} \u4E2A\uFF09\u3002
\u5F15\u7528\u8FD9\u4E9B\u914D\u7F6E\u7684\u4EFB\u52A1\u4E0D\u4F1A\u4E00\u5E76\u5220\u9664\uFF0C\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002\u662F\u5426\u7EE7\u7EED\uFF1F`);
    if (!confirmed)
      return;
    const failures = [];
    let deletedCount = 0;
    for (const selection of selections) {
      try {
        const result = selection.kind === "battle" ? await this.repository.deleteUserCombatPlan(selection.file) : await this.repository.deleteUserTeamPlan(selection.file);
        if (!result.success) {
          failures.push(`${selection.file}\uFF1A${result.error || "\u672A\u77E5\u9519\u8BEF"}`);
        } else {
          deletedCount += 1;
        }
      } catch (error) {
        failures.push(`${selection.file}\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await this.load();
    if (failures.length > 0) {
      await this.dialogs.alert("\u6279\u91CF\u5220\u9664\u672A\u5168\u90E8\u5B8C\u6210", `\u6210\u529F\u5220\u9664 ${deletedCount} \u4E2A\uFF0C\u5931\u8D25 ${failures.length} \u4E2A\u3002
` + failures.join("\n"));
    } else {
      this.dialogs.success(`\u5DF2\u5220\u9664 ${deletedCount} \u4E2A\u7528\u6237\u914D\u7F6E`);
    }
  }
  async toggleUnlinked(kind, source, file, ignored) {
    try {
      const values = await this.repository.setPlanUnlinkedIgnored(kind, source, file, ignored);
      if (this.data) {
        this.data = {
          ...this.data,
          ignoredUnlinkedPlans: [...values]
        };
        this.render();
      }
    } catch (error) {
      await this.dialogs.alert("\u64CD\u4F5C\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
  async renameCombatPlan(file) {
    const currentName = file.replace(/\.ya?ml$/i, "").replace(/^bettle-/i, "");
    const newName = await this.dialogs.prompt("\u91CD\u547D\u540D\u51FA\u5F81\u8BA1\u5212", "\u53EA\u4FEE\u6539\u7528\u6237\u8BA1\u5212\u6587\u4EF6\u540D\uFF0C\u4E0D\u4FEE\u6539 YAML \u7684\u540E\u7AEF\u5B57\u6BB5\u3002", currentName);
    if (newName === null || !newName.trim() || newName.trim() === currentName) {
      return;
    }
    try {
      const result = await this.repository.renameUserCombatPlan(file, newName.trim());
      if (!result.success) {
        await this.dialogs.alert("\u91CD\u547D\u540D\u5931\u8D25", result.error || "\u672A\u77E5\u9519\u8BEF");
        return;
      }
      await this.load();
    } catch (error) {
      await this.dialogs.alert("\u91CD\u547D\u540D\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
  async deleteCombatPlan(file) {
    const confirmed = await this.dialogs.confirm("\u5220\u9664\u51FA\u5F81\u8BA1\u5212", `\u786E\u5B9A\u5220\u9664\u7528\u6237\u8BA1\u5212 ${file} \u5417\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002`);
    if (!confirmed)
      return;
    try {
      const result = await this.repository.deleteUserCombatPlan(file);
      if (!result.success) {
        await this.dialogs.alert("\u5220\u9664\u5931\u8D25", result.error || "\u672A\u77E5\u9519\u8BEF");
        return;
      }
      await this.load();
    } catch (error) {
      await this.dialogs.alert("\u5220\u9664\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
  async deleteTeamPlan(file, name, warning) {
    const confirmed = await this.dialogs.confirm("\u5220\u9664\u8230\u961F\u65B9\u6848", `\u786E\u5B9A\u5220\u9664\u8230\u961F\u65B9\u6848 ${name || file} \u5417\uFF1F${warning}
\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002`);
    if (!confirmed)
      return;
    try {
      const result = await this.repository.deleteUserTeamPlan(file);
      if (!result.success) {
        await this.dialogs.alert("\u5220\u9664\u5931\u8D25", result.error || "\u672A\u77E5\u9519\u8BEF");
        return;
      }
      await this.load();
    } catch (error) {
      await this.dialogs.alert("\u5220\u9664\u5931\u8D25", error instanceof Error ? error.message : String(error));
    }
  }
};
exports.PlanManagementController = PlanManagementController;