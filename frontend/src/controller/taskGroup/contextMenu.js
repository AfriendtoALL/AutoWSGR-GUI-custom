"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContextMenuTarget = createContextMenuTarget;
exports.handleContextMenuEdit = handleContextMenuEdit;
exports.openItemForEdit = openItemForEdit;
var PlanModel_1 = require_PlanModel();
var MapDataLoader_1 = require_MapDataLoader();
var taskPreset_1 = require_taskPreset();
var Logger_1 = require_Logger();
var adapter_1 = require_adapter();
var IpcAdapter_1 = require_IpcAdapter();
function createContextMenuTarget(source, id) {
  return { source, id };
}
async function handleContextMenuEdit(target, taskGroupModel, host) {
  if (!target)
    return;
  if (target.source === "taskgroup") {
    const group = taskGroupModel.getActiveGroup();
    if (!group)
      return;
    const item = group.items[target.id];
    if (!item)
      return;
    if (item.kind === "template") {
      Logger_1.Logger.info(`\u6A21\u677F\u300C${item.label}\u300D\u8BF7\u5728\u6A21\u677F\u5E93\u4E2D\u67E5\u770B\u548C\u7F16\u8F91`);
      return;
    }
    if (item.kind === "daily") {
      Logger_1.Logger.info(item.dailyTaskType === "decisive" ? `\u51B3\u6218\u65E5\u5E38\u4EFB\u52A1\u300C${item.label}\u300D\u8BF7\u5728\u51B3\u6218\u8BA1\u5212\u9875\u9762\u7F16\u8F91` : `\u65E5\u5E38\u4EFB\u52A1\u300C${item.label}\u300D\u7531\u65E5\u5E38\u4EFB\u52A1\u6D6E\u7A97\u7BA1\u7406`);
      return;
    }
    if (item.managedSource && item.managedFile) {
      await host.openManagedPlan(item.managedFile, item.managedSource);
      return;
    }
    if (!item.path) {
      Logger_1.Logger.error(`\u300C${item.label}\u300D\u6CA1\u6709\u5173\u8054\u7684\u914D\u7F6E\u6587\u4EF6`);
      return;
    }
    await openItemForEdit(item.path, item.kind, host);
  } else {
    const taskId = target.id;
    const task = host.scheduler.findTask(taskId);
    if (!task)
      return;
    const req = task.request;
    let planId;
    if (req.type === "normal_fight" || req.type === "event_fight") {
      planId = req.plan_id ?? void 0;
    }
    if (planId) {
      await openItemForEdit(planId, "plan", host);
    } else {
      Logger_1.Logger.warn(`\u300C${task.name}\u300D\u6CA1\u6709\u5173\u8054\u7684\u65B9\u6848\u6587\u4EF6`);
    }
  }
}
async function openItemForEdit(filePath, kind, host, repository = (0, IpcAdapter_1.getPlansGateway)()) {
  if (!repository)
    return;
  try {
    const content = await repository.readFile(filePath);
    const parsed = (0, adapter_1.parseYamlRecord)(content, "\u4EFB\u52A1\u6587\u4EF6");
    if (kind === "preset" || taskPreset_1.taskPresetCodec.isStandalone(parsed)) {
      host.importTaskPreset(taskPreset_1.taskPresetCodec.normalize(parsed), filePath);
    } else {
      const plan = PlanModel_1.PlanModel.fromYaml(content, filePath);
      const { chapter, map } = plan.data;
      const mapData = plan.isEvent ? await (0, MapDataLoader_1.loadEventMapData)(plan.data.event ?? "", chapter, map) : await (0, MapDataLoader_1.loadMapData)(Number(chapter), Number(map));
      host.setCurrentPlan(plan, mapData);
      host.renderPlanPreview();
    }
    host.switchPage("plan");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger_1.Logger.error(`\u6253\u5F00\u7F16\u8F91\u5931\u8D25: ${msg}`);
  }
}