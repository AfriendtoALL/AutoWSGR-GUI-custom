"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fleetPlannerRepository = exports.decisivePlanRepository = exports.mapDataRepository = exports.rendererFileRepository = void 0;
exports.getRendererIpc = getRendererIpc;
exports.getBridge = getBridge;
exports.getSettingsGateway = getSettingsGateway;
exports.getPlansGateway = getPlansGateway;
exports.bindIpcSubscription = bindIpcSubscription;
exports.waitStartupReady = waitStartupReady;
exports.createMapDataRepository = createMapDataRepository;
function getRendererIpc() {
  const bridge = window.electronBridge;
  if (!bridge)
    throw new Error("Electron IPC bridge \u4E0D\u53EF\u7528");
  return { bridge };
}
var ipcSubscriptions = /* @__PURE__ */ new Map();
/**
 * 6.4/R34：同一个订阅键只保留一份监听。
 * 二次初始化时先执行上次返回的退订函数，日志/进度回调因此不会叠加。
 */
function bindIpcSubscription(key, subscribe) {
  const previous = ipcSubscriptions.get(key);
  if (previous)
    previous();
  const dispose = subscribe();
  if (typeof dispose === "function")
    ipcSubscriptions.set(key, dispose);
  else
    ipcSubscriptions.delete(key);
}
/** 6.11b/R36：等主进程完成旧数据迁移，再读 gui_settings / 计划，避免读到旧值。 */
function waitStartupReady() {
  const bridge = typeof window === "undefined" ? void 0 : window.electronBridge;
  if (!bridge?.waitStartupReady)
    return Promise.resolve();
  return Promise.resolve(bridge.waitStartupReady()).then(() => void 0).catch(() => void 0);
}
function getBridge() {
  const bridge = window.electronBridge;
  if (!bridge)
    throw new Error("Electron IPC bridge \u4E0D\u53EF\u7528");
  return bridge;
}
/** 域视图：显式列出该域允许调用的方法，未迁移的调用回落到完整 bridge。 */
function getDomainView(name) {
  const bridge = getBridge();
  const domain = bridge[name];
  if (!domain)
    return bridge;
  return new Proxy(domain, {
    get(target, prop, receiver) {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      const fallback = bridge[prop];
      return typeof fallback === "function" ? fallback.bind(bridge) : fallback;
    }
  });
}
function getSettingsGateway() {
  return getDomainView("settings");
}
function getPlansGateway() {
  return getDomainView("plans");
}
var RUNTIME_SETTINGS_DEFAULTS = {
  appVersion: "",
  backendPort: 8438,
  guiLogRoot: "",
  backendStartupMode: "managed",
  backendRepoPath: "",
  ocrGpuMode: "auto",
  cudaPath: "",
  saveBackendScreenshots: false,
  windowPreferences: {
    defaultWidth: 1280,
    defaultHeight: 720,
    rememberBounds: false,
    lastActivePage: "main"
  },
  updateMode: "",
  backendUpdateMode: "auto",
  allowTestUpdates: false,
  pythonPath: ""
};
/**
 * 6.11/R36：运行时配置缓存。
 * 这 13 项原先是 sendSync（每次截断渲染线程一次），现在由 invoke 并行预取，
 * 之后所有同步渲染路径读这份缓存，不再阻塞首屏。
 */
var runtimeSettings = { ...RUNTIME_SETTINGS_DEFAULTS, loaded: false };
function getRuntimeSettings() {
  return runtimeSettings;
}
function normalizeWindowPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    defaultWidth: Number(source.defaultWidth) > 0 ? Number(source.defaultWidth) : 1280,
    defaultHeight: Number(source.defaultHeight) > 0 ? Number(source.defaultHeight) : 720,
    rememberBounds: source.rememberBounds === true,
    lastActivePage: typeof source.lastActivePage === "string" && source.lastActivePage ? source.lastActivePage : "main"
  };
}
/** 归一化并写入缓存；任一字段缺失都回落到默认值。 */
function applyRuntimeSettings(source) {
  const raw = source && typeof source === "object" ? source : {};
  const next = { ...RUNTIME_SETTINGS_DEFAULTS };
  next.appVersion = typeof raw.appVersion === "string" ? raw.appVersion : "";
  const port = Number(raw.backendPort);
  next.backendPort = Number.isFinite(port) && port > 0 && port <= 65535 ? port : 8438;
  next.guiLogRoot = typeof raw.guiLogRoot === "string" ? raw.guiLogRoot : "";
  next.backendStartupMode = raw.backendStartupMode === "external" ? "external" : "managed";
  next.backendRepoPath = typeof raw.backendRepoPath === "string" ? raw.backendRepoPath : "";
  next.ocrGpuMode = typeof raw.ocrGpuMode === "string" && raw.ocrGpuMode ? raw.ocrGpuMode : "auto";
  next.cudaPath = typeof raw.cudaPath === "string" ? raw.cudaPath : "";
  next.saveBackendScreenshots = raw.saveBackendScreenshots === true;
  next.windowPreferences = normalizeWindowPreferences(raw.windowPreferences);
  next.updateMode = raw.updateMode === "manual" || raw.updateMode === "auto" ? raw.updateMode : "";
  next.backendUpdateMode = raw.backendUpdateMode === "manual" ? "manual" : "auto";
  next.allowTestUpdates = raw.allowTestUpdates === true;
  next.pythonPath = typeof raw.pythonPath === "string" ? raw.pythonPath : "";
  next.loaded = true;
  runtimeSettings = next;
  return runtimeSettings;
}
/** 局部更新缓存（设置保存 / 首启向导写入后调用，避免设置页回显旧值）。 */
function patchRuntimeSettings(patch) {
  return applyRuntimeSettings({ ...runtimeSettings, ...patch && typeof patch === "object" ? patch : {} });
}
/**
 * 6.11/R36：并行取回启动链所需的 13 个配置项。
 * 任一通道失败都降级为默认值，绝不阻塞首屏。
 */
async function loadRuntimeSettings(bridge) {
  let target = bridge;
  if (!target)
    target = typeof window === "undefined" ? void 0 : window.electronBridge;
  if (!target || typeof target !== "object")
    return applyRuntimeSettings({});
  const read = (call) => Promise.resolve().then(call).catch(() => void 0);
  const [appVersion, backendPort, guiLogRoot, backendStartupMode, backendRepoPath, ocrGpuMode, cudaPath, saveBackendScreenshots, windowPreferences, updateMode, backendUpdateMode, allowTestUpdates, pythonPath] = await Promise.all([
    read(() => target.getAppVersion?.()),
    read(() => target.getBackendPort?.()),
    read(() => target.getGuiLogRoot?.()),
    read(() => target.getBackendStartupMode?.()),
    read(() => target.getBackendRepoPath?.()),
    read(() => target.getOcrGpuMode?.()),
    read(() => target.getCudaPath?.()),
    read(() => target.getSaveBackendScreenshots?.()),
    read(() => target.getWindowPreferences?.()),
    read(() => target.getUpdateMode?.()),
    read(() => target.getBackendUpdateMode?.()),
    read(() => target.getAllowTestUpdates?.()),
    read(() => target.getPythonPath?.())
  ]);
  return applyRuntimeSettings({
    appVersion,
    backendPort,
    guiLogRoot,
    backendStartupMode,
    backendRepoPath,
    ocrGpuMode,
    cudaPath,
    saveBackendScreenshots,
    windowPreferences,
    updateMode,
    backendUpdateMode,
    allowTestUpdates,
    pythonPath
  });
}
exports.getRuntimeSettings = getRuntimeSettings;
exports.applyRuntimeSettings = applyRuntimeSettings;
exports.patchRuntimeSettings = patchRuntimeSettings;
exports.loadRuntimeSettings = loadRuntimeSettings;
exports.rendererFileRepository = {
  readFile(path) {
    return getRendererIpc().bridge.readFile(path);
  },
  saveFile(path, content) {
    return getRendererIpc().bridge.saveFile(path, content);
  },
  appendFile(path, content) {
    return getRendererIpc().bridge.appendFile(path, content);
  }
};
function createMapDataRepository(files = exports.rendererFileRepository) {
  return {
    read(path) {
      return files.readFile(path);
    }
  };
}
exports.mapDataRepository = createMapDataRepository();
exports.decisivePlanRepository = {
  async loadSettings() {
    const lastSaved = await getRendererIpc().bridge.getDecisivePlanSettings();
    return getRendererIpc().bridge.getDailyDecisivePlan(lastSaved.chapter);
  },
  loadChapter(chapter) {
    return getRendererIpc().bridge.getDailyDecisivePlan(chapter);
  },
  loadSystemDefaults(chapter) {
    return getRendererIpc().bridge.getSystemDailyDecisivePlan(chapter);
  },
  saveSettings(settings) {
    return getRendererIpc().bridge.saveDailyDecisivePlan(settings);
  },
  loadShipLibrary() {
    return getRendererIpc().bridge.getShipLibraryManifest();
  }
};
exports.fleetPlannerRepository = {
  getShipLibraryManifest() {
    return getRendererIpc().bridge.getShipLibraryManifest();
  },
  saveUserTeamPlan(plan, overwrite, currentFile, source) {
    return getRendererIpc().bridge.saveUserTeamPlan(plan, overwrite, currentFile, source);
  },
  listTeamPlans() {
    return getRendererIpc().bridge.listTeamPlans();
  },
  getPlanManagement() {
    return getRendererIpc().bridge.getPlanManagement();
  },
  exportUserPlans(selections) {
    return getRendererIpc().bridge.exportUserPlans(selections);
  },
  exportLegacy143Plans(selections) {
    return getRendererIpc().bridge.exportLegacy143Plans(selections);
  },
  setPlanUnlinkedIgnored(kind, source, file, ignored) {
    return getRendererIpc().bridge.setPlanUnlinkedIgnored(kind, source, file, ignored);
  },
  renameUserCombatPlan(file, newName) {
    return getRendererIpc().bridge.renameUserCombatPlan(file, newName);
  },
  deleteUserCombatPlan(file) {
    return getRendererIpc().bridge.deleteUserCombatPlan(file);
  },
  deleteUserTeamPlan(file) {
    return getRendererIpc().bridge.deleteUserTeamPlan(file);
  }
};