"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndPrepareEnv = checkAndPrepareEnv;
exports.runSetupScript = runSetupScript;
exports.checkForUpdates = checkForUpdates;
var IpcAdapter_js_1 = require_IpcAdapter();
var StorageAdapter_js_1 = require_StorageAdapter();
var Logger_1 = require_Logger();
var DialogHelper_1 = require_DialogHelper();
var SelectorDialog_1 = require_SelectorDialog();
function getUpdateMode() {
  const cached = (0, IpcAdapter_js_1.getRuntimeSettings)().updateMode;
  if (cached === "manual" || cached === "auto")
    return cached;
  try {
    return StorageAdapter_js_1.browserStorageStore.get("updateMode") === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}
/**
 * 6.11a/R36：「正在检查运行环境…」重复打印的根因是两条独立通道——
 * 渲染层这里 pre-log 一次，主进程 ``pythonEnv/envCheck.js`` 的
 * ``ctx.sendProgress`` 又经 ``backend-log`` 回到面板一次。
 * 现在只保留主进程这一条来源；仅当没有订阅通道时才由渲染层兜底。
 */
var envCheckInFlight = null;
var envCheckNoticeLogged = false;
/** 6.7：缺失依赖的体积/耗时预估（区间，避免编造精确值）。 */
function installEstimateText(env) {
  const missing = Array.isArray(env?.missingPackages) ? env.missingPackages : [];
  const names = missing.map((value) => String(value).split(/[<>=!~]/)[0]).filter(Boolean);
  return `将安装 ${names.length || "缺失"} 个依赖：${names.join("、") || "未知"}；预计下载 100 MB–3 GB，耗时 2–30 分钟（视网络与缓存）。`;
}
/** 6.7：安装前确认（立即安装 / 离线导入 / 取消）。 */
async function showInstallChoice(env) {
  if (typeof document === "undefined")
    return "install";
  const picked = await (0, SelectorDialog_1.showSelector)("安装缺失依赖", [
    { icon: "⬇", label: `立即安装（${installEstimateText(env)}）` },
    { icon: "📂", label: "离线导入…（选择包含 wheel 的目录）" },
    { icon: "✕", label: "取消（本次不安装）" }
  ]);
  if (!picked)
    return "cancel";
  return ["install", "offline", "cancel"][picked.index] ?? "cancel";
}
/** 6.7：安装进度浮层；取消按钮走 cancel-install-deps。 */
function createInstallProgressView(bridge) {
  if (typeof document === "undefined")
    return { close() {} };
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;background:rgba(4,8,18,.62);";
  const card = document.createElement("div");
  card.style.cssText = "width:min(560px,92vw);box-sizing:border-box;padding:20px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#1b2030;color:#f2f5fb;font:14px/1.5 'Microsoft YaHei UI',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5);";
  const title = document.createElement("h3");
  title.textContent = "正在安装后端依赖";
  title.style.cssText = "margin:0 0 8px;font-size:17px;";
  const stage = document.createElement("div");
  stage.textContent = "准备中…";
  stage.style.cssText = "margin:0 0 10px;color:#a9b4c8;";
  const track = document.createElement("div");
  track.style.cssText = "height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;";
  const fill = document.createElement("div");
  fill.style.cssText = "height:100%;width:0;border-radius:99px;background:var(--accent,#0f7dff);transition:width .2s ease;";
  track.appendChild(fill);
  const detail = document.createElement("div");
  detail.style.cssText = "margin:10px 0 14px;min-height:20px;max-height:88px;overflow:auto;color:#a9b4c8;font:12px/1.45 ui-monospace,Consolas,monospace;word-break:break-all;";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn";
  cancel.textContent = "取消安装";
  cancel.style.cssText = "border:1px solid rgba(255,255,255,.28);background:transparent;color:#e8ecf4;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;";
  actions.appendChild(cancel);
  card.append(title, stage, track, detail, actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const dispose = bridge.onInstallDepsProgress?.((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    if (typeof payload.stage === "string" && payload.stage) {
      const total = Number(payload.total) || 3;
      const index = Number(payload.index) || 0;
      stage.textContent = index > 0 ? `阶段 ${index}/${total}：${payload.stage}` : payload.stage;
    }
    if (Number.isFinite(payload.percent))
      fill.style.width = `${Math.max(0, Math.min(100, payload.percent))}%`;
    if (typeof payload.message === "string" && payload.message) {
      detail.textContent = payload.message;
      detail.scrollTop = detail.scrollHeight;
    }
  });
  let canceled = false;
  cancel.addEventListener("click", async () => {
    if (canceled)
      return;
    canceled = true;
    cancel.disabled = true;
    cancel.textContent = "正在取消…";
    try {
      const ok = await bridge.cancelInstallDeps?.();
      if (!ok)
        cancel.textContent = "没有可取消的安装";
    } catch {
      cancel.textContent = "取消失败";
    }
  });
  return {
    close() {
      try {
        dispose?.();
      } catch {
      }
      overlay.remove();
    }
  };
}
function checkAndPrepareEnv(bridge) {
  if (envCheckInFlight)
    return envCheckInFlight;
  envCheckInFlight = runEnvCheck(bridge).finally(() => {
    envCheckInFlight = null;
  });
  return envCheckInFlight;
}
async function runEnvCheck(bridge) {
  if (!bridge.onBackendLog && !envCheckNoticeLogged) {
    envCheckNoticeLogged = true;
    Logger_1.Logger.info("\u6B63\u5728\u68C0\u67E5\u8FD0\u884C\u73AF\u5883\u2026");
  }
  let env = await bridge.checkEnvironment();
  if (!env.pythonCmd) {
    if (bridge.installPortablePython) {
      const result = await bridge.installPortablePython();
      if (!result.success) {
        Logger_1.Logger.error("Python \u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u8FD0\u884C setup.bat");
        return false;
      }
    } else {
      Logger_1.Logger.error("\u672A\u627E\u5230 Python\uFF0C\u8BF7\u5B89\u88C5 Python 3.12 \u6216 3.13");
      return false;
    }
    env = await bridge.checkEnvironment();
    if (!env.pythonCmd) {
      Logger_1.Logger.error("\u5B89\u88C5\u540E\u4ECD\u672A\u68C0\u6D4B\u5230 Python\uFF0C\u8BF7\u91CD\u542F\u5E94\u7528");
      return false;
    }
  }
  if (env.allReady)
    return true;
  Logger_1.Logger.info(`\u6B63\u5728\u5B89\u88C5\u7F3A\u5931\u4F9D\u8D56: ${env.missingPackages.join(", ")}\u2026`);
  const choice = await showInstallChoice(env);
  if (choice === "cancel") {
    Logger_1.Logger.info("\u5DF2\u53D6\u6D88\u4F9D\u8D56\u5B89\u88C5");
    return false;
  }
  let installResult;
  if (choice === "offline") {
    if (!bridge.installDepsOffline) {
      Logger_1.Logger.error("\u5F53\u524D\u7248\u672C\u4E0D\u652F\u6301\u79BB\u7EBF\u5BFC\u5165");
      return false;
    }
    const directory = await bridge.openDirectoryDialog?.("\u9009\u62E9\u5305\u542B wheel \u7684\u79BB\u7EBF\u4F9D\u8D56\u76EE\u5F55");
    if (!directory) {
      Logger_1.Logger.info("\u5DF2\u53D6\u6D88\u79BB\u7EBF\u5BFC\u5165");
      return false;
    }
    const progress2 = createInstallProgressView(bridge);
    try {
      installResult = await bridge.installDepsOffline(directory);
    } finally {
      progress2.close();
    }
  } else {
    const progress2 = createInstallProgressView(bridge);
    try {
      installResult = await bridge.installDeps();
    } finally {
      progress2.close();
    }
  }
  if (!installResult?.success) {
    if (installResult?.canceled) {
      Logger_1.Logger.error("\u4F9D\u8D56\u5B89\u88C5\u5DF2\u53D6\u6D88");
      return false;
    }
    Logger_1.Logger.error("\u4F9D\u8D56\u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u65E5\u5FD7");
    const fullOutput = String(installResult?.output ?? "");
    Logger_1.Logger.logToFile(fullOutput);
    const tail = fullOutput.trim().split("\n").slice(-20).join("\n");
    if (typeof document !== "undefined") {
      await (0, DialogHelper_1.showAlert)("\u4F9D\u8D56\u5B89\u88C5\u5931\u8D25", tail ? `\u5B8C\u6574\u8F93\u51FA\u5DF2\u5199\u5165 GUI \u65E5\u5FD7\u3002\n\n${tail}` : "\u5B8C\u6574\u8F93\u51FA\u5DF2\u5199\u5165 GUI \u65E5\u5FD7\u3002");
    }
    return false;
  }
  env = await bridge.checkEnvironment();
  if (!env.allReady) {
    Logger_1.Logger.error(`\u4ECD\u7F3A\u5C11\u4F9D\u8D56: ${env.missingPackages.join(", ")}`);
    return false;
  }
  return true;
}
async function runSetupScript(bridge) {
  if (!bridge.runSetup)
    return false;
  if (bridge.onSetupLog) {
    (0, IpcAdapter_js_1.bindIpcSubscription)("setup-log", () =>           bridge.onSetupLog((text) => {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
          continue;
        if (trimmed.startsWith("\u221A")) {
          Logger_1.Logger.info(trimmed);
        } else if (trimmed.startsWith("\xD7")) {
          Logger_1.Logger.error(trimmed);
        } else if (trimmed.includes("\u4E0B\u8F7D") || trimmed.includes("\u5B89\u88C5") || trimmed.includes("\u68C0\u6D4B")) {
          Logger_1.Logger.info(trimmed);
        }
      }
    }));
  }
  const result = await bridge.runSetup();
  return result.success;
}
async function checkForUpdates(bridge) {
  const updateMode = getUpdateMode();
  initGuiAutoUpdate(bridge);
  if (updateMode === "manual") {
    Logger_1.Logger.info("\u5F53\u524D\u4E3A\u624B\u52A8\u66F4\u65B0\u6A21\u5F0F\uFF0C\u5DF2\u8DF3\u8FC7\u542F\u52A8\u81EA\u52A8\u66F4\u65B0\u68C0\u67E5");
    return;
  }
}
function initGuiAutoUpdate(bridge) {
  if (!bridge.onUpdateStatus)
    return;
  (0, IpcAdapter_js_1.bindIpcSubscription)("gui-update-status", () =>         bridge.onUpdateStatus((status) => {
    switch (status.status) {
      case "available":
        Logger_1.Logger.info(`\u53D1\u73B0 GUI \u65B0\u7248\u672C v${status.version}\uFF0C\u7B49\u5F85\u7528\u6237\u9009\u62E9\u66F4\u65B0\u65F6\u95F4`);
        break;
      case "downloading":
        Logger_1.Logger.info("GUI \u66F4\u65B0\u6B63\u5728\u540E\u53F0\u9759\u9ED8\u4E0B\u8F7D\u5E76\u6821\u9A8C");
        break;
      case "downloaded":
        Logger_1.Logger.info(`GUI v${status.version} \u5DF2\u51C6\u5907\u5B8C\u6210\uFF0C\u7B49\u5F85\u9009\u62E9\u91CD\u542F\u65F6\u95F4`);
        break;
      case "deferred":
        Logger_1.Logger.info(`GUI v${status.version} \u5C06\u5728\u4E0B\u6B21\u6253\u5F00\u524D\u66F4\u65B0\uFF0C\u5F53\u524D\u4EFB\u52A1\u7EE7\u7EED\u8FD0\u884C`);
        break;
      case "installing":
        Logger_1.Logger.info(status.message);
        break;
      case "error":
        Logger_1.Logger.warn(`GUI \u66F4\u65B0\u68C0\u67E5\u5931\u8D25: ${status.message || "\u672A\u77E5\u9519\u8BEF"}`);
        break;
    }
  }));
  setTimeout(() => {
    if (getUpdateMode() === "manual")
      return;
    bridge.checkGuiUpdates?.().catch(() => {
    });
  }, 5e3);
}