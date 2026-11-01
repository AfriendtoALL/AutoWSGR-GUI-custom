"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
var NormalFightDailyQuota_js_1 = require_NormalFightDailyQuota();
var ApiClient_1 = require_ApiClient();
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
var theme_1 = require_theme();
var IpcAdapter_js_1 = require_IpcAdapter();
var StorageAdapter_js_1 = require_StorageAdapter();
var SettingsController = class {
  constructor(host, gateway = (0, IpcAdapter_js_1.getSettingsGateway)()) {
    this.host = host;
    this.gateway = gateway;
    this.shipLibraryUpdating = false;
    this.shipLibraryUpdateTarget = "wiki";
  }
  bindActions() {
    const { configView } = this.host;
    (0, IpcAdapter_js_1.bindIpcSubscription)("settings-ship-library", () =>           this.gateway?.onShipLibraryUpdateProgress((progress) => {
      if (this.shipLibraryUpdating) {
        configView.setShipLibraryStatus(progress.message, "unknown");
      }
    }));
    (0, IpcAdapter_js_1.bindIpcSubscription)("settings-gui-update", () =>           this.gateway?.onUpdateStatus((status) => {
      configView.setGuiUpdateActive(status.status === "checking" || status.status === "downloading" || status.status === "installing");
      configView.setGuiUpdateStatus(status);
    }));
    (0, IpcAdapter_js_1.bindIpcSubscription)("settings-backend-update", () =>           this.gateway?.onBackendUpdateStatus((status) => {
      configView.setBackendUpdateCheckLoading(status.status === "checking" || status.status === "available" || status.status === "downloading");
      configView.setBackendUpdateStatus(status);
    }));
    configView.bindActions({
      onSave: () => void this.host.saveConfig(),
      onOpenConfigDir: () => this.openFolder(this.host.getConfigDir()),
      onBrowseEmulator: () => void this.browseDirectory("\u9009\u62E9\u6A21\u62DF\u5668\u5B89\u88C5\u76EE\u5F55", (path) => configView.setEmulatorPath(path)),
      onBrowsePython: () => void this.browsePython(),
      onBrowseBackendRepo: () => void this.browseDirectory("\u9009\u62E9\u672C\u5730\u540E\u7AEF\u4ED3\u5E93\u76EE\u5F55", (path) => configView.setBackendRepoPath(path)),
      onBrowseCuda: () => void this.browseDirectory("\u9009\u62E9 CUDA Toolkit \u6839\u76EE\u5F55/bin \u6216 PyTorch torch\\lib \u76EE\u5F55", (path) => configView.setCudaPath(path)),
      onBrowseLogRoot: () => void this.browseDirectory("\u9009\u62E9\u540E\u7AEF\u65E5\u5FD7\u76EE\u5F55", (path) => configView.setLogRoot(path)),
      onBrowseGuiLogRoot: () => void this.browseDirectory("\u9009\u62E9 GUI \u65E5\u5FD7\u76EE\u5F55", (path) => configView.setGuiLogRoot(path)),
      onBrowsePlanRoot: () => void this.browseDirectory("\u9009\u62E9\u540E\u7AEF\u4F5C\u6218\u65B9\u6848\u6839\u76EE\u5F55", (path) => configView.setPlanRoot(path)),
      onAddNormalFightTask: () => void this.selectAutomationPlan(),
      onLoadLootPlans: () => void this.selectLootAutomationPlans(),
      onCheckBackend: () => void this.checkBackend(),
      onValidateCuda: () => void this.validateCuda(),
      onValidatePython: () => void this.validatePython(),
      onCheckUpdates: () => void this.checkUpdatesManually(),
      onCheckBackendUpdates: () => void this.checkBackendUpdates(),
      onUpdateShipLibrary: () => void this.updateShipLibrary(),
      onConnectAdb: () => void this.changeAdbConnection("connect"),
      onDisconnectAdb: () => void this.changeAdbConnection("disconnect"),
      onCheckAdb: () => void this.checkAdbDevices(),
      onResetAccent: () => {
        configView.resetAccentColor("#0f7dff");
        StorageAdapter_js_1.browserStorageStore.set("accentColor", "#0f7dff");
        (0, theme_1.previewTheme)(void 0, "#0f7dff");
        (0, theme_1.applyTheme)();
      },
      onThemeModeChange: (mode) => {
        StorageAdapter_js_1.browserStorageStore.set("themeMode", mode);
        (0, theme_1.previewTheme)(mode, void 0);
        (0, theme_1.applyTheme)();
      },
      onAccentColorInput: (color) => {
        StorageAdapter_js_1.browserStorageStore.set("accentColor", color);
        (0, theme_1.previewTheme)(void 0, color);
        (0, theme_1.applyTheme)();
      }
    });
  }
  /** 6.6：合并后端 endpoint、IPC adb devices，并按需探测常见 MuMu 端口。 */
  async collectAdbDevices(options = {}) {
    const devices = /* @__PURE__ */ new Map();
    const add = (serial, status) => {
      const value = typeof serial === "string" ? serial.trim() : "";
      if (!value)
        return;
      const state = typeof status === "string" && status.trim() ? status.trim() : "unknown";
      const previous = devices.get(value);
      if (!previous || previous.status !== "device")
        devices.set(value, { serial: value, status: state });
    };
    if (!this.gateway)
      return [];
    if (options.probePorts && this.gateway.connectAdbDevice) {
      const ports = ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:62001"];
      await Promise.allSettled(ports.map((serial) => Promise.race([
        this.gateway.connectAdbDevice(serial),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500))
      ])));
    }
    try {
      const backend = await this.host.listEmulatorDevices?.();
      if (Array.isArray(backend)) {
        for (const device of backend)
          add(device?.serial, device?.status);
      }
    } catch {
    }
    try {
      const ipcDevices = await this.gateway.checkAdbDevices();
      if (Array.isArray(ipcDevices)) {
        for (const device of ipcDevices)
          add(device?.serial, device?.status);
      }
    } catch {
    }
    return [...devices.values()].sort((left, right) => {
      const leftOnline = left.status === "device" ? 0 : 1;
      const rightOnline = right.status === "device" ? 0 : 1;
      return leftOnline - rightOnline || left.serial.localeCompare(right.serial);
    });
  }
  /** 6.6：一键选择设备后写入 usersettings；saveConfig 会同步运行时配置缓存。 */
  async applyDeviceSelection(serial) {
    const value = typeof serial === "string" ? serial.trim() : "";
    if (!value)
      return false;
    const { configView } = this.host;
    configView.setEmulatorSerial(value);
    configView.setAdbStatus(`已选择 (${value})`, "unknown");
    try {
      await this.host.saveConfig();
      Logger_1.Logger.info(`已选择 ADB 设备: ${value}`);
      return true;
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("保存设备失败", error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      void this.refreshAdbStatus();
    }
  }
  async refreshAdbStatus() {
    const { configView } = this.host;
    configView.setAdbStatus("\u68C0\u6D4B\u4E2D\u2026", "unknown");
    if (!this.gateway) {
      configView.setAdbStatus("ADB \u529F\u80FD\u4E0D\u53EF\u7528", "offline");
      return;
    }
    try {
      const devices = await this.collectAdbDevices();
      const online = devices.filter((device) => device.status === "device");
      const configuredSerial = configView.getEmulatorSerial();
      configView.setAdbDevices(devices, (serial) => void this.applyDeviceSelection(serial), configuredSerial);
      if (configuredSerial && online.some((device) => device.serial === configuredSerial)) {
        configView.setAdbStatus(`\u5728\u7EBF (${configuredSerial})`, "online");
      } else if (online.length > 0) {
        configView.setAdbStatus(`\u5F53\u524D\u5730\u5740\u672A\u8FDE\u63A5\uFF08\u53D1\u73B0 ${online.map((device) => device.serial).join(", ")}\uFF09`, "offline");
      } else {
        configView.setAdbStatus("\u672A\u53D1\u73B0\u5728\u7EBF\u8BBE\u5907", "offline");
      }
    } catch {
      configView.setAdbStatus("ADB \u68C0\u6D4B\u5931\u8D25", "offline");
    }
  }
  async refreshShipLibraryStatus(ignoreUpdating = false) {
    if (this.shipLibraryUpdating && !ignoreUpdating)
      return;
    if (!this.gateway)
      return;
    try {
      const status = await this.gateway.getShipLibraryStatus();
      if (status.error) {
        this.setShipLibraryUpdateAction("wiki", "\u66F4\u65B0\u8230\u8239\u6570\u636E\u5E93");
        this.host.configView.setShipLibraryStatus("\u8230\u8239\u6570\u636E\u5E93\u72B6\u6001\u5F02\u5E38", "error", status.error);
        Logger_1.Logger.error(`\u8230\u8239\u6570\u636E\u5E93\u72B6\u6001\u5F02\u5E38\uFF1A${status.error}`);
      } else if (!status.exists || status.shipCount <= 0) {
        this.setShipLibraryUpdateAction("wiki", "\u66F4\u65B0\u8230\u8239\u6570\u636E\u5E93");
        this.host.configView.setShipLibraryStatus("Wiki \u8239\u5E93\u5C1A\u672A\u540C\u6B65", "error");
      } else if (status.missingAssets > 0) {
        this.setShipLibraryUpdateAction("wiki", "\u66F4\u65B0\u8230\u8239\u6570\u636E\u5E93");
        this.host.configView.setShipLibraryStatus(`Wiki \u8239\u5E93\u672A\u540C\u6B65\u5B8C\u6574\uFF0C\u7F3A\u5C11 ${status.missingAssets} \u4E2A\u8D44\u6E90`, "error");
      } else if (status.backendSynchronized !== true) {
        this.setShipLibraryUpdateAction("backend", "\u540C\u6B65\u540E\u7AEF");
        const missingRecords = status.backendMissingRecords ?? 0;
        const missingAliases = status.backendMissingAliases ?? 0;
        const missing = missingRecords + missingAliases;
        const detail = status.backendError ? `\u540E\u7AEF\u6838\u5BF9\u5931\u8D25\uFF1A${status.backendError}` : `\u540E\u7AEF\u7F3A\u5C11 ${missing} \u6761\u8230\u540D`;
        this.host.configView.setShipLibraryStatus(status.backendError ? "\u540E\u7AEF\u8230\u540D\u5E93\u6838\u5BF9\u5931\u8D25" : "\u524D\u540E\u7AEF\u8230\u540D\u5E93\u4E0D\u4E00\u81F4", "error", `Wiki \u4E0E GUI \u5DF2\u540C\u6B65\uFF0C${detail}`);
        if (status.backendError) {
          Logger_1.Logger.error(`\u540E\u7AEF\u8230\u540D\u5E93\u6838\u5BF9\u5931\u8D25\uFF1A${status.backendError}`);
        }
      } else {
        this.setShipLibraryUpdateAction("wiki", "\u68C0\u67E5\u66F4\u65B0");
        const updatedAt = status.generatedAt ? new Date(status.generatedAt).toLocaleString("zh-CN", { hour12: false }) : "\u65F6\u95F4\u672A\u77E5";
        this.host.configView.setShipLibraryStatus(`Wiki\u3001GUI\u3001\u540E\u7AEF\u5DF2\u540C\u6B65 \xB7 ${status.shipCount} \u8258 \xB7 ${updatedAt}`, "ok");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.configView.setShipLibraryStatus("\u8230\u8239\u6570\u636E\u5E93\u72B6\u6001\u8BFB\u53D6\u5931\u8D25", "error", message);
      Logger_1.Logger.error(`\u8230\u8239\u6570\u636E\u5E93\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A${message}`);
    }
  }
  setShipLibraryUpdateAction(target, label) {
    this.shipLibraryUpdateTarget = target;
    this.host.configView.setShipLibraryUpdateLabel(label);
  }
  async browseDirectory(title, applyPath) {
    const path = await this.gateway?.openDirectoryDialog(title);
    if (path)
      applyPath(path);
  }
  async browsePython() {
    if (!this.gateway)
      return;
    const result = await this.gateway.openFileDialog([
      { name: "Python", extensions: ["exe"] }
    ]);
    if (result)
      this.host.configView.setPythonPath(result.path);
  }
  async selectAutomationPlan() {
    const currentTask = this.host.configView.getNormalFightTasks()[0];
    const selected = await this.host.pickAutomationPlan(currentTask);
    if (!selected)
      return;
    try {
      const result = await this.gateway?.readManagedCombatPlan(selected.plan.source, selected.plan.file);
      if (!result?.success || !result.path) {
        throw new Error(result?.error || "\u65E0\u6CD5\u8BFB\u53D6\u6240\u9009\u51FA\u5F81\u8BA1\u5212");
      }
      const fleetPresetIndex = selected.fleetPresetIndex;
      const fleetName = fleetPresetIndex === void 0 ? "" : selected.plan.fleets[fleetPresetIndex]?.name;
      if (fleetPresetIndex !== void 0 && !fleetName) {
        throw new Error("\u6240\u9009\u4F7F\u7528\u8230\u961F\u4E0D\u5B58\u5728");
      }
      const task = {
        name: selected.plan.file,
        source: selected.plan.source,
        ...fleetPresetIndex === void 0 ? {} : { fleet_preset_index: fleetPresetIndex },
        times: (0, NormalFightDailyQuota_js_1.normalFightDailyLimit)(selected.dailyMaxExecutions)
      };
      this.host.configView.setNormalFightPlan(task, fleetName ?? "", this.host.getNormalFightRemaining(task));
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("\u65E0\u6CD5\u52A0\u8F7D\u51FA\u5F81\u8BA1\u5212", error instanceof Error ? error.message : String(error));
    }
  }
  async selectLootAutomationPlans() {
    const plans = await this.host.pickLootAutomationPlans(this.host.configView.getLootPlans());
    if (plans)
      this.host.configView.setLootPlans(plans);
  }
  async checkBackend() {
    const port = this.host.configView.getBackendPort();
    this.host.configView.setBackendCheckLoading(true);
    this.host.configView.setBackendStatus("\u6B63\u5728\u8FDE\u63A5", "unknown");
    try {
      const result = await new ApiClient_1.ApiClient(`http://localhost:${port}`).health();
      this.host.configView.setBackendStatus(result.success ? "\u63A5\u53E3\u6B63\u5E38" : result.error || result.message || "\u63A5\u53E3\u5F02\u5E38", result.success ? "ok" : "error");
    } catch {
      this.host.configView.setBackendStatus("\u65E0\u6CD5\u8FDE\u63A5", "error");
    } finally {
      this.host.configView.setBackendCheckLoading(false);
    }
  }
  async validateCuda() {
    if (!this.gateway)
      return;
    const { configView } = this.host;
    const cudaPath = configView.getCudaPath();
    configView.setCudaValidateLoading(true);
    configView.setCudaStatus("\u68C0\u6D4B\u4E2D", "unknown", "\u6B63\u5728\u68C0\u6D4B PyTorch\u3001CUDA \u548C\u663E\u5361");
    try {
      const result = await this.gateway.validateCudaPath(cudaPath);
      if (result.valid) {
        if (result.path)
          configView.setCudaPath(result.path);
        const details = [
          result.device ?? "CUDA \u53EF\u7528",
          result.version ? `CUDA ${result.version}` : null,
          result.torchVersion ? `PyTorch ${result.torchVersion}` : null
        ].filter(Boolean);
        configView.setCudaStatus(result.version ? `CUDA ${result.version}` : "GPU \u53EF\u7528", "ok", details.join("\uFF1B"));
      } else {
        const error = result.error ?? "\u672A\u68C0\u6D4B\u5230\u53EF\u7528 CUDA";
        const shortStatus = result.torchVersion?.includes("+cpu") || error.includes("\u672A\u68C0\u6D4B\u5230\u53EF\u7528 CUDA") ? "\u4EC5 CPU" : error.includes("\u8DEF\u5F84") || error.includes("\u76EE\u5F55") || error.includes("Runtime DLL") ? "\u8DEF\u5F84\u65E0\u6548" : "\u68C0\u6D4B\u5931\u8D25";
        configView.setCudaStatus(shortStatus, "error", error);
      }
    } catch {
      configView.setCudaStatus("\u68C0\u6D4B\u5931\u8D25", "error", "\u786C\u4EF6\u68C0\u6D4B\u5931\u8D25");
    } finally {
      configView.setCudaValidateLoading(false);
    }
  }
  async validatePython() {
    if (!this.gateway)
      return;
    const { configView } = this.host;
    const pythonPath = configView.getPythonPath();
    if (!pythonPath) {
      configView.setPythonStatus('"\u7559\u7A7A"\u5C06\u81EA\u52A8\u68C0\u6D4B', "unknown");
      return;
    }
    configView.setPythonValidateLoading(true);
    try {
      const result = await this.gateway.validatePython(pythonPath);
      configView.setPythonStatus(result.valid ? `\u2713 ${result.version}` : result.error ?? "\u4E0D\u517C\u5BB9", result.valid ? "ok" : "error");
    } catch {
      configView.setPythonStatus("\u68C0\u6D4B\u5931\u8D25", "error");
    } finally {
      configView.setPythonValidateLoading(false);
    }
  }
  async checkAdbDevices() {
    if (!this.gateway)
      return;
    this.host.configView.setAdbCheckLoading(true);
    try {
      const devices = await this.collectAdbDevices({ probePorts: true });
      const online = devices.filter((device) => device.status === "device");
      this.host.configView.setAdbDevices(devices, (serial) => void this.applyDeviceSelection(serial), this.host.configView.getEmulatorSerial());
      if (online.length === 0) {
        await (0, DialogHelper_1.showAlert)("ADB \u68C0\u6D4B", "\u672A\u53D1\u73B0\u5728\u7EBF\u8BBE\u5907\u3002\n\u8BF7\u786E\u8BA4\u6A21\u62DF\u5668\u5DF2\u542F\u52A8\u3002");
      } else if (online.length === 1) {
        this.host.configView.setEmulatorSerial(online[0].serial);
        this.host.configView.setAdbStatus(`\u5728\u7EBF (${online[0].serial})`, "online");
        Logger_1.Logger.info(`ADB \u68C0\u6D4B\u5230\u5728\u7EBF\u8BBE\u5907: ${online[0].serial}\uFF0C\u5DF2\u81EA\u52A8\u586B\u5165`);
      } else {
        Logger_1.Logger.info(`ADB \u68C0\u6D4B\u5230 ${online.length} \u4E2A\u5728\u7EBF\u8BBE\u5907\uFF0C\u5DF2\u5217\u51FA\u4F9B\u4E00\u952E\u9009\u62E9: ${online.map((device) => device.serial).join(", ")}`);
      }
    } catch (error) {
      await (0, DialogHelper_1.showAlert)("ADB \u68C0\u6D4B\u5931\u8D25", error instanceof Error ? error.message : String(error));
    } finally {
      this.host.configView.setAdbCheckLoading(false);
    }
  }
  async changeAdbConnection(action) {
    if (!this.gateway)
      return;
    const serial = this.host.configView.getEmulatorSerial();
    if (!serial) {
      await (0, DialogHelper_1.showAlert)("ADB \u5730\u5740\u4E3A\u7A7A", "\u8BF7\u5148\u586B\u5199 ADB \u5730\u5740\uFF0C\u4F8B\u5982 127.0.0.1:16384\u3002");
      return;
    }
    this.host.configView.setAdbConnectionLoading(action, true);
    this.host.configView.setAdbStatus(action === "connect" ? "\u6B63\u5728\u8FDE\u63A5" : "\u6B63\u5728\u65AD\u5F00", "unknown");
    try {
      const result = action === "connect" ? await this.gateway.connectAdbDevice(serial) : await this.gateway.disconnectAdbDevice(serial);
      if (result.success) {
        const connected = action === "connect";
        if (connected) {
          this.host.configView.setAdbStatus("ADB \u5728\u7EBF\uFF0C\u6B63\u5728\u8FDE\u63A5\u540E\u7AEF", "unknown");
          const systemConnected = await this.host.ensureSystemConnected();
          if (!systemConnected) {
            this.host.configView.setAdbStatus("ADB \u5728\u7EBF\uFF0C\u540E\u7AEF\u8FDE\u63A5\u5931\u8D25", "offline");
            Logger_1.Logger.warn(`ADB \u5DF2\u8FDE\u63A5\u4F46\u540E\u7AEF\u7CFB\u7EDF\u542F\u52A8\u5931\u8D25: ${serial}`);
            await (0, DialogHelper_1.showAlert)("\u540E\u7AEF\u8FDE\u63A5\u5931\u8D25", "ADB \u8BBE\u5907\u5DF2\u7ECF\u5728\u7EBF\uFF0C\u4F46\u540E\u7AEF\u4ECD\u672A\u8FDE\u63A5\u6A21\u62DF\u5668\u3002\u8BF7\u68C0\u67E5 ADB \u5730\u5740\u548C\u540E\u7AEF\u65E5\u5FD7\u540E\u91CD\u8BD5\u3002");
            return;
          }
        }
        this.host.configView.setAdbStatus(connected ? `\u5728\u7EBF (${serial})` : "\u5DF2\u65AD\u5F00", connected ? "online" : "offline");
        Logger_1.Logger.info(`ADB ${connected ? "\u8FDE\u63A5" : "\u65AD\u5F00"}\u6210\u529F: ${serial}`);
      } else {
        this.host.configView.setAdbStatus(`${action === "connect" ? "\u8FDE\u63A5" : "\u65AD\u5F00"}\u5931\u8D25`, "offline");
        await (0, DialogHelper_1.showAlert)(`ADB ${action === "connect" ? "\u8FDE\u63A5" : "\u65AD\u5F00"}\u5931\u8D25`, result.message);
      }
    } catch (error) {
      this.host.configView.setAdbStatus("ADB \u547D\u4EE4\u6267\u884C\u5931\u8D25", "offline");
      await (0, DialogHelper_1.showAlert)("ADB \u64CD\u4F5C\u5931\u8D25", error instanceof Error ? error.message : String(error));
    } finally {
      this.host.configView.setAdbConnectionLoading(action, false);
    }
  }
  async updateShipLibrary() {
    if (!this.gateway || this.shipLibraryUpdating)
      return;
    const updateTarget = this.shipLibraryUpdateTarget;
    this.shipLibraryUpdating = true;
    this.host.configView.setShipLibraryUpdateLoading(true);
    this.host.configView.setShipLibraryStatus(updateTarget === "backend" ? "\u6B63\u5728\u540C\u6B65\u540E\u7AEF\u8230\u540D\u5E93\u2026" : "\u6B63\u5728\u68C0\u67E5 Wiki \u66F4\u65B0\u2026", "unknown");
    try {
      const result = await this.gateway.updateShipLibrary(updateTarget);
      if (!result.success) {
        const message = result.error || result.failures?.[0] || "\u672A\u77E5\u9519\u8BEF";
        this.host.configView.setShipLibraryStatus(updateTarget === "backend" ? "\u540E\u7AEF\u8230\u540D\u5E93\u540C\u6B65\u5931\u8D25" : "\u8230\u8239\u6570\u636E\u5E93\u66F4\u65B0\u5931\u8D25", "error", message);
        Logger_1.Logger.error(`\u8230\u8239\u8D44\u6599\u5E93\u66F4\u65B0\u5931\u8D25: ${message}`);
        return;
      }
      if (updateTarget === "wiki")
        await this.host.reloadShipLibrary();
      if (result.shipnames_sync_error) {
        Logger_1.Logger.error(`\u8230\u8239\u8D44\u6599\u5E93\u5DF2\u66F4\u65B0\uFF0C\u4F46\u540E\u7AEF\u8230\u540D\u540C\u6B65\u5931\u8D25: ${result.shipnames_sync_error}`);
      }
      Logger_1.Logger.info(updateTarget === "backend" ? "\u540E\u7AEF\u8230\u540D\u5E93\u540C\u6B65\u5B8C\u6210" : "Wiki \u8230\u8239\u8D44\u6599\u5E93\u68C0\u67E5\u5B8C\u6210");
      await this.refreshShipLibraryStatus(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.configView.setShipLibraryStatus(updateTarget === "backend" ? "\u540E\u7AEF\u8230\u540D\u5E93\u540C\u6B65\u5931\u8D25" : "\u8230\u8239\u6570\u636E\u5E93\u66F4\u65B0\u5931\u8D25", "error", message);
      Logger_1.Logger.error(`\u8230\u8239\u8D44\u6599\u5E93\u66F4\u65B0\u5931\u8D25: ${message}`);
    } finally {
      this.shipLibraryUpdating = false;
      this.host.configView.setShipLibraryUpdateLoading(false);
    }
  }
  async checkUpdatesManually() {
    if (!this.gateway)
      return;
    this.host.configView.setUpdateCheckLoading(true);
    try {
      Logger_1.Logger.info("\u5DF2\u8DF3\u8FC7\u540E\u7AEF\u6E90\u7801\u66F4\u65B0\u68C0\u67E5\uFF08\u6D4B\u8BD5\u63A5\u53E3\u5DF2\u505C\u7528\uFF09");
      try {
        const guiUpdate = await this.gateway.checkGuiUpdates();
        if (guiUpdate.status === "error") {
          Logger_1.Logger.warn(`GUI \u66F4\u65B0\u68C0\u67E5\u5931\u8D25: ${guiUpdate.message}`);
          return;
        }
        if (guiUpdate.status !== "available") {
          Logger_1.Logger.info("GUI \u5DF2\u662F\u6700\u65B0\u7248\u672C");
          return;
        }
        Logger_1.Logger.info(`\u68C0\u6D4B\u5230 GUI \u65B0\u7248\u672C v${guiUpdate.version}\uFF0C\u66F4\u65B0\u9009\u62E9\u5DF2\u7531\u7CFB\u7EDF\u7A97\u53E3\u5904\u7406`);
      } catch {
        Logger_1.Logger.warn("GUI \u66F4\u65B0\u68C0\u67E5\u5931\u8D25");
      }
    } finally {
      this.host.configView.setUpdateCheckLoading(false);
    }
  }
  /** 检查后端独立更新并准备暂存包；进度经 onBackendUpdateStatus 推送。 */
  async checkBackendUpdates() {
    if (!this.gateway)
      return;
    const { configView } = this.host;
    configView.setBackendUpdateCheckLoading(true);
    configView.setBackendUpdateStatus({ status: "checking" });
    try {
      const result = await this.gateway.checkBackendUpdates();
      if (result.status === "error") {
        configView.setBackendUpdateStatus({
          status: "error",
          message: result.message
        });
        return;
      }
      if (result.status !== "available") {
        configView.setBackendUpdateStatus({ status: "up-to-date" });
        return;
      }
      configView.setBackendUpdateStatus({
        status: "available",
        commit: result.commit
      });
      await this.gateway.prepareBackendUpdate(result.commit);
    } catch (error) {
      configView.setBackendUpdateStatus({
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      configView.setBackendUpdateCheckLoading(false);
    }
  }
  openFolder(folderPath) {
    if (!folderPath || !this.gateway)
      return;
    void this.gateway.openFolder(folderPath);
  }
};
exports.SettingsController = SettingsController;