"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupController = void 0;
var IpcAdapter_js_1 = require_IpcAdapter();
var StorageAdapter_js_1 = require_StorageAdapter();
var Logger_1 = require_Logger();
var envAndUpdates_1 = require_envAndUpdates();
var connection_1 = require_connection();
var StartupController = class {
  constructor(host, gateway = (0, IpcAdapter_js_1.getBridge)()) {
    this.host = host;
    this.gateway = gateway;
    this.heartbeatTimer = null;
  }
  /** 完整的异步启动流程 */
  async run() {
    const bridge = this.gateway;
    if (!bridge)
      return;
    if (bridge.getAppRoot)
      this.host.appRoot = await bridge.getAppRoot();
    if (bridge.getPlansDir)
      this.host.plansDir = await bridge.getPlansDir();
    if (bridge.getConfigDir)
      this.host.configDir = await bridge.getConfigDir();
    this.host.syncPaths(this.host.appRoot, this.host.plansDir, this.host.configDir);
    this.host.initLogger(bridge);
    Logger_1.Logger.info(`\u914D\u7F6E\u6587\u4EF6\u76EE\u5F55: ${this.host.configDir}`);
    Logger_1.Logger.info(`\u65B9\u6848\u6587\u4EF6\u76EE\u5F55: ${this.host.plansDir}`);
    await this.host.reviewMigrationConflicts();
    await this.host.loadConfigAndSync();
    Logger_1.Logger.debug("\u914D\u7F6E\u52A0\u8F7D\u5B8C\u6210");
    await this.host.detectAndApplyEmulator();
    Logger_1.Logger.debug("\u6A21\u62DF\u5668\u68C0\u6D4B\u5B8C\u6210");
    if (!StorageAdapter_js_1.browserStorageStore.get("setupComplete")) {
      // 6.11/R36：首启向导要先摘骨架，否则模态框被骨架遮住无法操作。
      this.host.hideBootSkeleton?.();
      await this.host.showSetupWizard();
    }
    await this.host.loadModelsAndRender(bridge);
    await this.host.restoreQueueSnapshot?.();
    this.host.bindBackendLog(bridge);
    const envReady = await (0, envAndUpdates_1.checkAndPrepareEnv)(bridge);
    if (!envReady)
      return;
    (0, envAndUpdates_1.checkForUpdates)(bridge);
    const backendStartupMode = (0, IpcAdapter_js_1.getRuntimeSettings)().backendStartupMode ?? "managed";
    if (backendStartupMode === "external") {
      Logger_1.Logger.info("\u6B63\u5728\u542F\u52A8\u672C\u5730\u540E\u7AEF\u670D\u52A1\u2026");
    } else {
      Logger_1.Logger.info("\u6B63\u5728\u542F\u52A8\u540E\u7AEF\u670D\u52A1\u2026");
    }
    const backendResult = await bridge.startBackend();
    if (!backendResult.success) {
      Logger_1.Logger.error(`\u540E\u7AEF\u542F\u52A8\u5931\u8D25: ${backendResult.message}`);
      return;
    }
    void bridge.autoCheckBackendUpdates?.().catch(() => {
    });
    (0, connection_1.waitForBackendAndConnect)(this.host);
  }
  /** 代理: 等待后端并连接 */
  waitForBackendAndConnect(retries) {
    (0, connection_1.waitForBackendAndConnect)(this.host, retries);
  }
  /** 代理: 启动系统 */
  startSystem() {
    return Promise.resolve().then(() => __toESM(require_connection())).then((m) => m.startSystem(this.host));
  }
  startHeartbeat() {
    this.stopHeartbeat();
    let consecutiveFails = 0;
    this.heartbeatTimer = setInterval(async () => {
      try {
        const alive = await this.host.scheduler.ping();
        consecutiveFails = alive ? 0 : consecutiveFails + 1;
      } catch {
        consecutiveFails++;
      }
      if (consecutiveFails < 3)
        return;
      Logger_1.Logger.error("\u540E\u7AEF\u8FDE\u7EED 3 \u6B21\u5FC3\u8DF3\u5931\u8D25\uFF0C\u5C1D\u8BD5\u81EA\u52A8\u91CD\u542F\u2026");
      this.stopHeartbeat();
      const bridge = this.gateway;
      if (bridge?.startBackend) {
        await bridge.startBackend();
        this.waitForBackendAndConnect();
      }
    }, 3e4);
  }
  stopHeartbeat() {
    if (!this.heartbeatTimer)
      return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
};
exports.StartupController = StartupController;