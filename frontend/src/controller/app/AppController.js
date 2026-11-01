Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
var MainView_1 = require_MainView();
var PlanPreviewView_1 = require_PlanPreviewView();
var ConfigView_1 = require_ConfigView();
var TaskGroupView_1 = require_TaskGroupView();
var SetupWizardView_1 = require_SetupWizardView();
var AnimatedSelect_1 = require_AnimatedSelect();
var theme_1 = require_theme();
var ConfigModel_1 = require_ConfigModel();
var ApiClient_1 = require_ApiClient();
var scheduler_1 = require_scheduler2();
var TaskGroupModel_1 = require_TaskGroupModel();
var TemplateModel_1 = require_TemplateModel();
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
var IpcAdapter_1 = require_IpcAdapter();
var StorageAdapter_1 = require_StorageAdapter();
var TemplateController_1 = require_TemplateController();
var TaskGroupController_1 = require_TaskGroupController();
var queueLoader_1 = require_queueLoader();
var PlanController_1 = require_PlanController();
var DecisivePlanController_1 = require_DecisivePlanController();
var FleetPlannerController_1 = require_FleetPlannerController();
var StartupController_1 = require_StartupController();
var MigrationConflictController_1 = require_MigrationConflictController();
var SchedulerBinder_1 = require_SchedulerBinder();
var ConfigController_1 = require_ConfigController();
var CurrentFleetController_1 = require_CurrentFleetController();
var NavigationController_1 = require_NavigationController();
var OperationsController_1 = require_OperationsController();
var SettingsController_1 = require_SettingsController();
var rendering_1 = require_rendering2();
var SelectorDialog_1 = require_SelectorDialog();
/** 6.11/R36：骨架样式见 src/view/index.html，真实 UI 首次渲染后移除。 */
function removeBootSkeleton() {
  const skeleton = document.getElementById("boot-skeleton");
  if (skeleton)
    skeleton.remove();
  // 6.11b/R36：骨架摘除后再让真实 UI 进入布局。
  document.body.classList.remove("boot-loading");
}
/** 6.11/R36：运行配置预取耗时（13 次 invoke 并发），供首屏打点引用。 */
var bootSettingsPrefetchMs = null;
/**
 * 6.11/R36：把首屏打点写进 GUI 日志，供冷启动验收取证。
 * paint 条目在帧提交后才入队，rAF 里读不到，所以小步轮询到出现为止（5s 封顶）。
 */
function logFirstPaint() {
  const measure = () => typeof performance !== "undefined" && typeof performance.getEntriesByType === "function" ? performance.getEntriesByType("paint") : [];
  const deadline = (typeof performance !== "undefined" ? performance.now() : 0) + 5e3;
  const attempt = () => {
    try {
      const paints = measure();
      const hasPaint = paints.some((item) => item.name === "first-contentful-paint" || item.name === "first-paint");
      if (!hasPaint && typeof performance !== "undefined" && performance.now() < deadline) {
        setTimeout(attempt, 100);
        return;
      }
      const read = (name) => {
        const entry = paints.find((item) => item.name === name);
        return entry ? `${Math.round(entry.startTime)}ms` : "n/a";
      };
      const prefetch = bootSettingsPrefetchMs === null ? "n/a" : `${bootSettingsPrefetchMs}ms`;
      Logger_1.Logger.info(`[Startup] \u9996\u5C4F\u6E32\u67D3\u5B8C\u6210\uFF1Afirst-paint=${read("first-paint")}\u3001FCP=${read("first-contentful-paint")}\u3001\u8FD0\u884C\u914D\u7F6E\u9884\u53D6=${prefetch}/13 \u9879\u3001\u5F53\u524D=${Math.round(performance.now())}ms`);
    } catch {
    }
  };
  attempt();
}
var QUEUE_SNAPSHOT_FILE = "queue_state.json";
var QUEUE_SNAPSHOT_THROTTLE_MS = 1000;
/** 6.12：队列快照节流落盘；首个变更立即写，后续 1s 合并。 */
var QueueSnapshotStore = class {
  constructor(repository = IpcAdapter_1.rendererFileRepository) {
    this.repository = repository;
    this.pending = null;
    this.timer = null;
    this.writePromise = null;
    this.lastWriteAt = 0;
    this.disposed = false;
  }
  async load() {
    try {
      const raw = await this.repository.readFile(QUEUE_SNAPSHOT_FILE);
      if (!raw)
        return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.queue))
        return null;
      return parsed;
    } catch (error) {
      console.warn("[QueueSnapshot] 读取失败，按空队列处理:", error);
      return null;
    }
  }
  schedule(snapshot) {
    if (this.disposed || !snapshot)
      return;
    this.pending = snapshot;
    if (this.timer)
      return;
    const elapsed = Date.now() - this.lastWriteAt;
    if (elapsed >= QUEUE_SNAPSHOT_THROTTLE_MS)
      void this.flush();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, Math.max(0, QUEUE_SNAPSHOT_THROTTLE_MS - elapsed));
    this.timer.unref?.();
  }
  async flush() {
    if (this.disposed)
      return;
    if (this.writePromise)
      await this.writePromise;
    if (!this.pending)
      return;
    const snapshot = this.pending;
    this.pending = null;
    this.writePromise = this.repository.saveFile(QUEUE_SNAPSHOT_FILE, JSON.stringify(snapshot)).catch((error) => {
      console.error("[QueueSnapshot] 保存失败:", error);
    });
    await this.writePromise;
    this.writePromise = null;
    this.lastWriteAt = Date.now();
  }
  dispose() {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }
};
var AppController = class {
  constructor(runtimeGateway = (0, IpcAdapter_1.getBridge)()) {
    this.runtimeGateway = runtimeGateway;
    this.appRoot = "";
    this.plansDir = "";
    this.configDir = "";
    this.startFailureDialogOpen = false;
    this.queueSnapshotStore = new QueueSnapshotStore();
    this.queueSnapshotReady = false;
    this.mainView = new MainView_1.MainView();
    this.planView = new PlanPreviewView_1.PlanPreviewView();
    this.fleetPlannerCtrl = new FleetPlannerController_1.FleetPlannerController();
    this.currentFleetCtrl = new CurrentFleetController_1.CurrentFleetController();
    this.decisivePlanCtrl = new DecisivePlanController_1.DecisivePlanController();
    this.migrationConflictCtrl = new MigrationConflictController_1.MigrationConflictController();
    this.configView = new ConfigView_1.ConfigView();
    this.taskGroupView = new TaskGroupView_1.TaskGroupView();
    this.setupView = new SetupWizardView_1.SetupWizardView();
    this.configModel = new ConfigModel_1.ConfigModel();
    this.taskGroupModel = new TaskGroupModel_1.TaskGroupModel();
    this.templateModel = new TemplateModel_1.TemplateModel();
    this.campaignDailyQuota = new scheduler_1.CampaignDailyQuota();
    this.normalFightDailyQuota = new scheduler_1.NormalFightDailyQuota();
    this.fleetPlannerCtrl.setTaskGroupsProvider(() => this.taskGroupModel.groups);
    const rawPort = (0, IpcAdapter_1.getRuntimeSettings)().backendPort;
    let port = Number(rawPort);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      port = 8438;
    }
    this.api = new ApiClient_1.ApiClient(`http://localhost:${port}`);
    this.scheduler = new scheduler_1.Scheduler(this.api);
    this.navigationCtrl = new NavigationController_1.NavigationController({
      loadFleetPlanner: () => this.fleetPlannerCtrl.load(),
      ensureDefaultPlan: () => this.planCtrl.ensureDefaultPlan(),
      loadPlanManagement: () => this.fleetPlannerCtrl.loadManagement(),
      refreshAdbStatus: () => this.settingsCtrl.refreshAdbStatus(),
      refreshShipLibraryStatus: () => this.settingsCtrl.refreshShipLibraryStatus(),
      hasUnsavedConfigChanges: () => this.configCtrl?.hasUnsavedChanges() ?? false
    });
    this.operationsCtrl = new OperationsController_1.OperationsController(this.api, this.mainView, Logger_1.Logger);
    const cfg = this.configModel.current.daily_automation;
    const gui = this.configModel.currentGuiAutomation;
    this.cronScheduler = new scheduler_1.CronScheduler({
      autoExercise: cfg.auto_exercise,
      exerciseFleetId: cfg.exercise_fleet_id ?? 1,
      autoBattle: cfg.auto_battle,
      battleType: cfg.battle_type,
      battleTimes: gui.battleTimes,
      autoNormalFight: cfg.auto_normal_fight,
      autoDecisive: gui.autoDecisive,
      decisiveTemplateId: gui.decisiveTemplateId,
      autoLoot: gui.autoLoot,
      lootPlanSource: gui.lootPlanSource,
      lootPlanId: gui.lootPlanId,
      lootStopCount: gui.lootStopCount
    });
    this.schedulerBinder = new SchedulerBinder_1.SchedulerBinder({
      scheduler: this.scheduler,
      cronScheduler: this.cronScheduler,
      api: this.api,
      templateModel: this.templateModel,
      configModel: this.configModel,
      campaignDailyQuota: this.campaignDailyQuota,
      normalFightDailyQuota: this.normalFightDailyQuota,
      renderMain: () => this.renderMain(),
      persistQueueSnapshot: () => this.persistQueueSnapshot(),
      refreshNormalFightRemaining: () => this.configCtrl?.refreshNormalFightRemaining(),
      updateOpsAvailability: (c) => this.operationsCtrl.updateOpsAvailability(c),
      updateExpeditionTimer: (text) => this.mainView.setExpeditionTimer(text)
    });
  }
  /** 初始化：绑定事件、渲染初始状态、自动连接后端 */
  init() {
    (0, theme_1.applyTheme)();
    (0, AnimatedSelect_1.initAnimatedSelects)();
    this.navigationCtrl.bindNavigation();
    this.navigationCtrl.bindPlanNavigation();
    this.bindQueueActions();
    this.schedulerBinder.bindSchedulerCallbacks();
    this.schedulerBinder.bindCronCallbacks();
    this.decisivePlanCtrl.bindActions();
    void this.decisivePlanCtrl.load();
    this.planCtrl = new PlanController_1.PlanController(this.planView, {
      scheduler: this.scheduler,
      plansDir: "",
      renderMain: () => this.renderMain(),
      switchPage: (p) => this.navigationCtrl.switchPage(p, p === "plan" ? "scheme" : void 0)
    });
    this.fleetPlannerCtrl.onOpenBattlePlan = async (file, source) => {
      await this.planCtrl.openManagedPlan(file, source);
    };
    this.fleetPlannerCtrl.onTeamPlanSaved = (previousName, plan) => this.planCtrl.synchronizeTeamPlan(previousName, plan);
    this.planCtrl.bindActions();
    this.taskGroupCtrl = new TaskGroupController_1.TaskGroupController(this.taskGroupModel, this.taskGroupView, this.templateModel, this.mainView, this.planView, {
      scheduler: this.scheduler,
      plansDir: "",
      getShipNameAliases: () => this.configModel.current.ocr.ship_name_aliases,
      renderMain: () => this.renderMain(),
      switchPage: (p) => this.navigationCtrl.switchPage(p, p === "plan" ? "scheme" : void 0),
      importTaskPreset: (preset, fp) => this.planCtrl.importTaskPreset(preset, fp),
      getCurrentPlan: () => this.planCtrl.getCurrentPlan(),
      setCurrentPlan: (plan, mapData) => this.planCtrl.setCurrentPlan(plan, mapData),
      renderPlanPreview: () => this.planCtrl.renderPlanPreview(),
      closePresetDetail: () => this.planCtrl.closePresetDetail(),
      executePreset: () => this.planCtrl.executePreset(),
      getCurrentPresetInfo: () => this.planCtrl.getCurrentPresetInfo(),
      pickManagedBattlePlan: () => this.planCtrl.pickManagedBattlePlan(),
      openManagedPlan: (file, source) => this.planCtrl.openManagedPlan(file, source)
    });
    this.taskGroupCtrl.bindActions();
    this.templateCtrl = new TemplateController_1.TemplateController(this.templateModel, this.taskGroupModel, () => this.taskGroupCtrl.render(), "", "");
    this.templateCtrl.bindActions();
    this.configCtrl = new ConfigController_1.ConfigController({
      configModel: this.configModel,
      configView: this.configView,
      setupView: this.setupView,
      mainView: this.mainView,
      scheduler: this.scheduler,
      cronScheduler: this.cronScheduler,
      normalFightDailyQuota: this.normalFightDailyQuota,
      startupCtrl: null,
      configDir: this.configDir
    });
    this.settingsCtrl = new SettingsController_1.SettingsController({
      configView: this.configView,
      getConfigDir: () => this.configDir,
      saveConfig: () => this.configCtrl.saveConfig(),
      listEmulatorDevices: () => this.listEmulatorDevices(),
      pickAutomationPlan: (currentTask) => this.planCtrl.pickManagedBattlePlanForAutomation(currentTask),
      pickLootAutomationPlans: (currentPlans) => this.planCtrl.pickManagedLootPlans(currentPlans),
      getNormalFightRemaining: (task) => this.normalFightDailyQuota.remaining(task),
      reloadShipLibrary: async () => {
        await Promise.all([
          this.fleetPlannerCtrl.load(true),
          this.currentFleetCtrl.load(true)
        ]);
        this.renderMain();
      },
      ensureSystemConnected: () => {
        if (this.scheduler.status !== "not_connected") {
          return Promise.resolve(true);
        }
        return this.startupCtrl?.startSystem() ?? Promise.resolve(false);
      }
    });
    this.settingsCtrl.bindActions();
    this.operationsCtrl.bindOpsActions();
    this.renderMain();
    logFirstPaint();
    void this.currentFleetCtrl.load().then(() => this.renderMain());
    this.planView.render(null);
    const version = (0, IpcAdapter_1.getRuntimeSettings)().appVersion;
    if (version) {
      this.mainView.setVersion(`v${version}`);
    }
    (0, theme_1.watchSystemTheme)();
    this.mainView.onBeforeUnload = () => {
      void this.flushBeforeExit();
    };
    (0, IpcAdapter_1.bindIpcSubscription)("flush-request", () =>           window.electronBridge?.onFlushRequest?.((requestId) => {
      void this.flushBeforeExit().then(() => {
        window.electronBridge?.notifyFlushDone?.(requestId);
      });
    }));
    this.startupCtrl = new StartupController_1.StartupController({
      scheduler: this.scheduler,
      cronScheduler: this.cronScheduler,
      configModel: this.configModel,
      appRoot: this.appRoot,
      plansDir: this.plansDir,
      configDir: this.configDir,
      syncPaths: (appRoot, plansDir, configDir) => {
        this.appRoot = appRoot;
        this.plansDir = plansDir;
        this.configDir = configDir;
        this.templateCtrl.appRoot = appRoot;
        this.templateCtrl.plansDir = plansDir;
        this.taskGroupCtrl.host.plansDir = plansDir;
        this.planCtrl.host.plansDir = plansDir;
        this.configCtrl.setConfigDir(configDir);
      },
      initLogger: (b) => {
        Logger_1.Logger.init({
          appendGuiLog: b.appendGuiLog.bind(b),
          uiCallback: (level, channel, message) => {
            const now = /* @__PURE__ */ new Date();
            const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
            this.mainView.appendLog({ time, level, channel, message });
          }
        });
      },
      loadConfigAndSync: async () => {
        await this.configCtrl.loadConfig();
        const da = this.configModel.current.daily_automation;
        const gui = this.configModel.currentGuiAutomation;
        this.cronScheduler.updateConfig({
          autoExercise: da.auto_exercise,
          exerciseFleetId: da.exercise_fleet_id ?? 1,
          autoBattle: da.auto_battle,
          battleType: da.battle_type,
          battleTimes: gui.battleTimes,
          autoNormalFight: da.auto_normal_fight,
          autoDecisive: gui.autoDecisive,
          decisiveTemplateId: gui.decisiveTemplateId,
          autoLoot: gui.autoLoot,
          lootPlanSource: gui.lootPlanSource,
          lootPlanId: gui.lootPlanId,
          lootStopCount: gui.lootStopCount
        });
      },
      detectAndApplyEmulator: () => this.configCtrl.detectAndApplyEmulator(),
      showSetupWizard: () => this.configCtrl.showSetupWizard(),
      loadModelsAndRender: async (b) => {
        await this.templateModel.init(b);
        this.templateCtrl.renderLibrary();
        this.configCtrl.renderConfig();
        this.mainView.setDebugMode(StorageAdapter_1.browserStorageStore.get("debugMode") === "true");
        await this.taskGroupModel.load();
        this.taskGroupCtrl.render();
        // 6.11/R36：模板库与任务组都渲染完，才算「数据到齐」，此时才摘骨架。
        removeBootSkeleton();
        Logger_1.Logger.info(`[Startup] \u9996\u5C4F\u6570\u636E\u5C31\u7EEA\uFF1A\u9AA8\u67B6\u79FB\u9664=${Math.round(performance.now())}ms`);
      },
      restoreQueueSnapshot: () => this.restoreQueueSnapshot(),
      hideBootSkeleton: () => removeBootSkeleton(),
      reviewMigrationConflicts: () => this.migrationConflictCtrl.reviewPending(() => removeBootSkeleton()),
      bindBackendLog: (b) => {
        if (b.onBackendLog) {
          const levelNames = {
            TRACE: "debug",
            DEBUG: "debug",
            INFO: "info",
            SUCCESS: "info",
            WARNING: "warning",
            WARN: "warning",
            ERROR: "error",
            CRITICAL: "critical"
          };
          const piped = /^\s*[^|]*\|\s*(TRACE|DEBUG|INFO|SUCCESS|WARNING|WARN|ERROR|CRITICAL)\s*\|\s*[^|]*\|\s*(.*)$/i;
          const timed = /^\d{2}:\d{2}:\d{2}\.\d{3}\s*\|\s*(TRACE|DEBUG|INFO|SUCCESS|WARNING|WARN|ERROR|CRITICAL)\s*\|\s*(.*)$/i;
          const dated = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\s*\|\s*(TRACE|DEBUG|INFO|SUCCESS|WARNING|WARN|ERROR|CRITICAL)\s*\|\s*(.*)$/i;
          const leading = /^(TRACE|DEBUG|INFO|SUCCESS|WARNING|WARN|ERROR|CRITICAL)\s*:\s*(.*)$/i;
          const parse = (text) => {
            let match = text.match(piped);
            if (match) {
              return {
                level: levelNames[match[1].toUpperCase()] || "info",
                message: (match[2] || "").trim() || text
              };
            }
            match = text.match(timed) || text.match(dated);
            if (match) {
              let body = (match[2] || "").trim();
              const separator = body.indexOf(" - ");
              if (separator >= 0)
                body = body.slice(separator + 3).trim();
              return {
                level: levelNames[match[1].toUpperCase()] || "info",
                message: body || text
              };
            }
            match = text.match(leading);
            if (match) {
              return {
                level: levelNames[match[1].toUpperCase()] || "info",
                message: (match[2] || "").trim() || text
              };
            }
            return { level: "info", message: text };
          };
          (0, IpcAdapter_1.bindIpcSubscription)("backend-log", () =>                 b.onBackendLog((line) => {
            const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
            if (!clean)
              return;
            const parsed = parse(clean);
            this.schedulerBinder.handleBackendRuntimeLog(parsed.message);
            Logger_1.Logger.logLevel(parsed.level, parsed.message);
            this.scheduler.processBackendLog(parsed.message);
          }));
        }
      },
      renderMain: () => this.renderMain(),
      onSystemStartFailure: (message) => this.handleSystemStartFailure(message),
      startHeartbeat: () => this.startupCtrl.startHeartbeat()
    });
    this.configCtrl.setStartupController(this.startupCtrl);
    this.navigationCtrl.restoreLastActivePage();
    this.startupCtrl.run().catch((e) => {
      console.error("\u521D\u59CB\u5316\u5931\u8D25:", e);
      removeBootSkeleton();
      this.configCtrl.renderConfig();
    });
  }
  /** 6.6：后端设备 endpoint，带 2.5s 兜底，避免后端未起时卡设置页。 */
  async listEmulatorDevices() {
    try {
      const response = await Promise.race([
        this.api.emulatorDevices(),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ]);
      if (!response || response.success !== true)
        return [];
      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return [];
    }
  }
  /** 6.6：启动失败原文 + 在线设备列表；用户选完即保存并重试。 */
  async handleSystemStartFailure(message) {
    if (this.startFailureDialogOpen)
      return;
    this.startFailureDialogOpen = true;
    try {
      const text = typeof message === "string" && message.trim() ? message.trim() : "模拟器连接/游戏启动异常";
      await (0, DialogHelper_1.showAlert)("系统启动失败", text);
      const devices = await this.settingsCtrl?.collectAdbDevices?.({ probePorts: true }) ?? [];
      const online = devices.filter((device) => device.status === "device");
      if (online.length === 0)
        return;
      const selected = await (0, SelectorDialog_1.showSelector)("选择要使用的设备", online.map((device) => ({
        icon: "▸",
        label: `${device.serial}（${device.status}）`
      })));
      if (!selected)
        return;
      const device = online[selected.index];
      if (device)
        await this.settingsCtrl.applyDeviceSelection(device.serial);
    } finally {
      this.startFailureDialogOpen = false;
    }
  }
  /** 6.12：队列变化节流落盘（恢复完成前不写，避免空队列覆盖快照）。 */
  persistQueueSnapshot() {
    if (!this.queueSnapshotReady)
      return;
    this.queueSnapshotStore.schedule(this.scheduler.exportSnapshot());
  }
  /** 6.12：启动时恢复队列；运行中任务标中断、不自动重跑。 */
  async restoreQueueSnapshot() {
    const snapshot = await this.queueSnapshotStore.load();
    if (snapshot) {
      const result = this.scheduler.restoreSnapshot(snapshot);
      if (result.interrupted) {
        Logger_1.Logger.warn(`[Queue] \u4E0A\u6B21\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u5DF2\u4E2D\u65AD\uFF0C\u672A\u81EA\u52A8\u91CD\u8DD1\uFF08\u6062\u590D ${result.restored} \u9879\uFF09`);
      } else if (result.restored > 0) {
        Logger_1.Logger.info(`[Queue] \u5DF2\u6062\u590D ${result.restored} \u4E2A\u672A\u5F00\u59CB\u4EFB\u52A1`);
      }
    }
    this.queueSnapshotReady = true;
    this.renderMain();
    this.persistQueueSnapshot();
  }
  // ════════════════════════════════════════
  // 用户操作绑定
  // ════════════════════════════════════════
  bindQueueActions() {
    this.mainView.onStopTask = () => {
      void this.stopCurrentTask();
    };
    this.mainView.onClearQueue = () => {
      this.scheduler.clearQueue();
      this.renderMain();
    };
    this.mainView.onImportPlan = () => {
      void this.importPlanToQueue();
    };
    this.mainView.onStartQueue = () => {
      this.scheduler.startConsuming();
      this.renderMain();
    };
    this.mainView.onRemoveQueueItem = (taskId) => {
      this.scheduler.removeTask(taskId);
      this.renderMain();
    };
    this.mainView.onMoveQueueItem = (from, to) => {
      this.scheduler.moveTask(from, to);
      this.renderMain();
    };
  }
  async stopCurrentTask() {
    if (this.scheduler.status === "stopping")
      return;
    Logger_1.Logger.info("\u6B63\u5728\u505C\u6B62\u5F53\u524D\u4EFB\u52A1\uFF0C\u8BF7\u7B49\u5F85\u540E\u7AEF\u786E\u8BA4\u2026");
    try {
      await this.scheduler.stopRunning();
      this.schedulerBinder.resetRuntimeState();
      this.renderMain();
      Logger_1.Logger.info("\u5F53\u524D\u4EFB\u52A1\u5DF2\u505C\u6B62\uFF08\u4EFB\u52A1\u5DF2\u4FDD\u7559\u5728\u961F\u5217\u4E2D\uFF09");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger_1.Logger.error(`\u505C\u6B62\u4EFB\u52A1\u5931\u8D25\uFF1A${message}`);
      this.renderMain();
    }
  }
  async importPlanToQueue() {
    const selected = await this.planCtrl.pickManagedBattlePlanForQueue();
    if (!selected)
      return;
    try {
      await (0, queueLoader_1.loadManagedPlanToQueue)(selected, {
        scheduler: this.scheduler,
        getShipNameAliases: () => this.configModel.current.ocr.ship_name_aliases,
        renderMain: () => this.renderMain()
      });
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u65E0\u6CD5\u52A0\u8F7D\u51FA\u5F81\u8BA1\u5212", error instanceof Error ? error.message : String(error));
    }
  }
  /**
   * 退出前把内存状态落盘：停止订阅、保存任务组、刷完日志缓冲。
   * 主进程在关窗前会通过 app:flush-request 等待本方法完成。
   */
  flushBeforeExit() {
    if (!this.flushBeforeExitPromise) {
      this.flushBeforeExitPromise = (async () => {
        this.schedulerBinder.dispose();
        this.fleetPlannerCtrl.dispose();
        this.decisivePlanCtrl.dispose();
        await Promise.allSettled([
          this.taskGroupModel.save(),
          this.queueSnapshotStore.flush(),
          Logger_1.Logger.flushAsync()
        ]);
        this.queueSnapshotStore.dispose();
        // 6.9/R32：退出前释放日志定时器，渲染进程销毁后不留句柄。
        await Logger_1.Logger.dispose();
      })();
    }
    return this.flushBeforeExitPromise;
  }
  // ════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════
  renderMain() {
    const running = this.scheduler.currentRunningTask;
    const runtime = this.schedulerBinder.runtimeState;
    const state = {
      scheduler: this.scheduler,
      currentFleet: running ? this.currentFleetCtrl.resolve(running.request) : [],
      currentProgress: runtime.currentProgress,
      trackedLoot: runtime.trackedLoot,
      trackedShip: runtime.trackedShip,
      dailySortieStats: runtime.dailySortieStats,
      wsConnected: runtime.wsConnected,
      expeditionTimerText: runtime.expeditionTimerText
    };
    const vo = (0, rendering_1.buildMainViewObject)(state);
    this.mainView.render(vo);
  }
};
exports.AppController = AppController;
// 6.11b/R36：先等主进程迁移完成，再并行取回运行时配置（13 次 invoke 并发）；
// 最后让出一帧给骨架，再构造控制器。骨架已在 HTML 里先于脚本绘制。
var bootSettingsStartedAt = 0;
(0, IpcAdapter_1.waitStartupReady)().then(() => {
  bootSettingsStartedAt = performance.now();
  return (0, IpcAdapter_1.loadRuntimeSettings)();
}).catch((error) => {
  console.error("[Startup] \u8FD0\u884C\u65F6\u914D\u7F6E\u9884\u53D6\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", error);
}).then(() => {
  bootSettingsPrefetchMs = bootSettingsStartedAt ? Math.round(performance.now() - bootSettingsStartedAt) : null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled)
        return;
      settled = true;
      resolve();
    };
    // 窗口被遮挡/最小化时 rAF 会暂停；此时直接放行，避免界面永远停在骨架。
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      finish();
      return;
    }
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => setTimeout(finish, 0));
    else
      setTimeout(finish, 0);
    setTimeout(finish, 500);
  });
}).then(() => {
  var app = new AppController();
  app.init();
});