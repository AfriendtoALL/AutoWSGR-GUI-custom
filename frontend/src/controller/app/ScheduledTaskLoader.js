"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledTaskLoader = void 0;
var IpcAdapter_1 = require_IpcAdapter();
var PlanModel_1 = require_PlanModel();
var scheduler_1 = require_scheduler2();
var decisiveAutomation_js_1 = require_decisiveAutomation();
var lootPlans_js_1 = require_lootPlans();
var Logger_1 = require_Logger();
var queueLoader_1 = require_queueLoader();
var AutomaticDecisiveTask_1 = require_AutomaticDecisiveTask();
var ScheduledTaskLoader = class {
  constructor(host, repository = (0, IpcAdapter_1.getPlansGateway)()) {
    this.host = host;
    this.repository = repository;
  }
  async loadDecisiveTask(source) {
    const selectedSource = (0, decisiveAutomation_js_1.normalizeDecisiveAutomationSource)(source);
    let label;
    let request;
    if (selectedSource === decisiveAutomation_js_1.USER_DECISIVE_PLAN_ID) {
      if (!this.repository?.getDecisivePlanSettings) {
        throw new Error("\u51B3\u6218\u8BA1\u5212\u8BFB\u53D6\u63A5\u53E3\u4E0D\u53EF\u7528");
      }
      const [plan, shipLibrary] = await Promise.all([
        this.repository.getDecisivePlanSettings(),
        this.repository.getShipLibraryManifest()
      ]);
      request = (0, AutomaticDecisiveTask_1.buildAutomaticDecisivePlanRequest)(plan, shipLibrary.ships);
      label = "\u7528\u6237\u8BA1\u5212";
    } else {
      const template = this.host.templateModel.get(decisiveAutomation_js_1.SYSTEM_DECISIVE_TEMPLATE_ID);
      if (!template || template.type !== "decisive") {
        throw new Error("\u627E\u4E0D\u5230\u7CFB\u7EDF\u51B3\u6218\u9884\u8BBE");
      }
      request = (0, AutomaticDecisiveTask_1.buildAutomaticDecisivePresetRequest)(template);
      label = "\u7CFB\u7EDF\u9884\u8BBE";
    }
    const taskId = this.host.scheduler.addTask(`\u81EA\u52A8\u51B3\u6218\xB7${label}`, "decisive", request, scheduler_1.TaskPriority.DAILY, 1);
    Logger_1.Logger.info(`\u81EA\u52A8\u51B3\u6218\u5DF2\u52A0\u5165\u961F\u5217 (${label}, \u7B2C ${request.chapter} \u7AE0 \xD71)`);
    this.host.scheduler.startConsuming();
    return taskId;
  }
  async loadNormalFightTasks() {
    const tasks = this.host.configModel.current.daily_automation.normal_fight_tasks;
    if (tasks.length === 0) {
      Logger_1.Logger.warn("\u81EA\u52A8\u51FA\u5F81\u5DF2\u542F\u7528\uFF0C\u4F46\u4EFB\u52A1\u5217\u8868\u4E3A\u7A7A");
      return { status: "handled" };
    }
    if (!this.repository)
      return { status: "retry" };
    const uniqueTasks = (0, scheduler_1.uniqueNormalFightTasks)(tasks);
    if (uniqueTasks.length < tasks.length) {
      Logger_1.Logger.warn("\u81EA\u52A8\u51FA\u5F81\u5B58\u5728\u91CD\u590D\u7684\u8BA1\u5212\u548C\u8230\u961F\u914D\u7F6E\uFF0C\u672C\u6B21\u4EC5\u6267\u884C\u4E00\u6B21");
    }
    const eligibleTasks = uniqueTasks.filter((task) => this.host.normalFightDailyQuota.remaining(task) > 0);
    if (eligibleTasks.length === 0) {
      Logger_1.Logger.debug("\u81EA\u52A8\u51FA\u5F81\u4ECA\u65E5\u6267\u884C\u6B21\u6570\u5DF2\u7528\u5B8C");
      return { status: "handled" };
    }
    const preparedTasks = [];
    for (const task of eligibleTasks) {
      try {
        const resolved = await this.resolveNormalFightPlan(task);
        if (!resolved) {
          throw new Error(`\u627E\u4E0D\u5230\u51FA\u5F81\u8BA1\u5212: ${task.name}`);
        }
        const plan = PlanModel_1.PlanModel.fromYaml(resolved.content, resolved.path);
        const { req: request } = (0, queueLoader_1.buildPlanQueueRequest)({
          path: resolved.path,
          kind: "plan",
          times: 1,
          label: plan.mapName,
          fleet_id: task.fleet_id,
          fleetPresetIndex: task.fleet_preset_index
        }, plan, resolved.path, this.host.configModel.current.ocr.ship_name_aliases);
        preparedTasks.push({
          name: `\u81EA\u52A8\u51FA\u5F81\xB7${plan.mapName}`,
          type: plan.isEvent ? "event_fight" : "normal_fight",
          request,
          config: structuredClone(task),
          stopCondition: plan.data.stop_condition,
          endpointNodes: plan.data.endpoint_nodes,
          endpointResult: plan.data.result
        });
      } catch (error) {
        Logger_1.Logger.error(`\u81EA\u52A8\u51FA\u5F81\u52A0\u8F7D\u300C${task.name}\u300D\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (preparedTasks.length === 0)
      return { status: "retry" };
    if (!this.host.scheduler.isCompletelyIdle) {
      Logger_1.Logger.debug("\u81EA\u52A8\u51FA\u5F81\u8BA1\u5212\u52A0\u8F7D\u5B8C\u6210\u65F6\u8C03\u5EA6\u5668\u5DF2\u975E\u7A7A\u95F2\uFF0C\u7B49\u5F85\u4E0B\u6B21\u68C0\u67E5");
      return { status: "retry" };
    }
    const queuedTasks = preparedTasks.filter((task) => this.host.normalFightDailyQuota.remaining(task.config) > 0).map((task) => ({
      taskId: this.host.scheduler.addTask(task.name, task.type, task.request, scheduler_1.TaskPriority.DAILY, 1, task.stopCondition, void 0, void 0, task.endpointNodes, task.endpointResult),
      config: task.config
    }));
    if (queuedTasks.length === 0)
      return { status: "handled" };
    Logger_1.Logger.info(`\u81EA\u52A8\u51FA\u5F81\u5DF2\u6309\u987A\u5E8F\u52A0\u5165 ${queuedTasks.length} \u4E2A\u5355\u8F6E\u4EFB\u52A1`);
    return { status: "queued", tasks: queuedTasks };
  }
  async loadLootTask(source, planId, stopCount) {
    const managedPlan = (0, lootPlans_js_1.normalizeLootAutomationPlan)({
      source,
      file: planId,
      name: planId
    });
    if (!managedPlan) {
      throw new Error(`\u672A\u77E5\u8BA1\u5212 ${String(planId)}`);
    }
    if (!this.repository)
      return null;
    const loaded = await this.repository.readManagedCombatPlan(managedPlan.source, managedPlan.file);
    if (!loaded.success || !loaded.content || !loaded.path) {
      throw new Error(loaded.error || `\u65E0\u6CD5\u8BFB\u53D6 ${managedPlan.file}`);
    }
    const planPath = loaded.runtimePath ?? loaded.path;
    const plan = PlanModel_1.PlanModel.fromYaml(loaded.content, planPath);
    const { req: request } = (0, queueLoader_1.buildPlanQueueRequest)({
      path: planPath,
      kind: "plan",
      times: 99,
      label: plan.mapName,
      fleet_id: plan.data.fleet_id
    }, plan, planPath);
    const taskId = this.host.scheduler.addTask(`\u81EA\u52A8\u5237\u80D6\u6B21\xB7${plan.mapName}`, plan.isEvent ? "event_fight" : "normal_fight", request, scheduler_1.TaskPriority.DAILY, 99, { loot_count_ge: stopCount }, void 0, void 0);
    Logger_1.Logger.info(`\u81EA\u52A8\u6218\u5229\u54C1\u5DF2\u52A0\u5165\u961F\u5217 (${plan.mapName}, \u6218\u5229\u54C1\u2265${stopCount}\u65F6\u505C\u6B62)`);
    this.host.scheduler.startConsuming();
    return taskId;
  }
  async resolveNormalFightPlan(task) {
    if (!this.repository)
      return null;
    const planName = task.name.trim();
    const result = task.source ? await this.repository.readManagedCombatPlan(task.source, planName) : await this.repository.readCombatPlanFile(planName);
    if (result.success && result.content?.trim() && result.path) {
      return {
        path: result.runtimePath ?? result.path,
        content: result.content
      };
    }
    return null;
  }
};
exports.ScheduledTaskLoader = ScheduledTaskLoader;