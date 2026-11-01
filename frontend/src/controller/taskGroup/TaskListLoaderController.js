"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskListLoaderController = void 0;
var TaskListLoaderView_1 = require_TaskListLoaderView();
var DialogHelper_1 = require_DialogHelper();
var IpcAdapter_1 = require_IpcAdapter();
var TaskListLoaderController = class {
  constructor(model, onLoaded, repository = (0, IpcAdapter_1.getPlansGateway)(), view = new TaskListLoaderView_1.TaskListLoaderView()) {
    this.model = model;
    this.onLoaded = onLoaded;
    this.repository = repository;
    this.view = view;
    this.selectedGroupName = "";
    this.draftItems = [];
    this.managedPlans = [];
    this.view.bindActions({
      onClose: () => this.close(),
      onConfirm: () => void this.confirm(),
      onSelectGroup: (name) => this.selectGroup(name),
      onDeleteGroup: (name) => void this.deleteGroup(name),
      onMoveItem: (fromIndex, toIndex) => {
        this.moveDraftItem(fromIndex, toIndex);
      }
    });
  }
  open() {
    const groups = this.model.groups;
    const activeExists = groups.some((group) => group.name === this.model.activeGroupName);
    this.selectGroup(activeExists ? this.model.activeGroupName : groups[0]?.name ?? "");
    this.view.open();
    void this.refreshManagedPlans();
  }
  async refreshManagedPlans() {
    if (!this.repository?.getPlanManagement)
      return;
    try {
      const result = await this.repository.getPlanManagement();
      this.managedPlans = result.battlePlans;
      if (this.view.isOpen())
        this.render();
    } catch {
      this.managedPlans = [];
    }
  }
  close() {
    this.view.close();
  }
  selectGroup(name) {
    this.selectedGroupName = name;
    const group = name ? this.model.getGroup(name) : null;
    this.draftItems = group ? group.items.map((item) => ({ ...item })) : [];
    this.render();
  }
  render() {
    const viewObject = {
      groupCount: this.model.groups.length,
      selectedGroupName: this.selectedGroupName,
      groups: this.model.groups.map((group) => ({
        name: group.name,
        itemCount: group.items.length,
        selected: group.name === this.selectedGroupName
      })),
      items: this.draftItems.map((item) => this.toItemViewObject(item))
    };
    this.view.render(viewObject);
  }
  toItemViewObject(item) {
    return {
      label: item.label,
      fileName: item.managedFile ?? item.path?.split(/[\\/]/).pop() ?? item.templateId ?? "-",
      times: item.times,
      fleetPresetName: this.fleetPresetName(item),
      sourceClass: this.sourceClass(item),
      sourceLabel: this.sourceLabel(item)
    };
  }
  fleetPresetName(item) {
    if (item.kind !== "plan" || !item.managedSource || !item.managedFile) {
      return "";
    }
    const plan = this.managedPlans.find((candidate) => candidate.source === item.managedSource && candidate.file === item.managedFile);
    const presetIndex = item.fleetPresetIndex ?? 0;
    return plan?.fleets[presetIndex]?.name ?? "";
  }
  moveDraftItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= this.draftItems.length || toIndex < 0 || toIndex >= this.draftItems.length) {
      return;
    }
    const [item] = this.draftItems.splice(fromIndex, 1);
    this.draftItems.splice(toIndex, 0, item);
    this.render();
  }
  async deleteGroup(name) {
    const groupIndex = this.model.groups.findIndex((group) => group.name === name);
    if (!name || groupIndex < 0)
      return;
    const confirmed = await (0, DialogHelper_1.showConfirm)("\u786E\u8BA4\u5220\u9664\u4EFB\u52A1\u5217\u8868", `\u786E\u5B9A\u5220\u9664\u4EFB\u52A1\u5217\u8868\u300C${name}\u300D\uFF1F

\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\u3002`);
    if (!confirmed || !this.model.deleteGroup(name))
      return;
    await this.model.save();
    let nextGroupName = this.selectedGroupName;
    if (name === this.selectedGroupName) {
      const nextIndex = Math.min(groupIndex, this.model.groups.length - 1);
      nextGroupName = this.model.groups[nextIndex]?.name ?? "";
    }
    this.selectGroup(nextGroupName);
    this.onLoaded();
  }
  async confirm() {
    if (!this.selectedGroupName)
      return;
    this.model.upsertGroup(this.selectedGroupName, this.draftItems.map((item) => ({ ...item })));
    this.model.setActiveGroup(this.selectedGroupName);
    await this.model.save();
    this.onLoaded();
    this.close();
  }
  sourceClass(item) {
    if (item.kind === "daily")
      return "daily";
    if (item.managedSource === "system")
      return "system";
    if (item.managedSource === "user")
      return "user";
    if (item.kind === "template")
      return "template";
    return "local";
  }
  sourceLabel(item) {
    if (item.kind === "daily")
      return "\u65E5\u5E38\u4EFB\u52A1";
    if (item.managedSource === "system")
      return "\u7CFB\u7EDF\u9884\u8BBE";
    if (item.managedSource === "user")
      return "\u7528\u6237\u9884\u8BBE";
    if (item.kind === "template")
      return "\u4EFB\u52A1\u6A21\u677F";
    if (item.kind === "preset")
      return "\u4EFB\u52A1\u9884\u8BBE";
    return "\u672C\u5730\u6587\u4EF6";
  }
};
exports.TaskListLoaderController = TaskListLoaderController;