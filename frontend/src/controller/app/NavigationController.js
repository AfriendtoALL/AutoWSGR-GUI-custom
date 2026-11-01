"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationController = void 0;
var NavigationView_1 = require_NavigationView();
var DialogHelper_1 = require_DialogHelper();
var IpcAdapter_js_1 = require_IpcAdapter();
var NavigationController = class {
  constructor(host, view = new NavigationView_1.NavigationView(), gateway = (0, IpcAdapter_js_1.getSettingsGateway)()) {
    this.host = host;
    this.view = view;
    this.gateway = gateway;
    this.configLeavePromptOpen = false;
  }
  bindNavigation() {
    this.view.onPageSelected = (pageId) => void this.switchPage(pageId);
  }
  /** 开启窗口记忆时恢复上次退出时所在的主导航页面。 */
  restoreLastActivePage() {
    if (!this.gateway)
      return;
    const preferences = (0, IpcAdapter_js_1.getRuntimeSettings)().windowPreferences;
    if (!preferences?.rememberBounds)
      return;
    const target = preferences.lastActivePage;
    if (!target || this.view.getActivePage() === target)
      return;
    void this.switchPage(target);
  }
  bindPlanNavigation() {
    this.view.onPlanTabSelected = (tabId) => this.showPlanTab(tabId);
  }
  showPlanTab(tabId) {
    this.view.showPlanTab(tabId);
    if (tabId === "fleet") {
      void this.host.loadFleetPlanner();
    } else if (tabId === "scheme") {
      void this.host.ensureDefaultPlan();
    } else if (tabId === "manage") {
      void this.host.loadPlanManagement();
    }
  }
  async switchPage(pageId, planTab) {
    if (this.view.getActivePage() === "config" && pageId !== "config" && this.host.hasUnsavedConfigChanges()) {
      if (this.configLeavePromptOpen)
        return;
      this.configLeavePromptOpen = true;
      try {
        const confirmed = await (0, DialogHelper_1.showConfirm)("\u8BBE\u7F6E\u5C1A\u672A\u4FDD\u5B58", "\u5F53\u524D\u914D\u7F6E\u5C1A\u672A\u4FDD\u5B58\uFF0C\u8BF7\u53CA\u65F6\u4FDD\u5B58\u8BBE\u7F6E\u3002\u662F\u5426\u4ECD\u7136\u5207\u6362\u9875\u9762\uFF1F");
        if (!confirmed)
          return;
      } finally {
        this.configLeavePromptOpen = false;
      }
    }
    this.view.showPage(pageId);
    void this.gateway?.rememberActivePage(pageId);
    if (pageId === "plan") {
      if (planTab)
        this.showPlanTab(planTab);
      const activeTab = this.view.getActivePlanTab();
      if (activeTab === "fleet") {
        void this.host.loadFleetPlanner();
      }
    }
    if (pageId === "config") {
      void this.host.refreshAdbStatus();
      void this.host.refreshShipLibraryStatus();
    }
  }
};
exports.NavigationController = NavigationController;