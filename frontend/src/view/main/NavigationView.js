"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationView = void 0;
var NavigationView = class {
  constructor() {
    this.navTabs = document.querySelector(".nav-tabs");
    this.navIndicator = this.navTabs?.querySelector(".nav-tab-indicator") ?? null;
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const pageId = tab.dataset["page"];
        if (pageId)
          this.onPageSelected?.(pageId);
      });
    });
    document.querySelectorAll("[data-plan-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.dataset["planTab"];
        if (tabId)
          this.onPlanTabSelected?.(tabId);
      });
    });
    this.updateNavigationIndicator();
    requestAnimationFrame(() => {
      this.navIndicator?.classList.add("is-ready");
    });
    if (this.navTabs) {
      this.navResizeObserver = new ResizeObserver(() => this.updateNavigationIndicator());
      this.navResizeObserver.observe(this.navTabs);
    } else {
      this.navResizeObserver = null;
    }
  }
  showPage(pageId) {
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset["page"] === pageId);
    });
    this.updateNavigationIndicator();
    document.querySelectorAll(".page").forEach((page) => {
      page.classList.toggle("active", page.id === `page-${pageId}`);
    });
  }
  showPlanTab(tabId) {
    document.querySelectorAll("[data-plan-tab]").forEach((tab) => {
      const active = tab.dataset["planTab"] === tabId;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-plan-panel]").forEach((panel) => {
      const active = panel.dataset["planPanel"] === tabId;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }
  getActivePlanTab() {
    return document.querySelector("[data-plan-tab].active")?.dataset["planTab"] ?? "fleet";
  }
  getActivePage() {
    return document.querySelector(".nav-tab.active")?.dataset["page"] ?? "main";
  }
  updateNavigationIndicator() {
    const activeTab = this.navTabs?.querySelector(".nav-tab.active");
    if (!activeTab || !this.navIndicator)
      return;
    this.navIndicator.style.width = `${activeTab.offsetWidth}px`;
    this.navIndicator.style.transform = `translate3d(${activeTab.offsetLeft}px, 0, 0)`;
  }
};
exports.NavigationView = NavigationView;