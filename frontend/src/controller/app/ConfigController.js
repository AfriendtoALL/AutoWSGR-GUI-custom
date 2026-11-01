"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigController = void 0;
var ConfigModel_1 = require_ConfigModel();
var decisiveAutomation_js_1 = require_decisiveAutomation();
var YamlAdapter_1 = require_YamlAdapter();
var IpcAdapter_1 = require_IpcAdapter();
var StorageAdapter_1 = require_StorageAdapter();
var Logger_1 = require_Logger();
var theme_1 = require_theme();
var DialogHelper_1 = require_DialogHelper();
var GUI_AUTOMATION_FIELDS = [
  "expeditionInterval",
  "battleTimes",
  "autoDecisive",
  "decisiveTemplateId",
  "autoLoot",
  "lootPlanSource",
  "lootPlanId",
  "lootPlans",
  "lootStopCount"
];
function guiAutomationFieldMatches(left, right, field) {
  if (field === "lootPlans") {
    return JSON.stringify(left.lootPlans) === JSON.stringify(right.lootPlans);
  }
  return left[field] === right[field];
}
var ConfigController = class {
  constructor(host, gateway = (0, IpcAdapter_1.getSettingsGateway)()) {
    this.host = host;
    this.gateway = gateway;
    this.savedConfigSnapshot = null;
  }
  setConfigDir(configDir) {
    this.host.configDir = configDir;
  }
  setStartupController(startupCtrl) {
    this.host.startupCtrl = startupCtrl;
  }
  /** 当前表单是否与最近一次加载或成功保存的配置不同。 */
  hasUnsavedChanges() {
    if (this.savedConfigSnapshot === null)
      return false;
    try {
      return this.configSnapshot() !== this.savedConfigSnapshot;
    } catch {
      return true;
    }
  }
  /** 从磁盘加载 usersettings.yaml */
  async loadConfig() {
    const bridge = this.gateway;
    if (!bridge)
      return;
    let yamlStr = "";
    try {
      yamlStr = await bridge.readFile("usersettings.yaml");
    } catch {
      yamlStr = "";
    }
    if (yamlStr.trim()) {
      this.host.configModel.loadFromYaml(yamlStr);
      Logger_1.Logger.debug("usersettings.yaml \u5DF2\u52A0\u8F7D");
    } else {
      Logger_1.Logger.debug("usersettings.yaml \u672A\u627E\u5230\uFF0C\u81EA\u52A8\u521B\u5EFA\u9ED8\u8BA4\u914D\u7F6E");
      const defaultYaml = this.host.configModel.toYaml();
      await bridge.saveFile("usersettings.yaml", defaultYaml);
      Logger_1.Logger.info(`\u5DF2\u521B\u5EFA\u9ED8\u8BA4\u914D\u7F6E\u6587\u4EF6: ${this.host.configDir}\\usersettings.yaml`);
    }
    const stored = await bridge.getGuiAutomationSettings?.();
    const migrated = this.host.configModel.migratedGuiAutomation;
    const migratedDecisive = this.host.configModel.migratedLegacyDecisiveAutomation;
    const decisiveAutomation = {};
    if (typeof migratedDecisive.autoDecisive === "boolean") {
      decisiveAutomation.autoDecisive = migratedDecisive.autoDecisive;
    }
    if (migratedDecisive.templateId) {
      decisiveAutomation.decisiveTemplateId = (0, decisiveAutomation_js_1.normalizeDecisiveAutomationSource)(migratedDecisive.templateId);
    }
    const storedSettings = stored?.exists ? stored.settings : {};
    const merged = {
      ...migrated,
      ...decisiveAutomation,
      ...storedSettings
    };
    if (storedSettings.autoLoot === true && !Object.prototype.hasOwnProperty.call(storedSettings, "lootPlanId") && !Object.prototype.hasOwnProperty.call(migrated, "lootPlanId")) {
      merged.autoLoot = false;
    }
    this.host.configModel.replaceGuiAutomation(merged);
    const hasLegacyGuiAutomation = Object.keys(migrated).length > 0;
    const hasLegacyDecisiveAutomation = Object.keys(decisiveAutomation).length > 0;
    const storedIsPartial = stored?.exists === true && GUI_AUTOMATION_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(storedSettings, field));
    let guiAutomationMigrated = false;
    if (hasLegacyGuiAutomation || hasLegacyDecisiveAutomation || storedIsPartial) {
      if (typeof bridge.setGuiAutomationSettings !== "function") {
        Logger_1.Logger.warn("GUI \u81EA\u52A8\u5316\u914D\u7F6E\u8FC1\u79FB\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u65E7 YAML \u5B57\u6BB5\u5DF2\u4FDD\u7559");
      } else {
        const expected = structuredClone(this.host.configModel.currentGuiAutomation);
        const saved = await bridge.setGuiAutomationSettings(expected);
        for (const field of GUI_AUTOMATION_FIELDS) {
          if (!guiAutomationFieldMatches(saved, expected, field)) {
            throw new Error(`GUI \u81EA\u52A8\u5316\u914D\u7F6E\u56DE\u8BFB\u5B57\u6BB5\u4E0D\u4E00\u81F4: ${field}`);
          }
        }
        this.host.configModel.replaceGuiAutomation(saved);
        if (hasLegacyGuiAutomation) {
          this.host.configModel.markLegacyGuiAutomationMigrated();
          guiAutomationMigrated = true;
        }
      }
    }
    const decisiveMigrated = await this.migrateLegacyDecisiveAutomation();
    if (guiAutomationMigrated || decisiveMigrated) {
      await bridge.saveFile("usersettings.yaml", this.host.configModel.toYaml());
      Logger_1.Logger.info("\u5DF2\u5C06\u65E7\u7248\u914D\u7F6E\u8FC1\u79FB\u5230 gui_settings.json");
    }
    await this.applyYamlTheme();
  }
  /** 7.6/R35: YAML theme is the single source of truth; migrate legacy localStorage once. */
  async applyYamlTheme() {
    const model = this.host.configModel;
    if (!model.hasYamlTheme) {
      const legacyMode = (0, theme_1.getThemeMode)();
      const legacyAccent = (0, theme_1.getAccentColor)();
      model.update({ theme_mode: legacyMode, accent_color: legacyAccent });
      try {
        await this.gateway.saveFile("usersettings.yaml", model.toYaml());
        Logger_1.Logger.info(`[Theme] \u5DF2\u5C06\u65E7 localStorage \u4E3B\u9898\u8FC1\u79FB\u5230 usersettings.yaml\uFF1A${legacyMode}`);
      } catch (error) {
        Logger_1.Logger.warn(`[Theme] \u4E3B\u9898\u8FC1\u79FB\u5199\u56DE\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const cfg = model.current;
    (0, theme_1.setThemeFromYaml)(cfg.theme_mode, cfg.accent_color);
    StorageAdapter_1.browserStorageStore.set("themeMode", cfg.theme_mode);
    StorageAdapter_1.browserStorageStore.set("accentColor", cfg.accent_color);
    (0, theme_1.applyTheme)();
    Logger_1.Logger.setLevel(Logger_1.LOG_LEVEL_ALIASES[cfg.log.level] ?? "debug");
  }
  /**
   * 将旧版决战开关和模板升级为正式配置，并归档票数保留原值。
   * 只有主进程写入、回读和用户提示全部完成后才允许清理 YAML。
   */
  async migrateLegacyDecisiveAutomation() {
    const settings = this.host.configModel.migratedLegacyDecisiveAutomation;
    const invalidFields = this.host.configModel.unmigratedLegacyDecisiveFields;
    const suppliedFields = [
      "autoDecisive",
      "ticketReserve",
      "templateId"
    ];
    const supplied = suppliedFields.filter((field) => Object.prototype.hasOwnProperty.call(settings, field));
    if (supplied.length === 0) {
      if (invalidFields.length > 0) {
        await (0, DialogHelper_1.showAlert)("\u65E7\u7248\u51B3\u6218\u914D\u7F6E\u6682\u672A\u8FC1\u79FB", `\u4EE5\u4E0B\u5B57\u6BB5\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B\uFF0C\u5DF2\u7EE7\u7EED\u4FDD\u7559\u5728 usersettings.yaml\uFF1A
${invalidFields.join("\u3001")}`);
      }
      return false;
    }
    const bridge = this.gateway;
    if (typeof bridge?.migrateLegacyDecisiveAutomation !== "function") {
      await (0, DialogHelper_1.showAlert)("\u65E7\u7248\u51B3\u6218\u914D\u7F6E\u6682\u672A\u8FC1\u79FB", "\u5F53\u524D\u914D\u7F6E\u8FC1\u79FB\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u539F\u5B57\u6BB5\u4ECD\u4FDD\u7559\u5728 usersettings.yaml\u3002\u8BF7\u5B8C\u6574\u91CD\u542F GUI \u540E\u91CD\u8BD5\u3002");
      return false;
    }
    try {
      const verified = await bridge.migrateLegacyDecisiveAutomation(settings);
      for (const field of supplied) {
        if (verified[field] !== settings[field]) {
          throw new Error(`\u56DE\u8BFB\u5B57\u6BB5\u4E0D\u4E00\u81F4: ${field}`);
        }
      }
      const summary = this.legacyDecisiveMigrationSummary(settings);
      if (invalidFields.length > 0) {
        summary.push(`\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B\u5E76\u7EE7\u7EED\u4FDD\u7559\u5728 usersettings.yaml\uFF1A${invalidFields.join("\u3001")}`);
      }
      summary.push("", "\u81EA\u52A8\u51B3\u6218\u5F00\u5173\u548C\u6A21\u677F\u5DF2\u5347\u7EA7\u4E3A\u6B63\u5F0F GUI \u81EA\u52A8\u5316\u8BBE\u7F6E\uFF1B\u51B3\u6218\u7968\u4FDD\u7559\u4EC5\u65E0\u635F\u4FDD\u5B58\uFF0C\u4E0D\u53C2\u4E0E\u6267\u884C\u8F6E\u6570\u3002\u8FC1\u79FB\u4E0D\u4F1A\u8986\u76D6\u5F53\u524D\u51B3\u6218\u8BA1\u5212\u3002");
      await (0, DialogHelper_1.showAlert)("\u65E7\u7248\u51B3\u6218\u914D\u7F6E\u5DF2\u5347\u7EA7", summary.join("\n"));
      this.host.configModel.markLegacyDecisiveAutomationMigrated(settings);
      return true;
    } catch (error) {
      Logger_1.Logger.warn(`\u65E7\u7248\u51B3\u6218\u914D\u7F6E\u8FC1\u79FB\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      await (0, DialogHelper_1.showAlert)("\u65E7\u7248\u51B3\u6218\u914D\u7F6E\u8FC1\u79FB\u5931\u8D25", "\u539F\u5B57\u6BB5\u4ECD\u4FDD\u7559\u5728 usersettings.yaml\uFF0C\u5C06\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u91CD\u8BD5\u3002");
      return false;
    }
  }
  /** 生成人能直接核对的逐字段迁移结果。 */
  legacyDecisiveMigrationSummary(settings) {
    const summary = [];
    if (Object.prototype.hasOwnProperty.call(settings, "autoDecisive")) {
      summary.push(`\u81EA\u52A8\u51B3\u6218\uFF1A${settings.autoDecisive ? "\u5F00\u542F" : "\u5173\u95ED"}`);
    }
    if (Object.prototype.hasOwnProperty.call(settings, "ticketReserve")) {
      summary.push(`\u51B3\u6218\u7968\u4FDD\u7559\uFF1A${settings.ticketReserve}`);
    }
    if (Object.prototype.hasOwnProperty.call(settings, "templateId")) {
      summary.push(`\u51B3\u6218\u6A21\u677F\uFF1A${settings.templateId}`);
    }
    return summary;
  }
  /** 渲染配置视图 */
  renderConfig() {
    const cfg = this.host.configModel.current;
    const gui = this.host.configModel.currentGuiAutomation;
    const runtime = (0, IpcAdapter_1.getRuntimeSettings)();
    const windowPreferences = runtime.windowPreferences ?? {
      defaultWidth: 1280,
      defaultHeight: 720,
      rememberBounds: false,
      lastActivePage: "main"
    };
    const vo = {
      emulatorType: cfg.emulator.type,
      emulatorPath: cfg.emulator.path || "",
      emulatorSerial: cfg.emulator.serial || "",
      gameApp: cfg.account.game_app,
      updateMode: runtime.updateMode || (StorageAdapter_1.browserStorageStore.get("updateMode") === "manual" ? "manual" : "auto"),
      backendUpdateMode: runtime.backendUpdateMode || "auto",
      allowTestUpdates: runtime.allowTestUpdates === true,
      autoExpedition: cfg.daily_automation.auto_expedition,
      expeditionInterval: gui.expeditionInterval,
      autoBattle: cfg.daily_automation.auto_battle,
      battleType: cfg.daily_automation.battle_type,
      autoExercise: cfg.daily_automation.auto_exercise,
      exerciseFleetId: cfg.daily_automation.exercise_fleet_id ?? 1,
      battleTimes: gui.battleTimes,
      autoNormalFight: cfg.daily_automation.auto_normal_fight,
      normalFightTasks: cfg.daily_automation.normal_fight_tasks,
      normalFightRemaining: cfg.daily_automation.normal_fight_tasks.length > 0 ? this.host.normalFightDailyQuota.totalRemaining(cfg.daily_automation.normal_fight_tasks) : null,
      autoDecisive: gui.autoDecisive,
      decisiveTemplateId: gui.decisiveTemplateId,
      autoLoot: gui.autoLoot,
      lootPlanSource: gui.lootPlanSource,
      lootPlanId: gui.lootPlanId,
      lootPlans: structuredClone(gui.lootPlans),
      lootStopCount: gui.lootStopCount,
      logLevel: cfg.log.level,
      logRoot: cfg.log.root,
      guiLogRoot: (runtime.guiLogRoot || StorageAdapter_1.browserStorageStore.get("guiLogRoot")) || "logs",
      themeMode: cfg.theme_mode,
      accentColor: cfg.accent_color,
      debugMode: StorageAdapter_1.browserStorageStore.get("debugMode") === "true",
      backendPort: runtime.backendPort || 8438,
      backendStartupMode: runtime.backendStartupMode || "managed",
      backendRepoPath: runtime.backendRepoPath || "",
      ocrGpuMode: runtime.ocrGpuMode || "auto",
      ocrGpu: cfg.ocr.gpu,
      ocrMirror: cfg.ocr.mirror,
      enhancedShipOcr: cfg.ocr.enhanced_ship_ocr,
      ocrConfidence: cfg.ocr.ship_name_match_confidence,
      shipNameAliasesText: (0, YamlAdapter_1.formatStringMap)(cfg.ocr.ship_name_aliases),
      shipNameCorrectionsText: (0, YamlAdapter_1.formatStringMap)(cfg.ocr.ship_name_corrections),
      cudaPath: runtime.cudaPath || "",
      saveBackendScreenshots: runtime.saveBackendScreenshots === true,
      pythonPath: runtime.pythonPath || "",
      defaultWindowWidth: windowPreferences.defaultWidth,
      defaultWindowHeight: windowPreferences.defaultHeight,
      rememberWindowBounds: windowPreferences.rememberBounds,
      operationDelayMin: cfg.operation_delay_min,
      operationDelayMax: cfg.operation_delay_max,
      dockFullDestroy: cfg.dock_full_destroy,
      repairManually: cfg.repair_manually,
      destroyShipWorkMode: cfg.destroy_ship_work_mode,
      destroyShipTypes: cfg.destroy_ship_types,
      removeEquipmentMode: cfg.remove_equipment_mode,
      planRoot: cfg.plan_root ?? ""
    };
    this.host.configView.render(vo);
    this.savedConfigSnapshot = this.configSnapshot();
    Logger_1.Logger.setLevel(Logger_1.LOG_LEVEL_ALIASES[vo.logLevel] ?? "debug");
  }
  /** 保存配置并同步各组件 */
  async saveConfig() {
    let collected;
    let shipNameAliases;
    let shipNameCorrections;
    try {
      collected = this.host.configView.collect();
      shipNameAliases = (0, YamlAdapter_1.parseStringMap)(collected.shipNameAliasesText, "\u81EA\u5B9A\u4E49\u8230\u540D\u6620\u5C04");
      shipNameCorrections = (0, YamlAdapter_1.parseStringMap)(collected.shipNameCorrectionsText, "\u8BC6\u522B\u7EA0\u9519\u89C4\u5219");
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u8BBE\u7F6E\u683C\u5F0F\u9519\u8BEF", error instanceof Error ? error.message : String(error));
      return;
    }
    const bridge = this.gateway;
    if (!bridge || typeof bridge.commitGuiSettings !== "function") {
      await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", "\u8BBE\u7F6E\u4FDD\u5B58\u63A5\u53E3\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u5B8C\u6574\u91CD\u542F GUI \u540E\u518D\u64CD\u4F5C\u3002");
      return;
    }
    if (collected.backendStartupMode === "external" && !collected.backendRepoPath.trim()) {
      await (0, DialogHelper_1.showAlert)("\u8BF7\u914D\u7F6E\u672C\u5730\u540E\u7AEF\u8DEF\u5F84", "\u542F\u7528\u201C\u4F7F\u7528\u672C\u5730\u540E\u7AEF\u201D\u65F6\u5FC5\u987B\u9009\u62E9\u672C\u5730\u540E\u7AEF\u4ED3\u5E93\u8DEF\u5F84\u3002");
      return;
    }
    try {
      const candidateModel = new ConfigModel_1.ConfigModel();
      candidateModel.loadFromYaml(this.host.configModel.toYaml());
      candidateModel.replaceGuiAutomation(this.host.configModel.currentGuiAutomation);
      this.applyCollectedConfig(candidateModel, collected, shipNameAliases, shipNameCorrections);
      candidateModel.markLegacyGuiAutomationMigrated();
      const committed = await bridge.commitGuiSettings({
        updateMode: collected.updateMode,
        backendUpdateMode: collected.backendUpdateMode,
        allowTestUpdates: collected.allowTestUpdates,
        backendPort: collected.backendPort,
        backendStartupMode: collected.backendStartupMode,
        backendRepoPath: collected.backendRepoPath || null,
        ocrGpuMode: collected.ocrGpuMode,
        cudaPath: collected.cudaPath || null,
        saveBackendScreenshots: collected.saveBackendScreenshots,
        pythonPath: collected.pythonPath || null,
        guiLogRoot: collected.guiLogRoot,
        windowPreferences: {
          defaultWidth: collected.defaultWindowWidth,
          defaultHeight: collected.defaultWindowHeight,
          rememberBounds: collected.rememberWindowBounds
        },
        automation: candidateModel.currentGuiAutomation,
        usersettingsYaml: candidateModel.toYaml()
      });
      this.applyCollectedConfig(this.host.configModel, collected, shipNameAliases, shipNameCorrections);
      this.host.configModel.replaceGuiAutomation(committed.automation);
      this.host.configModel.markLegacyGuiAutomationMigrated();
      StorageAdapter_1.browserStorageStore.set("themeMode", collected.themeMode);
      StorageAdapter_1.browserStorageStore.set("accentColor", collected.accentColor);
      const savedTheme = this.host.configModel.current;
      (0, theme_1.setThemeFromYaml)(savedTheme.theme_mode, savedTheme.accent_color);
      StorageAdapter_1.browserStorageStore.set("debugMode", String(collected.debugMode));
      StorageAdapter_1.browserStorageStore.set("updateMode", collected.updateMode);
      StorageAdapter_1.browserStorageStore.set("guiLogRoot", collected.guiLogRoot);
      Logger_1.Logger.setLevel(Logger_1.LOG_LEVEL_ALIASES[collected.logLevel] ?? "debug");
      this.host.mainView.setDebugMode(collected.debugMode);
      (0, theme_1.applyTheme)();
      const da = this.host.configModel.current.daily_automation;
      const gui = this.host.configModel.currentGuiAutomation;
      this.host.cronScheduler.updateConfig({
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
      this.host.scheduler.setAutoExpedition(da.auto_expedition);
      this.host.scheduler.setExpeditionInterval(gui.expeditionInterval);
      this.refreshNormalFightRemaining();
      this.savedConfigSnapshot = this.configSnapshot(collected);
      (0, IpcAdapter_1.patchRuntimeSettings)({
        updateMode: collected.updateMode,
        backendUpdateMode: collected.backendUpdateMode,
        allowTestUpdates: collected.allowTestUpdates,
        backendPort: collected.backendPort,
        backendStartupMode: collected.backendStartupMode,
        backendRepoPath: collected.backendRepoPath,
        ocrGpuMode: collected.ocrGpuMode,
        cudaPath: collected.cudaPath,
        saveBackendScreenshots: collected.saveBackendScreenshots,
        pythonPath: collected.pythonPath,
        guiLogRoot: collected.guiLogRoot,
        windowPreferences: {
          ...(0, IpcAdapter_1.getRuntimeSettings)().windowPreferences,
          defaultWidth: collected.defaultWindowWidth,
          defaultHeight: collected.defaultWindowHeight,
          rememberBounds: collected.rememberWindowBounds
        }
      });
      Logger_1.Logger.info("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u540E\u7AEF\u542F\u52A8\u9879\u5C06\u5728\u91CD\u542F\u540E\u751F\u6548");
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u4FDD\u5B58\u5931\u8D25", error instanceof Error ? error.message : String(error));
      return;
    }
    (0, DialogHelper_1.showSaveSuccess)("\u8BBE\u7F6E\u4FDD\u5B58\u6210\u529F");
    if (this.host.scheduler.status === "not_connected") {
      const alive = await this.host.scheduler.ping();
      if (alive) {
        Logger_1.Logger.info("\u914D\u7F6E\u5DF2\u66F4\u65B0\uFF0C\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\u6A21\u62DF\u5668\u2026");
        this.host.startupCtrl?.startSystem();
      } else {
        Logger_1.Logger.warn("\u540E\u7AEF\u672A\u8FD0\u884C\uFF0C\u8BF7\u91CD\u542F\u5E94\u7528");
      }
    }
  }
  /** 使用已保存的自动出征任务刷新今日剩余次数。 */
  refreshNormalFightRemaining() {
    const tasks = this.host.configModel.current.daily_automation.normal_fight_tasks;
    this.host.configView.setNormalFightRemaining(tasks, this.host.normalFightDailyQuota.totalRemaining(tasks));
  }
  /** 使用统一的表单收集结果生成可比较快照。 */
  configSnapshot(collected = this.host.configView.collect()) {
    return JSON.stringify({
      ...collected,
      normalFightRemaining: null
    });
  }
  /** 把设置页输入应用到指定模型，供候选配置和正式提交复用。 */
  applyCollectedConfig(model, collected, shipNameAliases, shipNameCorrections) {
    model.update({
      theme_mode: collected.themeMode === "dark" || collected.themeMode === "system" ? collected.themeMode : "light",
      accent_color: /^#[0-9a-f]{6}$/i.test(collected.accentColor) ? collected.accentColor : "#0f7dff",
      emulator: {
        type: collected.emulatorType,
        path: collected.emulatorPath || void 0,
        serial: collected.emulatorSerial || void 0
      },
      account: { game_app: collected.gameApp },
      ocr: {
        ...model.current.ocr,
        gpu: collected.ocrGpu,
        mirror: collected.ocrMirror,
        enhanced_ship_ocr: collected.enhancedShipOcr,
        ship_name_match_confidence: collected.ocrConfidence,
        ship_name_aliases: shipNameAliases,
        ship_name_corrections: shipNameCorrections
      },
      log: {
        ...model.current.log,
        level: collected.logLevel,
        root: collected.logRoot,
        // 调试模式设置同时作用于后端：控制各通道 DEBUG 输出开关
        show_emulator_debug: collected.debugMode,
        show_ui_debug: collected.debugMode,
        show_vision_debug: collected.debugMode,
        show_ops_debug: collected.debugMode,
        show_combat_state_debug: collected.debugMode,
        show_combat_recognition_debug: collected.debugMode
      },
      daily_automation: {
        ...model.current.daily_automation,
        auto_expedition: collected.autoExpedition,
        auto_battle: collected.autoBattle,
        battle_type: collected.battleType,
        auto_exercise: collected.autoExercise,
        exercise_fleet_id: collected.exerciseFleetId,
        auto_normal_fight: collected.autoNormalFight,
        normal_fight_tasks: collected.normalFightTasks
      },
      operation_delay_min: collected.operationDelayMin,
      operation_delay_max: collected.operationDelayMax,
      dock_full_destroy: collected.dockFullDestroy,
      repair_manually: collected.repairManually,
      destroy_ship_work_mode: collected.destroyShipWorkMode,
      destroy_ship_types: collected.destroyShipTypes,
      remove_equipment_mode: collected.removeEquipmentMode,
      plan_root: collected.planRoot || void 0
    });
    model.updateGuiAutomation({
      expeditionInterval: collected.expeditionInterval,
      battleTimes: collected.battleTimes,
      autoDecisive: collected.autoDecisive,
      decisiveTemplateId: collected.decisiveTemplateId,
      autoLoot: collected.autoLoot,
      lootPlanSource: collected.lootPlanSource,
      lootPlanId: collected.lootPlanId,
      lootPlans: collected.lootPlans,
      lootStopCount: collected.lootStopCount
    });
  }
  /** 自动检测模拟器信息，仅在配置为空时填充 */
  async detectAndApplyEmulator() {
    const bridge = this.gateway;
    if (!bridge?.detectEmulator)
      return;
    const cfg = this.host.configModel.current;
    if (cfg.emulator.path && cfg.emulator.serial)
      return;
    try {
      const result = await bridge.detectEmulator();
      if (!result)
        return;
      const patch = {};
      if (!cfg.emulator.path && result.path)
        patch.path = result.path;
      if (!cfg.emulator.serial && result.serial)
        patch.serial = result.serial;
      if (result.type)
        patch.type = result.type;
      if (Object.keys(patch).length > 0) {
        this.host.configModel.update({
          emulator: { ...cfg.emulator, ...patch }
        });
        const yamlStr = this.host.configModel.toYaml();
        await bridge.saveFile("usersettings.yaml", yamlStr);
        Logger_1.Logger.debug(`\u81EA\u52A8\u68C0\u6D4B\u5230\u6A21\u62DF\u5668: type=${result.type} path=${result.path} serial=${result.serial}`);
      }
    } catch (e) {
      Logger_1.Logger.debug(`\u6A21\u62DF\u5668\u81EA\u52A8\u68C0\u6D4B\u5931\u8D25: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  /** 首次运行引导向导 */
  showSetupWizard() {
    const cfg = this.host.configModel.current;
    this.host.setupView.show({
      emuType: cfg.emulator.type || "\u96F7\u7535",
      serial: cfg.emulator.serial || "",
      pythonPath: ""
    });
    return new Promise((resolve) => {
      this.host.setupView.onCheckAdb = async () => {
        const bridge = this.gateway;
        if (!bridge?.checkAdbDevices)
          return;
        this.host.setupView.setCheckAdbLoading(true);
        try {
          const devices = await bridge.checkAdbDevices();
          const online = devices.filter((d) => d.status === "device");
          if (online.length > 0) {
            this.host.setupView.setSerialValue(online[0].serial);
            this.host.setupView.setSerialHint(`\u5DF2\u68C0\u6D4B\u5230\u8BBE\u5907: ${online.map((d) => d.serial).join(", ")}`, "info");
          } else {
            this.host.setupView.setSerialHint("\u672A\u53D1\u73B0\u5728\u7EBF\u8BBE\u5907\uFF0C\u8BF7\u786E\u8BA4\u6A21\u62DF\u5668\u5DF2\u542F\u52A8\u3002", "error");
          }
        } catch {
          this.host.setupView.setSerialHint("\u68C0\u6D4B\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u586B\u5199\u3002", "error");
        } finally {
          this.host.setupView.setCheckAdbLoading(false);
        }
      };
      this.host.setupView.onConfirm = async () => {
        const vals = this.host.setupView.collectValues();
        if (!vals.serial) {
          this.host.setupView.setSerialHint("\u8BF7\u586B\u5199 ADB serial\uFF08\u4E0D\u80FD\u4E3A\u7A7A\uFF09", "error");
          this.host.setupView.focusSerial();
          return;
        }
        this.host.configModel.update({
          emulator: {
            type: vals.emuType,
            serial: vals.serial
          }
        });
        const pyPath = vals.pythonPath || null;
        if (this.gateway?.setPythonPath) {
          await this.gateway.setPythonPath(pyPath);
          (0, IpcAdapter_1.patchRuntimeSettings)({ pythonPath: pyPath || "" });
        }
        const bridge = this.gateway;
        if (bridge) {
          await bridge.saveFile("usersettings.yaml", this.host.configModel.toYaml());
        }
        StorageAdapter_1.browserStorageStore.set("setupComplete", "true");
        this.host.setupView.hide();
        Logger_1.Logger.info(`\u521D\u59CB\u914D\u7F6E\u5B8C\u6210: \u6A21\u62DF\u5668=${vals.emuType}, serial=${vals.serial}`);
        resolve();
      };
    });
  }
};
exports.ConfigController = ConfigController;