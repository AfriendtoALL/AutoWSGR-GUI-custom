"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForBackendAndConnect = waitForBackendAndConnect;
exports.startSystem = startSystem;
var Logger_1 = require_Logger();
function waitForBackendAndConnect(host, retries = 30) {
  host.scheduler.ping().then((alive) => {
    if (alive) {
      Logger_1.Logger.info("\u540E\u7AEF\u670D\u52A1\u5C31\u7EEA\uFF0C\u6B63\u5728\u8FDE\u63A5\u6A21\u62DF\u5668\u2026");
      void startSystem(host);
    } else if (retries > 0) {
      setTimeout(() => waitForBackendAndConnect(host, retries - 1), 1e3);
    } else {
      Logger_1.Logger.error("\u540E\u7AEF\u670D\u52A1\u542F\u52A8\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5 Python \u73AF\u5883");
      host.renderMain();
    }
  }).catch(() => {
    if (retries > 0) {
      setTimeout(() => waitForBackendAndConnect(host, retries - 1), 1e3);
    } else {
      Logger_1.Logger.error("\u540E\u7AEF\u8FDE\u63A5\u5931\u8D25");
      host.renderMain();
    }
  });
}
async function startSystem(host) {
  const configPath = host.configDir ? `${host.configDir.replace(/\\/g, "/")}/usersettings.yaml` : void 0;
  const automation = host.configModel.current.daily_automation;
  const guiAutomation = host.configModel.currentGuiAutomation;
  host.scheduler.setAutoExpedition(automation.auto_expedition);
  host.scheduler.setExpeditionInterval(guiAutomation.expeditionInterval);
  try {
    const ok = await host.scheduler.start(configPath);
    if (ok) {
      Logger_1.Logger.info("\u7CFB\u7EDF\u542F\u52A8\u6210\u529F \u2713");
      host.cronScheduler.start();
      Logger_1.Logger.info("\u5B9A\u65F6\u8C03\u5EA6\u5668\u5DF2\u542F\u52A8");
      host.startHeartbeat();
    } else {
      const reason = host.scheduler.lastStartError || "模拟器连接/游戏启动异常";
      Logger_1.Logger.error(`\u7CFB\u7EDF\u542F\u52A8\u5931\u8D25: ${reason}`);
      await host.onSystemStartFailure?.(reason);
    }
    host.renderMain();
    return ok;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) {
      Logger_1.Logger.warn("\u7CFB\u7EDF\u542F\u52A8 HTTP \u8BF7\u6C42\u8D85\u65F6\uFF0C\u6B63\u5728\u68C0\u6D4B\u540E\u7AEF\u72B6\u6001\u2026");
      const ready = await host.scheduler.isSystemReady();
      if (ready) {
        Logger_1.Logger.info("\u540E\u7AEF\u5DF2\u5C31\u7EEA\uFF0C\u6B63\u5728\u6062\u590D\u8FDE\u63A5\u2026");
        host.scheduler.recoverAfterTimeout();
        host.cronScheduler.start();
        Logger_1.Logger.info("\u5B9A\u65F6\u8C03\u5EA6\u5668\u5DF2\u542F\u52A8");
        host.startHeartbeat();
      } else {
        Logger_1.Logger.error("\u7CFB\u7EDF\u542F\u52A8\u8D85\u65F6\u4E14\u6A21\u62DF\u5668\u4ECD\u672A\u8FDE\u63A5");
      }
      host.renderMain();
      return ready;
    } else {
      Logger_1.Logger.error(`\u7CFB\u7EDF\u542F\u52A8\u5F02\u5E38: ${msg}`);
      await host.onSystemStartFailure?.(msg);
    }
    host.renderMain();
    return false;
  }
}