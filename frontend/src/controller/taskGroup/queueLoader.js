"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPlanNodeOverrides = applyPlanNodeOverrides;
exports.buildPlanQueueRequest = buildPlanQueueRequest;
exports.loadManagedPlanToQueue = loadManagedPlanToQueue;
exports.loadDailyPlanToQueue = loadDailyPlanToQueue;
exports.loadGroupToQueue = loadGroupToQueue;
exports.loadTemplateToQueue = loadTemplateToQueue;
exports.loadSingleItemToQueue = loadSingleItemToQueue;
var PlanModel_1 = require_PlanModel();
var scheduler_1 = require_scheduler2();
var ShipMatcher_1 = require_ShipMatcher();
var FleetRuleMapper_1 = require_FleetRuleMapper();
var shipNameNormalizer_1 = require_shipNameNormalizer();
var taskPreset_1 = require_taskPreset();
var Logger_1 = require_Logger();
var selectedNodes_1 = require_selectedNodes();
var managedPlanReader_1 = require_managedPlanReader();
var adapter_1 = require_adapter();
var IpcAdapter_1 = require_IpcAdapter();
function applyPlanNodeOverrides(req, plan) {
  req.plan = req.plan ?? {};
  const selectedNodes = (0, selectedNodes_1.normalizeSelectedNodesForBackend)(plan.data.selected_nodes);
  (0, selectedNodes_1.assertPlanRouteReadyForExecution)(selectedNodes);
  req.plan.selected_nodes = selectedNodes;
  req.plan.node_defaults = structuredClone(plan.data.node_defaults ?? {});
  req.plan.node_args = plan.getNodeArgsForExecution();
  const repairMode = plan.repairMode;
  req.plan.repair_mode = Array.isArray(repairMode) ? [...repairMode] : [repairMode];
}
function buildPlanQueueRequest(item, plan, planId, shipNameAliases = {}) {
  const req = {
    type: plan.isEvent ? "event_fight" : "normal_fight",
    plan_id: planId,
    times: 1,
    gap: plan.data.gap ?? 0
  };
  applyPlanNodeOverrides(req, plan);
  const selectedFleetId = item.fleet_id ?? plan.data.fleet_id;
  if (selectedFleetId != null) {
    if (req.type === "event_fight")
      req.fleet_id = selectedFleetId;
    req.plan = req.plan ?? {};
    req.plan.fleet_id = selectedFleetId;
  }
  const presets = plan.data.fleet_presets;
  if (presets?.length) {
    const presetIndex = item.fleetPresetIndex ?? 0;
    const preset = presets[presetIndex];
    if (!preset) {
      throw new Error(`\u9009\u62E9\u7684\u4F7F\u7528\u8230\u961F\u4E0D\u5B58\u5728\uFF08\u7D22\u5F15 ${presetIndex}\uFF09`);
    }
    const resolved = (0, ShipMatcher_1.resolveFleetPreset)(preset.ships);
    const rules = (0, FleetRuleMapper_1.resolveFleetPresetRules)(preset.ships, shipNameAliases);
    if (resolved.length === 0 || rules.length === 0) {
      throw new Error(`\u4F7F\u7528\u8230\u961F\u300C${preset.name}\u300D\u6CA1\u6709\u53EF\u7528\u8230\u8239`);
    }
    req.plan = req.plan ?? {};
    req.plan.fleet = resolved.map(shipNameNormalizer_1.toBackendName);
    req.plan.fleet_rules = rules;
  } else if (item.fleetPresetIndex != null) {
    throw new Error("\u4F5C\u6218\u8BA1\u5212\u4E2D\u5DF2\u6CA1\u6709\u6240\u9009\u4F7F\u7528\u8230\u961F");
  }
  return {
    req,
    selectedFleetId
  };
}
async function decisiveShipsForItem(item, preset, repository) {
  const source = item.dailySource ?? item.managedSource;
  if (preset.task_type !== "decisive" || source === "system") {
    return void 0;
  }
  if (!repository.getShipLibraryManifest) {
    throw new Error("\u8230\u8239\u8D44\u6599\u5E93\u8BFB\u53D6\u63A5\u53E3\u4E0D\u53EF\u7528");
  }
  return (await repository.getShipLibraryManifest()).ships;
}
async function decisiveShipsForTemplate(item, templateModel, repository) {
  const templateId = item.templateId ?? "";
  const template = templateModel.get(templateId);
  if (template?.type !== "decisive" || templateModel.isBuiltin(templateId)) {
    return void 0;
  }
  if (!repository?.getShipLibraryManifest) {
    throw new Error("\u8230\u8239\u8D44\u6599\u5E93\u8BFB\u53D6\u63A5\u53E3\u4E0D\u53EF\u7528");
  }
  return (await repository.getShipLibraryManifest()).ships;
}
function addPlanTaskToQueue(item, plan, planId, host) {
  const { req } = buildPlanQueueRequest(item, plan, planId, host.getShipNameAliases());
  host.scheduler.addTask(plan.mapName, plan.isEvent ? "event_fight" : "normal_fight", req, scheduler_1.TaskPriority.USER_TASK, item.times, plan.data.stop_condition, !!item.forceRetry, !!item.allowPolling, plan.data.endpoint_nodes, plan.data.result);
}
function addPresetTaskToQueue(item, preset, scheduler, ships) {
  let req;
  if (preset.task_type === "campaign") {
    req = {
      type: "campaign",
      campaign_name: preset.campaign_name ?? "",
      times: 1
    };
  } else if (preset.task_type === "exercise") {
    req = {
      type: "exercise",
      fleet_id: preset.fleet_id ?? 1
    };
  } else if (preset.task_type === "decisive") {
    req = {
      type: "decisive",
      chapter: preset.chapter,
      ...(0, shipNameNormalizer_1.toBackendDecisiveShipNames)(preset, ships),
      use_quick_repair: item.useQuickRepair ?? preset.use_quick_repair ?? true
    };
  } else {
    req = {
      type: preset.task_type,
      plan_id: preset.plan_id,
      times: 1,
      gap: preset.gap ?? 0,
      fleet_id: preset.fleet_id
    };
  }
  const effectiveTimes = preset.task_type === "exercise" ? 1 : Math.max(1, item.times || preset.times || 1);
  scheduler.addTask(item.label, preset.task_type, req, scheduler_1.TaskPriority.USER_TASK, effectiveTimes, preset.stop_condition, !!item.forceRetry, !!item.allowPolling);
}
async function loadManagedPlanToQueue(selection, host) {
  const item = {
    managedSource: selection.plan.source,
    managedFile: selection.plan.file,
    kind: selection.plan.kind === "preset" ? "preset" : "plan",
    times: Math.max(1, selection.plan.times || 1),
    label: selection.plan.name,
    fleetPresetIndex: selection.fleetPresetIndex
  };
  const repository = (0, IpcAdapter_1.getPlansGateway)();
  if (!repository)
    throw new Error("Electron bridge is unavailable");
  const { content, path } = await (0, managedPlanReader_1.readTaskGroupItemFile)(item, repository);
  const parsed = (0, adapter_1.parseYamlRecord)(content, "\u4EFB\u52A1\u6587\u4EF6");
  if (item.kind === "preset" || taskPreset_1.taskPresetCodec.isStandalone(parsed)) {
    const preset = taskPreset_1.taskPresetCodec.normalize(parsed);
    addPresetTaskToQueue(item, preset, host.scheduler, await decisiveShipsForItem(item, preset, repository));
  } else {
    const plan = PlanModel_1.PlanModel.fromYaml(content, path);
    addPlanTaskToQueue(item, plan, path, host);
  }
  Logger_1.Logger.info(`\u5DF2\u5C06\u300C${selection.plan.name}\u300D\u52A0\u5165\u4EFB\u52A1\u961F\u5217`);
  host.renderMain();
}
async function loadDailyPlanToQueue(selection, host) {
  const item = {
    dailySource: selection.plan.source,
    dailyFile: selection.plan.file,
    dailyTaskType: selection.plan.taskType,
    kind: "daily",
    times: selection.plan.taskType === "exercise" ? 1 : Math.max(1, selection.times),
    label: selection.plan.name,
    chapter: selection.plan.chapter,
    useQuickRepair: selection.plan.taskType === "decisive" ? selection.useQuickRepair !== false : void 0
  };
  const repository = (0, IpcAdapter_1.getPlansGateway)();
  if (!repository)
    throw new Error("Electron bridge is unavailable");
  const { content } = await (0, managedPlanReader_1.readTaskGroupItemFile)(item, repository);
  const preset = taskPreset_1.taskPresetCodec.normalize((0, adapter_1.parseYamlRecord)(content, "\u65E5\u5E38\u4EFB\u52A1"));
  addPresetTaskToQueue(item, preset, host.scheduler, await decisiveShipsForItem(item, preset, repository));
  Logger_1.Logger.info(`\u5DF2\u5C06\u65E5\u5E38\u4EFB\u52A1\u300C${selection.plan.name}\u300D\u52A0\u5165\u4EFB\u52A1\u961F\u5217`);
  host.renderMain();
}
async function loadGroupToQueue(taskGroupModel, templateModel, host) {
  const group = taskGroupModel.getActiveGroup();
  if (!group || group.items.length === 0) {
    Logger_1.Logger.warn("\u5F53\u524D\u4EFB\u52A1\u7EC4\u4E3A\u7A7A");
    return;
  }
  const repository = (0, IpcAdapter_1.getPlansGateway)();
  if (!repository)
    return;
  let loadedCount = 0;
  for (const item of group.items) {
    try {
      if (item.kind === "template") {
        const ships = await decisiveShipsForTemplate(item, templateModel, repository);
        loadedCount += loadTemplateToQueue(item, templateModel, host, ships) ? 1 : 0;
        continue;
      }
      const { content, path } = await (0, managedPlanReader_1.readTaskGroupItemFile)(item, repository);
      const parsed = (0, adapter_1.parseYamlRecord)(content, "\u4EFB\u52A1\u6587\u4EF6");
      if (item.kind === "preset" || taskPreset_1.taskPresetCodec.isStandalone(parsed)) {
        const preset = taskPreset_1.taskPresetCodec.normalize(parsed);
        addPresetTaskToQueue(item, preset, host.scheduler, await decisiveShipsForItem(item, preset, repository));
      } else {
        const plan = PlanModel_1.PlanModel.fromYaml(content, path);
        addPlanTaskToQueue(item, plan, plan.fileName, host);
      }
      loadedCount++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger_1.Logger.error(`\u52A0\u8F7D\u300C${item.label}\u300D\u5931\u8D25: ${msg}`);
    }
  }
  if (loadedCount > 0) {
    Logger_1.Logger.info(`\u5DF2\u4ECE\u4EFB\u52A1\u7EC4\u300C${group.name}\u300D\u52A0\u8F7D ${loadedCount} \u4E2A\u4EFB\u52A1\u5230\u961F\u5217`);
    host.switchPage("main");
    host.renderMain();
  }
}
function loadTemplateToQueue(item, templateModel, host, ships) {
  const tpl = templateModel.get(item.templateId ?? "");
  if (!tpl) {
    Logger_1.Logger.error(`\u6A21\u677F\u300C${item.label}\u300D\u4E0D\u5B58\u5728\uFF0C\u53EF\u80FD\u5DF2\u88AB\u5220\u9664`);
    return false;
  }
  let req;
  const times = item.times;
  const allowPolling = item.allowPolling ?? tpl.allowPolling ?? false;
  switch (tpl.type) {
    case "exercise":
      req = { type: "exercise", fleet_id: item.fleet_id ?? tpl.fleet_id ?? 1 };
      host.scheduler.addTask(item.label || tpl.name, "exercise", req, scheduler_1.TaskPriority.USER_TASK, 1, void 0, void 0, allowPolling);
      break;
    case "campaign": {
      const cName = item.campaignName ?? tpl.campaign_name ?? "\u56F0\u96BE\u6F5C\u8247";
      req = { type: "campaign", campaign_name: cName, times: 1 };
      host.scheduler.addTask(item.label || tpl.name, "campaign", req, scheduler_1.TaskPriority.USER_TASK, times, void 0, void 0, allowPolling);
      break;
    }
    case "decisive": {
      req = {
        type: "decisive",
        chapter: item.chapter ?? tpl.chapter ?? 6,
        ...(0, shipNameNormalizer_1.toBackendDecisiveShipNames)(tpl, ships),
        use_quick_repair: tpl.use_quick_repair
      };
      host.scheduler.addTask(item.label || tpl.name, "decisive", req, scheduler_1.TaskPriority.USER_TASK, times, void 0, void 0, allowPolling);
      break;
    }
    default:
      return false;
  }
  return true;
}
async function loadSingleItemToQueue(index, taskGroupModel, templateModel, host) {
  const group = taskGroupModel.getActiveGroup();
  if (!group)
    return;
  const item = group.items[index];
  if (!item)
    return;
  const repository = (0, IpcAdapter_1.getPlansGateway)();
  if (item.kind === "template") {
    try {
      const ships = await decisiveShipsForTemplate(item, templateModel, repository);
      loadTemplateToQueue(item, templateModel, host, ships);
      Logger_1.Logger.info(`\u5DF2\u5C06\u300C${item.label}\u300D\u52A0\u5165\u961F\u5217`);
      host.renderMain();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger_1.Logger.error(`\u52A0\u8F7D\u300C${item.label}\u300D\u5931\u8D25: ${msg}`);
    }
    return;
  }
  if (!repository)
    return;
  try {
    const { content, path } = await (0, managedPlanReader_1.readTaskGroupItemFile)(item, repository);
    const parsed = (0, adapter_1.parseYamlRecord)(content, "\u4EFB\u52A1\u6587\u4EF6");
    if (item.kind === "preset" || taskPreset_1.taskPresetCodec.isStandalone(parsed)) {
      const preset = taskPreset_1.taskPresetCodec.normalize(parsed);
      addPresetTaskToQueue(item, preset, host.scheduler, await decisiveShipsForItem(item, preset, repository));
    } else {
      const plan = PlanModel_1.PlanModel.fromYaml(content, path);
      addPlanTaskToQueue(item, plan, plan.fileName, host);
    }
    Logger_1.Logger.info(`\u5DF2\u5C06\u300C${item.label}\u300D\u52A0\u5165\u961F\u5217`);
    host.renderMain();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger_1.Logger.error(`\u52A0\u8F7D\u300C${item.label}\u300D\u5931\u8D25: ${msg}`);
  }
}