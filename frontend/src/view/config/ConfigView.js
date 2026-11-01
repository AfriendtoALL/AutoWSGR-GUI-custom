"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigView = void 0;
var lootPlans_js_1 = require_lootPlans();
var decisiveAutomation_js_1 = require_decisiveAutomation();
var campaign_js_1 = require_campaign();
var ConfigAutomationView_1 = require_ConfigAutomationView();
var ConfigRuntimeView_1 = require_ConfigRuntimeView();
var settingSelectWidth_1 = require_settingSelectWidth();
function element(id) {
  const target = document.getElementById(id);
  if (!target)
    throw new Error(`\u8BBE\u7F6E\u63A7\u4EF6\u4E0D\u5B58\u5728: ${id}`);
  return target;
}
var ConfigView = class {
  constructor() {
    this.configTabs = Array.from(document.querySelectorAll("[data-config-tab]"));
    this.configPanels = Array.from(document.querySelectorAll("[data-config-panel]"));
    this.configTabDescription = document.getElementById("config-tab-description");
    this.guiUpdateActive = false;
    this.backendUpdateActive = false;
    this.automationView = new ConfigAutomationView_1.ConfigAutomationView();
    this.runtimeView = new ConfigRuntimeView_1.ConfigRuntimeView();
    this.emuType = element("cfg-emu-type");
    this.emuPath = element("cfg-emu-path");
    this.emuSerial = element("cfg-emu-serial");
    this.adbDeviceList = document.getElementById("cfg-adb-device-list");
    this.gameApp = element("cfg-game-app");
    this.updateMode = element("cfg-update-mode");
    this.backendUpdateMode = element("cfg-backend-update-mode");
    this.backendUpdateRow = element("cfg-backend-update-row");
    this.backendUpdateButton = element("btn-check-backend-updates");
    this.guiUpdateButton = element("btn-check-updates");
    this.allowTestUpdates = element("cfg-allow-test-updates");
    this.autoExpedition = element("cfg-auto-expedition");
    this.expeditionInterval = element("cfg-expedition-interval");
    this.autoBattle = element("cfg-auto-battle");
    this.battleType = element("cfg-battle-type");
    this.autoExercise = element("cfg-auto-exercise");
    this.exerciseFleetId = element("cfg-exercise-fleet");
    this.battleTimes = element("cfg-battle-times");
    this.autoNormalFight = element("cfg-auto-normal-fight");
    this.autoDecisive = element("cfg-auto-decisive");
    this.decisiveTemplate = element("cfg-decisive-template");
    this.autoLoot = element("cfg-auto-loot");
    this.lootStopCount = element("cfg-loot-stop-count");
    this.logLevel = element("cfg-log-level");
    this.logRoot = element("cfg-log-root");
    this.guiLogRoot = element("cfg-gui-log-root");
    this.themeMode = element("cfg-theme-mode");
    this.accentColor = element("cfg-accent-color");
    this.accentLabel = element("cfg-accent-label");
    this.debugMode = element("cfg-debug-mode");
    this.backendPort = element("cfg-backend-port");
    this.backendStartupMode = element("cfg-use-external-backend");
    this.backendRepoPath = element("cfg-backend-repo-path");
    this.ocrGpuMode = element("cfg-ocr-gpu-mode");
    this.ocrGpu = element("cfg-ocr-gpu");
    this.ocrMirror = element("cfg-ocr-mirror");
    this.enhancedShipOcr = element("cfg-enhanced-ship-ocr");
    this.ocrConfidence = element("cfg-ocr-confidence");
    this.ocrConfidenceRange = element("cfg-ocr-confidence-range");
    this.shipNameAliases = element("cfg-ship-name-aliases");
    this.shipNameCorrections = element("cfg-ship-name-corrections");
    this.cudaPath = element("cfg-cuda-path");
    this.saveBackendScreenshots = element("cfg-save-backend-screenshots");
    this.debugAdvancedWrap = document.getElementById("cfg-debug-advanced");
    this.backendRepoWrap = document.getElementById("cfg-backend-repo-wrap");
    this.pythonPath = element("cfg-python-path");
    this.defaultWindowWidth = element("cfg-window-width");
    this.defaultWindowHeight = element("cfg-window-height");
    this.rememberWindowBounds = element("cfg-remember-window-bounds");
    this.delayMin = element("cfg-delay-min");
    this.delayMinRange = element("cfg-delay-min-range");
    this.delayMax = element("cfg-delay-max");
    this.delayMaxRange = element("cfg-delay-max-range");
    this.dockFullDestroy = element("cfg-dock-full-destroy");
    this.repairManually = element("cfg-repair-manually");
    this.destroyShipWorkMode = element("cfg-destroy-ship-mode");
    this.destroyShipTypes = element("cfg-destroy-ship-types");
    this.removeEquipmentMode = element("cfg-remove-equipment-mode");
    this.planRoot = element("cfg-plan-root");
    for (const tab of this.configTabs) {
      tab.addEventListener("click", () => this.showConfigTab(tab.dataset["configTab"] ?? "system"));
    }
    this.showConfigTab("system");
    this.accentColor.addEventListener("input", () => {
      this.accentLabel.textContent = this.accentColor.value;
    });
    this.debugMode.addEventListener("change", () => {
      this.updateDebugAdvancedVisibility();
      this.updateBackendRepoVisibility();
    });
    this.allowTestUpdates.addEventListener("change", () => this.updateUpdateButtons());
    this.updateMode.addEventListener("change", () => this.updateUpdateButtons());
    this.backendUpdateMode.addEventListener("change", () => this.updateUpdateButtons());
    this.backendStartupMode.addEventListener("change", () => {
      this.updateBackendRepoVisibility();
      this.updateUpdateButtons();
    });
    this.cudaPath.addEventListener("input", () => {
      const hasPath = this.cudaPath.value.trim().length > 0;
      this.setCudaStatus(hasPath ? "\u5F85\u68C0\u6D4B" : "\u7CFB\u7EDF\u73AF\u5883", "unknown", hasPath ? "CUDA \u8DEF\u5F84\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u70B9\u51FB\u68C0\u6D4B" : "CUDA \u8DEF\u5F84\u7559\u7A7A\uFF0C\u5C06\u68C0\u6D4B\u5F53\u524D\u7CFB\u7EDF\u73AF\u5883");
    });
    this.bindNumberRange(this.delayMinRange, this.delayMin);
    this.bindNumberRange(this.delayMaxRange, this.delayMax);
    this.bindNumberRange(this.ocrConfidenceRange, this.ocrConfidence);
    this.ocrGpuMode.addEventListener("change", () => {
      if (this.ocrGpuMode.value === "cpu")
        this.ocrGpu.checked = false;
      if (this.ocrGpuMode.value === "cuda")
        this.ocrGpu.checked = true;
    });
    this.ocrGpu.addEventListener("change", () => {
      this.ocrGpuMode.value = this.ocrGpu.checked ? "cuda" : "cpu";
    });
    document.querySelectorAll("#page-config select.input").forEach((select) => (0, settingSelectWidth_1.updateSettingSelectWidth)(select));
  }
  bindActions(actions) {
    const bindClick = (id, action) => {
      document.getElementById(id)?.addEventListener("click", action);
    };
    bindClick("btn-save-config", actions.onSave);
    bindClick("btn-open-config-dir", actions.onOpenConfigDir);
    bindClick("btn-browse-emu", actions.onBrowseEmulator);
    bindClick("btn-browse-python", actions.onBrowsePython);
    bindClick("btn-browse-backend-repo", actions.onBrowseBackendRepo);
    bindClick("btn-browse-cuda", actions.onBrowseCuda);
    bindClick("btn-browse-log-root", actions.onBrowseLogRoot);
    bindClick("btn-browse-gui-log-root", actions.onBrowseGuiLogRoot);
    bindClick("btn-browse-plan-root", actions.onBrowsePlanRoot);
    bindClick("btn-add-normal-fight-task", actions.onAddNormalFightTask);
    bindClick("btn-load-loot-plans", actions.onLoadLootPlans);
    bindClick("btn-check-backend", actions.onCheckBackend);
    bindClick("btn-validate-cuda", actions.onValidateCuda);
    bindClick("btn-validate-python", actions.onValidatePython);
    bindClick("btn-check-updates", actions.onCheckUpdates);
    bindClick("btn-check-backend-updates", actions.onCheckBackendUpdates);
    bindClick("btn-update-ship-library", actions.onUpdateShipLibrary);
    bindClick("btn-connect-adb", actions.onConnectAdb);
    bindClick("btn-disconnect-adb", actions.onDisconnectAdb);
    bindClick("btn-check-adb", actions.onCheckAdb);
    bindClick("btn-reset-accent", actions.onResetAccent);
    this.themeMode.addEventListener("change", () => actions.onThemeModeChange(this.themeMode.value));
    this.accentColor.addEventListener("input", () => actions.onAccentColorInput(this.accentColor.value));
  }
  /** 用 ViewObject 填充表单。 */
  render(vo) {
    this.emuType.value = vo.emulatorType;
    this.emuPath.value = vo.emulatorPath;
    this.emuSerial.value = vo.emulatorSerial;
    this.gameApp.value = vo.gameApp;
    this.updateMode.value = vo.updateMode;
    this.backendUpdateMode.value = vo.backendUpdateMode;
    this.allowTestUpdates.checked = vo.allowTestUpdates;
    this.autoExpedition.checked = vo.autoExpedition;
    this.expeditionInterval.value = String(vo.expeditionInterval);
    this.autoBattle.checked = vo.autoBattle;
    this.battleType.value = vo.battleType;
    this.autoExercise.checked = vo.autoExercise;
    this.exerciseFleetId.value = String(vo.exerciseFleetId);
    this.battleTimes.value = String(vo.battleTimes);
    this.autoNormalFight.checked = vo.autoNormalFight;
    this.automationView.showNormalFightTasks(vo.normalFightTasks, vo.normalFightRemaining);
    this.autoDecisive.checked = vo.autoDecisive;
    this.decisiveTemplate.value = vo.decisiveTemplateId;
    this.automationView.showLootPlans(vo.lootPlans, vo.lootPlanSource, vo.lootPlanId);
    this.autoLoot.checked = vo.autoLoot && this.automationView.hasLootPlans();
    this.lootStopCount.value = String(vo.lootStopCount);
    this.logLevel.value = vo.logLevel;
    this.logRoot.value = vo.logRoot;
    this.guiLogRoot.value = vo.guiLogRoot;
    this.themeMode.value = vo.themeMode;
    this.accentColor.value = vo.accentColor;
    this.accentLabel.textContent = vo.accentColor;
    this.debugMode.checked = vo.debugMode;
    this.backendPort.value = String(vo.backendPort);
    this.backendStartupMode.checked = vo.backendStartupMode === "external";
    this.backendRepoPath.value = vo.backendRepoPath;
    this.ocrGpuMode.value = vo.ocrGpuMode;
    this.ocrGpu.checked = vo.ocrGpu;
    this.ocrMirror.value = vo.ocrMirror;
    this.enhancedShipOcr.checked = vo.enhancedShipOcr;
    this.setRangeValue(this.ocrConfidenceRange, this.ocrConfidence, vo.ocrConfidence);
    this.shipNameAliases.value = vo.shipNameAliasesText;
    this.shipNameCorrections.value = vo.shipNameCorrectionsText;
    this.cudaPath.value = vo.cudaPath;
    this.setCudaStatus(vo.cudaPath ? "\u5F85\u68C0\u6D4B" : "\u7CFB\u7EDF\u73AF\u5883", "unknown", vo.cudaPath ? "\u5DF2\u914D\u7F6E CUDA \u8DEF\u5F84\uFF0C\u8BF7\u70B9\u51FB\u68C0\u6D4B" : "CUDA \u8DEF\u5F84\u7559\u7A7A\uFF0C\u5C06\u68C0\u6D4B\u5F53\u524D\u7CFB\u7EDF\u73AF\u5883");
    this.saveBackendScreenshots.checked = vo.saveBackendScreenshots;
    this.pythonPath.value = vo.pythonPath;
    this.defaultWindowWidth.value = String(vo.defaultWindowWidth);
    this.defaultWindowHeight.value = String(vo.defaultWindowHeight);
    this.rememberWindowBounds.checked = vo.rememberWindowBounds;
    this.setRangeValue(this.delayMinRange, this.delayMin, vo.operationDelayMin);
    this.setRangeValue(this.delayMaxRange, this.delayMax, vo.operationDelayMax);
    this.dockFullDestroy.checked = vo.dockFullDestroy;
    this.repairManually.value = String(vo.repairManually);
    this.destroyShipWorkMode.value = String(vo.destroyShipWorkMode);
    this.removeEquipmentMode.checked = vo.removeEquipmentMode;
    this.planRoot.value = vo.planRoot;
    for (const checkbox of Array.from(this.destroyShipTypes.querySelectorAll('input[type="checkbox"]'))) {
      checkbox.checked = vo.destroyShipTypes.includes(checkbox.value);
    }
    this.updateDebugAdvancedVisibility();
    this.updateBackendRepoVisibility();
    this.updateUpdateButtons();
  }
  /** 收集并校验当前表单。 */
  collect() {
    const operationDelayMin = this.clamp(this.delayMin.value, 0, 10, 0);
    const operationDelayMax = this.clamp(this.delayMax.value, 0, 10, 0);
    if (operationDelayMin > operationDelayMax) {
      throw new Error("\u5168\u5C40\u5EF6\u8FDF\u7684\u6700\u5C0F\u503C\u4E0D\u80FD\u5927\u4E8E\u6700\u5927\u503C");
    }
    const selectedLootPlan = this.automationView.selectedLootPlan();
    if (this.autoLoot.checked && !selectedLootPlan) {
      throw new Error("\u542F\u7528\u81EA\u52A8\u80D6\u6B21\u524D\u5FC5\u987B\u5148\u52A0\u8F7D\u5E76\u9009\u62E9\u51FA\u5F81\u8BA1\u5212");
    }
    return {
      emulatorType: this.emuType.value,
      emulatorPath: this.emuPath.value.trim(),
      emulatorSerial: this.emuSerial.value.trim(),
      gameApp: this.gameApp.value,
      updateMode: this.updateMode.value === "manual" ? "manual" : "auto",
      backendUpdateMode: this.backendUpdateMode.value === "manual" ? "manual" : "auto",
      allowTestUpdates: this.allowTestUpdates.checked,
      autoExpedition: this.autoExpedition.checked,
      expeditionInterval: this.clamp(this.expeditionInterval.value, 1, 120, 15),
      autoBattle: this.autoBattle.checked,
      battleType: this.battleType.value,
      autoExercise: this.autoExercise.checked,
      exerciseFleetId: Math.trunc(this.clamp(this.exerciseFleetId.value, 1, 4, 1)),
      battleTimes: campaign_js_1.DAILY_CAMPAIGN_TIMES,
      autoNormalFight: this.autoNormalFight.checked,
      normalFightTasks: this.automationView.getNormalFightTasks(),
      normalFightRemaining: this.automationView.getNormalFightRemaining(),
      autoDecisive: this.autoDecisive.checked,
      decisiveTemplateId: (0, decisiveAutomation_js_1.normalizeDecisiveAutomationSource)(this.decisiveTemplate.value),
      autoLoot: this.autoLoot.checked,
      lootPlanSource: selectedLootPlan?.source ?? "system",
      lootPlanId: selectedLootPlan?.file ?? lootPlans_js_1.DEFAULT_LOOT_PLAN_ID,
      lootPlans: this.automationView.getLootPlans(),
      lootStopCount: Math.trunc(this.clamp(this.lootStopCount.value, 1, 50, 50)),
      logLevel: this.logLevel.value,
      logRoot: this.logRoot.value.trim() || "logs",
      guiLogRoot: this.guiLogRoot.value.trim() || "logs",
      themeMode: this.themeMode.value,
      accentColor: this.accentColor.value,
      debugMode: this.debugMode.checked,
      backendPort: Math.trunc(this.clamp(this.backendPort.value, 1, 65535, 8438)),
      backendStartupMode: this.backendStartupMode.checked ? "external" : "managed",
      backendRepoPath: this.backendRepoPath.value.trim(),
      ocrGpuMode: this.ocrGpuMode.value,
      ocrGpu: this.ocrGpu.checked,
      ocrMirror: this.ocrMirror.value,
      enhancedShipOcr: this.enhancedShipOcr.checked,
      ocrConfidence: this.clamp(this.ocrConfidence.value, 0, 1, 0.65),
      shipNameAliasesText: this.shipNameAliases.value,
      shipNameCorrectionsText: this.shipNameCorrections.value,
      cudaPath: this.cudaPath.value.trim(),
      saveBackendScreenshots: this.saveBackendScreenshots.checked,
      pythonPath: this.pythonPath.value.trim(),
      defaultWindowWidth: Math.trunc(this.clamp(this.defaultWindowWidth.value, 854, 1e4, 1280)),
      defaultWindowHeight: Math.trunc(this.clamp(this.defaultWindowHeight.value, 480, 1e4, 720)),
      rememberWindowBounds: this.rememberWindowBounds.checked,
      operationDelayMin,
      operationDelayMax,
      dockFullDestroy: this.dockFullDestroy.checked,
      repairManually: this.repairManually.value === "true",
      destroyShipWorkMode: Math.trunc(this.clamp(this.destroyShipWorkMode.value, 0, 2, 0)),
      destroyShipTypes: Array.from(this.destroyShipTypes.querySelectorAll('input[type="checkbox"]:checked'), (checkbox) => checkbox.value),
      removeEquipmentMode: this.removeEquipmentMode.checked,
      planRoot: this.planRoot.value.trim()
    };
  }
  setNormalFightPlan(task, fleetName, remaining) {
    this.automationView.setNormalFightPlan(task, fleetName, remaining);
  }
  getNormalFightTasks() {
    return this.automationView.getNormalFightTasks();
  }
  setNormalFightRemaining(tasks, remaining) {
    this.automationView.setNormalFightRemaining(tasks, remaining);
  }
  showConfigTab(tag) {
    const descriptions = {
      system: "\u7BA1\u7406\u8FD0\u884C\u73AF\u5883\u3001\u81EA\u52A8\u4EFB\u52A1\u3001\u65E5\u5FD7\u548C\u754C\u9762\u8BBE\u7F6E\u3002",
      behavior: "\u7BA1\u7406\u64CD\u4F5C\u5EF6\u8FDF\u3001OCR \u8BC6\u522B\u548C\u8230\u961F\u76F8\u5173\u884C\u4E3A\u3002"
    };
    for (const tab of this.configTabs) {
      const active = tab.dataset["configTab"] === tag;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    for (const panel of this.configPanels)
      panel.hidden = panel.dataset["configPanel"] !== tag;
    if (this.configTabDescription)
      this.configTabDescription.textContent = descriptions[tag] ?? "";
  }
  updateDebugAdvancedVisibility() {
    if (!this.debugAdvancedWrap)
      return;
    this.debugAdvancedWrap.style.display = this.debugMode.checked ? "" : "none";
    if (!this.debugMode.checked && this.backendRepoWrap)
      this.backendRepoWrap.style.display = "none";
  }
  updateBackendRepoVisibility() {
    if (!this.backendRepoWrap)
      return;
    const show = this.debugMode.checked && this.backendStartupMode.checked;
    this.backendRepoWrap.style.display = show ? "" : "none";
    this.backendRepoPath.required = show;
  }
  /**
   * 统一计算两个更新按钮（GUI/后端）的可用状态。
   * - 任一更新流程进行中（检查/下载/安装）时，两个按钮互斥置灰
   * - 自动更新模式下对应按钮置灰
   * - 后端按钮额外受 alpha 开关与外部后端启动方式约束
   */
  updateUpdateButtons() {
    const alphaEnabled = this.allowTestUpdates.checked;
    this.backendUpdateRow.hidden = !alphaEnabled;
    this.backendUpdateMode.disabled = !alphaEnabled;
    const anyActive = this.guiUpdateActive || this.backendUpdateActive;
    this.guiUpdateButton.disabled = this.updateMode.value === "auto" || anyActive;
    this.backendUpdateButton.disabled = !alphaEnabled || this.backendStartupMode.checked || this.backendUpdateMode.value === "auto" || anyActive;
  }
  getLootPlans() {
    return this.automationView.getLootPlans();
  }
  setLootPlans(plans) {
    this.automationView.setLootPlans(plans);
    if (!this.automationView.hasLootPlans())
      this.autoLoot.checked = false;
  }
  bindNumberRange(range, number) {
    range.addEventListener("input", () => {
      number.value = range.value;
    });
    number.addEventListener("input", () => {
      range.value = number.value;
    });
  }
  setRangeValue(range, number, value) {
    range.value = String(value);
    number.value = String(value);
  }
  clamp(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }
  setEmulatorPath(path) {
    this.emuPath.value = path;
  }
  setEmulatorSerial(serial) {
    this.emuSerial.value = serial;
  }
  setPythonPath(path) {
    this.pythonPath.value = path;
  }
  setBackendRepoPath(path) {
    this.backendRepoPath.value = path;
  }
  setLogRoot(path) {
    this.logRoot.value = path;
  }
  setGuiLogRoot(path) {
    this.guiLogRoot.value = path;
  }
  setPlanRoot(path) {
    this.planRoot.value = path;
  }
  setCudaPath(path) {
    this.cudaPath.value = path;
  }
  getEmulatorSerial() {
    return this.emuSerial.value.trim();
  }
  getCudaPath() {
    return this.cudaPath.value.trim();
  }
  getPythonPath() {
    return this.pythonPath.value.trim();
  }
  getBackendPort() {
    return Math.trunc(this.clamp(this.backendPort.value, 1, 65535, 8438));
  }
  setCudaStatus(text, status, details = text) {
    this.runtimeView.setCudaStatus(text, status, details);
  }
  setPythonStatus(text, status) {
    this.runtimeView.setPythonStatus(text, status);
  }
  setBackendStatus(text, status) {
    this.runtimeView.setBackendStatus(text, status);
  }
  setShipLibraryStatus(text, status, details = text) {
    this.runtimeView.setShipLibraryStatus(text, status, details);
  }
  setShipLibraryUpdateLabel(label) {
    this.runtimeView.setShipLibraryUpdateLabel(label);
  }
  setAdbStatus(text, status) {
    this.runtimeView.setAdbStatus(text, status);
  }
  /** 6.6：渲染检测到的设备列表；点击即回调选择。 */
  setAdbDevices(devices, onSelect, selectedSerial = "") {
    const container = this.adbDeviceList;
    if (!container)
      return;
    container.replaceChildren();
    const rows = Array.isArray(devices) ? devices : [];
    if (rows.length === 0) {
      const empty = document.createElement("span");
      empty.className = "adb-status adb-status-unknown";
      empty.textContent = "尚未检测";
      container.appendChild(empty);
      return;
    }
    for (const device of rows) {
      const serial = typeof device?.serial === "string" ? device.serial : "";
      if (!serial)
        continue;
      const status = typeof device?.status === "string" ? device.status : "unknown";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-small" + (serial === selectedSerial ? " btn-primary" : "");
      button.textContent = status === "device" ? `使用 ${serial}` : `${serial}（${status}）`;
      button.title = status === "device" ? `选择 ${serial} 并保存设置` : `设备当前状态：${status}`;
      button.disabled = status !== "device";
      button.addEventListener("click", () => onSelect?.(serial));
      container.appendChild(button);
    }
  }
  setCudaValidateLoading(loading) {
    this.runtimeView.setCudaValidateLoading(loading);
  }
  setPythonValidateLoading(loading) {
    this.runtimeView.setPythonValidateLoading(loading);
  }
  setShipLibraryUpdateLoading(loading) {
    this.runtimeView.setShipLibraryUpdateLoading(loading);
  }
  setBackendCheckLoading(loading) {
    this.runtimeView.setBackendCheckLoading(loading);
  }
  setAdbCheckLoading(loading) {
    this.runtimeView.setAdbCheckLoading(loading);
  }
  setAdbConnectionLoading(action, loading) {
    this.runtimeView.setAdbConnectionLoading(action, loading);
  }
  setUpdateCheckLoading(loading) {
    this.guiUpdateActive = loading;
    this.runtimeView.setUpdateCheckLoading(loading);
    this.updateUpdateButtons();
  }
  setGuiUpdateStatus(status) {
    this.runtimeView.setGuiUpdateStatus(status);
  }
  /** 由更新状态事件驱动：检查/下载/安装中置位，结束后复位并重算按钮置灰。 */
  setGuiUpdateActive(active) {
    this.guiUpdateActive = active;
    this.updateUpdateButtons();
  }
  setBackendUpdateCheckLoading(loading) {
    this.backendUpdateActive = loading;
    this.runtimeView.setBackendUpdateCheckLoading(loading);
    this.updateUpdateButtons();
  }
  setBackendUpdateStatus(status) {
    this.runtimeView.setBackendUpdateStatus(status);
  }
  resetAccentColor(defaultColor) {
    this.accentColor.value = defaultColor;
    this.accentLabel.textContent = defaultColor;
  }
};
exports.ConfigView = ConfigView;