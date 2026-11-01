"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskGroupController = void 0;
var DialogHelper_1 = require_DialogHelper();
var addItems_1 = require_addItems();
var queueLoader_1 = require_queueLoader();
var metaLoader_1 = require_metaLoader();
var TaskListLoaderController_1 = require_TaskListLoaderController();
var DailyTaskLoaderController_1 = require_DailyTaskLoaderController();
var DailyTaskLoaderView_1 = require_DailyTaskLoaderView();
var contextMenu_1 = require_contextMenu();
function toTaskGroupItemViewObject(item) {
  return {
    path: item.path,
    managedSource: item.managedSource,
    managedFile: item.managedFile,
    dailySource: item.dailySource,
    dailyFile: item.dailyFile,
    dailyTaskType: item.dailyTaskType,
    templateId: item.templateId,
    kind: item.kind,
    times: item.times,
    label: item.label
  };
}
var TaskGroupController = class {
  constructor(taskGroupModel, taskGroupView, templateModel, mainView, planView, host) {
    this.taskGroupModel = taskGroupModel;
    this.taskGroupView = taskGroupView;
    this.templateModel = templateModel;
    this.mainView = mainView;
    this.planView = planView;
    this.host = host;
    this.contextMenuTarget = null;
    this.taskListLoader = new TaskListLoaderController_1.TaskListLoaderController(this.taskGroupModel, () => this.render());
    this.dailyTaskLoader = new DailyTaskLoaderController_1.DailyTaskLoaderController(new DailyTaskLoaderView_1.DailyTaskLoaderView(), {
      addToList: (selection) => (0, addItems_1.addDailyPlanToGroup)(this.taskGroupModel, selection, () => this.render()),
      addToQueue: (selection) => (0, queueLoader_1.loadDailyPlanToQueue)(selection, this.host)
    });
  }
  bindActions() {
    this.dailyTaskLoader.bindActions();
    this.taskGroupView.onNewGroup = async () => {
      const baseName = "\u65B0\u4EFB\u52A1\u5217\u8868";
      let name = baseName;
      let suffix = 2;
      while (this.taskGroupModel.getGroup(name)) {
        name = `${baseName} ${suffix}`;
        suffix += 1;
      }
      this.taskGroupModel.upsertGroup(name);
      this.taskGroupModel.setActiveGroup(name);
      await this.taskGroupModel.save();
      this.render();
    };
    this.taskGroupView.onSaveGroup = async () => {
      const active = this.taskGroupModel.getActiveGroup();
      const name = this.taskGroupView.getGroupName();
      if (!name) {
        await (0, DialogHelper_1.showAlert)("\u63D0\u793A", "\u8BF7\u8F93\u5165\u4EFB\u52A1\u5217\u8868\u540D\u79F0\u3002");
        return;
      }
      if (!active) {
        this.taskGroupModel.upsertGroup(name);
        this.taskGroupModel.setActiveGroup(name);
      } else if (active.name !== name) {
        if (!this.taskGroupModel.renameGroup(active.name, name)) {
          await (0, DialogHelper_1.showAlert)("\u63D0\u793A", `\u540D\u79F0\u300C${name}\u300D\u5DF2\u88AB\u5360\u7528\u3002`);
          return;
        }
      }
      const saved = await this.taskGroupModel.save();
      if (!saved) {
        await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", "\u4EFB\u52A1\u5217\u8868\u672A\u80FD\u5199\u5165\u672C\u5730\u6587\u4EF6\u3002");
        return;
      }
      this.render();
      (0, DialogHelper_1.showSaveSuccess)(`\u4EFB\u52A1\u5217\u8868\u300C${name}\u300D\u4FDD\u5B58\u6210\u529F`);
    };
    this.taskGroupView.onOpenGroupLoader = () => {
      this.taskListLoader.open();
    };
    this.taskGroupView.onRemoveItem = (index) => {
      const active = this.taskGroupModel.getActiveGroup();
      if (!active)
        return;
      this.taskGroupModel.removeItem(active.name, index);
      this.taskGroupModel.save();
      this.render();
    };
    this.taskGroupView.onTimesChange = (index, times) => {
      const active = this.taskGroupModel.getActiveGroup();
      if (!active)
        return;
      this.taskGroupModel.updateItemTimes(active.name, index, times);
      this.taskGroupModel.save();
    };
    this.taskGroupView.onMoveItem = (from, to) => {
      const active = this.taskGroupModel.getActiveGroup();
      if (!active)
        return;
      this.taskGroupModel.moveItem(active.name, from, to);
      this.taskGroupModel.save();
      this.render();
    };
    this.taskGroupView.onLoadAll = () => (0, queueLoader_1.loadGroupToQueue)(this.taskGroupModel, this.templateModel, this.host);
    this.taskGroupView.onAddManagedPlan = async () => {
      const selection = await this.host.pickManagedBattlePlan();
      if (!selection)
        return;
      (0, addItems_1.addManagedPlanToGroup)(this.taskGroupModel, selection.plan, selection.fleetPresetIndex, () => this.render());
    };
    this.taskGroupView.onAddDailyPlan = () => {
      this.dailyTaskLoader.open();
    };
    this.taskGroupView.onDropToQueue = () => {
    };
    this.taskGroupView.onLoadItem = (index) => {
      void (0, queueLoader_1.loadSingleItemToQueue)(index, this.taskGroupModel, this.templateModel, this.host);
    };
    this.mainView.onDropFromTaskGroup = (index) => (0, queueLoader_1.loadSingleItemToQueue)(index, this.taskGroupModel, this.templateModel, this.host);
    this.taskGroupView.onEditItem = (index, x, y) => {
      this.contextMenuTarget = (0, contextMenu_1.createContextMenuTarget)("taskgroup", index);
      this.taskGroupView.showContextMenu(x, y);
    };
    this.mainView.onEditQueueItem = (taskId, x, y) => {
      this.contextMenuTarget = (0, contextMenu_1.createContextMenuTarget)("queue", taskId);
      this.taskGroupView.showContextMenu(x, y);
    };
    this.taskGroupView.onContextMenuEdit = () => {
      void (0, contextMenu_1.handleContextMenuEdit)(this.contextMenuTarget, this.taskGroupModel, this.host);
      this.contextMenuTarget = null;
    };
    this.planView.onAddCurrentPlanToGroup = () => {
      (0, addItems_1.addCurrentPlanToGroup)(this.taskGroupModel, () => this.host.getCurrentPlan(), this.host.plansDir, () => this.render()).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        void (0, DialogHelper_1.showAlert)("\u52A0\u5165\u4EFB\u52A1\u7EC4\u5931\u8D25", msg);
      });
    };
    this.planView.onClosePreset = () => this.host.closePresetDetail();
    this.planView.onExecutePreset = () => this.host.executePreset();
    this.planView.onAddPresetToGroup = () => (0, addItems_1.addPresetToGroup)(this.taskGroupModel, () => this.host.getCurrentPresetInfo(), this.planView.collectPresetFormValues().times, () => this.render());
  }
  render() {
    const groups = this.taskGroupModel.groups;
    const active = this.taskGroupModel.getActiveGroup();
    const items = active?.items ?? [];
    const itemViews = items.map(toTaskGroupItemViewObject);
    this.taskGroupView.render({
      groups: groups.map((g) => ({ name: g.name, itemCount: g.items.length })),
      activeGroupName: this.taskGroupModel.activeGroupName,
      items: itemViews
    });
    if (items.length > 0) {
      (0, metaLoader_1.loadItemMetas)(items, this.templateModel).then((metas) => {
        if (this.taskGroupModel.getActiveGroup()?.name !== active?.name)
          return;
        this.taskGroupView.render({
          groups: groups.map((g) => ({ name: g.name, itemCount: g.items.length })),
          activeGroupName: this.taskGroupModel.activeGroupName,
          items: itemViews,
          itemMetas: metas
        });
      });
    }
  }
};
exports.TaskGroupController = TaskGroupController;