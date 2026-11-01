"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBar = void 0;
var TaskQueueView_1 = require_TaskQueueView();
var COMBAT_PHASE_LABELS = {
  START_FIGHT: "\u51FA\u5F81",
  DOCK_FULL: "\u8239\u575E\u5DF2\u6EE1",
  PROCEED: "\u7EE7\u7EED\u524D\u8FDB",
  FIGHT_CONDITION: "\u6218\u51B5\u9009\u62E9",
  SPOT_ENEMY_SUCCESS: "\u7D22\u654C",
  FORMATION: "\u9635\u578B\u9009\u62E9",
  MISSILE_ANIMATION: "\u5BFC\u5F39\u652F\u63F4",
  FIGHT_PERIOD: "\u6218\u6597\u4E2D",
  NIGHT_PROMPT: "\u591C\u6218\u9009\u62E9",
  RESULT: "\u6218\u679C\u7ED3\u7B97",
  EXP_SETTLEMENT: "\u7ECF\u9A8C\u7ED3\u7B97",
  GET_SHIP: "\u6389\u843D",
  FLAGSHIP_SEVERE_DAMAGE: "\u65D7\u8230\u5927\u7834",
  MAP_PAGE: "\u5730\u56FE",
  EXERCISE_PAGE: "\u6F14\u4E60",
  EVENT_MAP_PAGE: "\u6D3B\u52A8\u5730\u56FE"
};
function formatCombatPhaseName(name) {
  if (typeof name !== "string" || !name)
    return "";
  return COMBAT_PHASE_LABELS[name] ?? name;
}
var StatusBar = class {
  constructor() {
    this.operationsConnected = false;
    this.resolutionFallback = false;
    this.resolutionFallbackNotice = null;
    this.uiStateChip = null;
    this.uiStateText = null;
    this.statusDot = document.getElementById("status-dot");
    this.statusText = document.getElementById("status-text");
    this.expeditionTimer = document.getElementById("expedition-timer");
    this.taskState = document.getElementById("nav-task-state");
    this.taskName = document.getElementById("nav-task-name");
    this.taskRemaining = document.getElementById("nav-task-remaining");
    this.taskProgress = document.getElementById("nav-task-progress");
    this.taskProgressFill = document.getElementById("nav-task-progress-fill");
    this.operationButtons = {
      expedition: this.getButton("btn-ops-expedition"),
      reward: this.getButton("btn-ops-reward"),
      buildCollect: this.getButton("btn-ops-build-collect"),
      cook: this.getButton("btn-ops-cook")
    };
    for (const [operation, button] of Object.entries(this.operationButtons)) {
      button?.addEventListener("click", () => {
        this.onOperation?.(operation);
      });
    }
  }
  render(vo) {
    this.statusDot.className = `status-indicator ${vo.status}`;
    this.statusDot.style.removeProperty("background");
    this.statusDot.style.removeProperty("box-shadow");
    this.statusDot.style.removeProperty("animation");
    this.statusText.style.removeProperty("color");
    if (vo.emulatorConnected === false) {
      this.statusDot.style.background = "#ef4444";
      this.statusDot.style.boxShadow = "0 0 8px rgba(239,68,68,0.55)";
      this.statusDot.style.animation = "pulse 1.5s infinite";
      this.statusText.style.color = "#f87171";
    } else if (vo.status === "busy") {
      this.statusDot.style.background = "#f59e0b";
      this.statusDot.style.boxShadow = "0 0 8px rgba(245,158,11,0.55)";
      this.statusDot.style.animation = "pulse 1.5s infinite";
      this.statusText.style.color = "#fbbf24";
    }
    this.statusText.textContent = vo.statusText;
    this.statusText.title = vo.deviceLease?.since ? `\u81EA ${vo.deviceLease.since} \u8D77` : "";
    this.expeditionTimer.textContent = vo.expeditionTimer;
    this.renderUiState(vo);
    this.renderResolutionFallback(vo.resolutionFallback === true);
    const running = vo.taskQueue.find((item) => item.id === vo.runningTaskId);
    if (!running) {
      this.taskState.classList.remove("active");
      this.taskState.title = "\u5F53\u524D\u65E0\u8FD0\u884C\u4EFB\u52A1";
      this.taskName.textContent = "\u5F53\u524D\u65E0\u4EFB\u52A1";
      this.taskRemaining.textContent = "\u5269\u4F59 0/0";
      this.taskProgressFill.style.width = "0%";
      this.taskProgress.setAttribute("aria-valuenow", "0");
      return;
    }
    const progressPercent = (0, TaskQueueView_1.resolveTaskProgressPercent)(running, true);
    const progressValue = Math.round(progressPercent * 100);
    const remainingText = running.unlimited ? "\u65E0\u9650" : `${running.remaining}/${running.totalTimes}`;
    this.taskState.classList.add("active");
    this.taskState.title = `${running.name}\uFF0C\u5269\u4F59 ${remainingText}`;
    this.taskName.textContent = running.name;
    this.taskRemaining.textContent = `\u5269\u4F59 ${remainingText}`;
    this.taskProgressFill.style.width = `${(progressPercent * 100).toFixed(1)}%`;
    this.taskProgress.setAttribute("aria-valuenow", String(progressValue));
  }
  setOpsAvailability(connected) {
    this.operationsConnected = connected;
    for (const button of Object.values(this.operationButtons)) {
      if (button)
        button.disabled = !connected;
    }
    this.setOpsStatus(connected ? "" : "\u672A\u8FDE\u63A5");
  }
  setOperationLoading(operation, loading) {
    const button = this.operationButtons[operation];
    if (button) {
      button.disabled = loading || !this.operationsConnected;
      button.setAttribute("aria-busy", String(loading));
    }
  }
  setOpsStatus(text) {
    const el = document.getElementById("ops-status");
    if (el)
      el.textContent = text;
  }
  setExpeditionTimer(text) {
    this.expeditionTimer.textContent = text;
  }
  /** 4.5：顶栏当前状态 chip（页面 · 子状态 · 战斗阶段，stale 转黄闪烁）。 */
  renderUiState(vo) {
    const chip = this.ensureUiStateIndicator();
    const state = vo.uiState ?? null;
    const active = vo.uiStateActive === true;
    const stale = active && vo.uiStateStale === true;
    const staleSeconds = Number.isFinite(vo.uiStateStaleAfterSeconds) ? vo.uiStateStaleAfterSeconds : 30;
    const phaseLabel = state?.phase ? formatCombatPhaseName(state.phase) : "";
    const parts = [];
    if (!active) {
      parts.push("\u7A7A\u95F2");
    } else if (!state || !state.page) {
      parts.push("\u8BC6\u522B\u4E2D\u2026");
    } else {
      parts.push(state.page);
    }
    if (active && state?.substate)
      parts.push(state.substate);
    if (active && state?.phase)
      parts.push(phaseLabel || state.phase);
    if (stale)
      parts.push(`${staleSeconds}s \u65E0\u53D8\u5316`);
    this.uiStateText.textContent = parts.join(" \xB7 ");
    chip.dataset.state = stale ? "stale" : active ? "active" : "idle";
    chip.style.background = stale ? "rgba(245,158,11,0.18)" : active ? "rgba(56,189,248,0.14)" : "rgba(148,163,184,0.12)";
    chip.style.borderColor = stale ? "rgba(245,158,11,0.55)" : active ? "rgba(56,189,248,0.35)" : "rgba(148,163,184,0.25)";
    chip.style.color = stale ? "#fbbf24" : "";
    chip.style.animation = stale ? "pulse 1.5s infinite" : "";
    const path = state && state.stack.length > 0 ? state.stack.join(" \u2192 ") : "\u2014";
    const phaseText = state?.phase ? `\uFF0C\u6218\u6597\u9636\u6BB5 ${state.phase}${phaseLabel && phaseLabel !== state.phase ? `\uFF08${phaseLabel}\uFF09` : ""}` : "";
    const staleText = stale ? `\uFF0C\u5DF2 ${staleSeconds} \u79D2\u6CA1\u6709\u6536\u5230\u72B6\u6001\u66F4\u65B0\uFF08\u53EF\u80FD\u5361\u4F4F\uFF09` : active ? "" : "\uFF0C\u5F53\u524D\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1";
    chip.title = `\u5F53\u524D\u9875\u9762\uFF1A${state?.page ?? "\u672A\u8BC6\u522B"}\n\u5BFC\u822A\u6808\uFF1A${path}${phaseText}${staleText}`;
  }
  ensureUiStateIndicator() {
    if (this.uiStateChip)
      return this.uiStateChip;
    const chip = document.createElement("div");
    chip.id = "nav-ui-state";
    chip.className = "nav-ui-state";
    chip.setAttribute("role", "status");
    chip.setAttribute("aria-live", "polite");
    chip.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:6px",
      "max-width:300px",
      "padding:4px 10px",
      "border-radius:999px",
      "border:1px solid rgba(148,163,184,0.25)",
      "background:rgba(148,163,184,0.12)",
      "font-size:12px",
      "line-height:1.2",
      "white-space:nowrap",
      "overflow:hidden"
    ].join(";");
    const label = document.createElement("span");
    label.className = "nav-ui-state-label";
    label.textContent = "\u72B6\u6001";
    label.style.cssText = "font-size:11px;opacity:0.7;flex:none";
    const value = document.createElement("span");
    value.id = "nav-ui-state-text";
    value.className = "nav-ui-state-text";
    value.textContent = "\u2014";
    value.style.cssText = "overflow:hidden;text-overflow:ellipsis;font-weight:600";
    chip.append(label, value);
    const runtime = document.querySelector(".nav-runtime");
    if (runtime)
      runtime.insertBefore(chip, runtime.firstChild);
    else
      document.querySelector(".nav-bar")?.appendChild(chip);
    this.uiStateChip = chip;
    this.uiStateText = value;
    return chip;
  }
  /** 分辨率回退提示条：固定显示在状态栏下方，只做黄条，不走弹窗/toast。 */
  renderResolutionFallback(visible) {
    this.resolutionFallback = visible === true;
    const notice = this.ensureResolutionFallbackNotice();
    notice.style.display = this.resolutionFallback ? "" : "none";
  }
  ensureResolutionFallbackNotice() {
    if (this.resolutionFallbackNotice)
      return this.resolutionFallbackNotice;
    const notice = document.createElement("div");
    notice.id = "resolution-fallback-notice";
    notice.className = "resolution-fallback-notice";
    notice.setAttribute("role", "status");
    notice.textContent = "\u5206\u8FA8\u7387\u672A\u8BC6\u522B\uFF0C\u4F7F\u7528\u9ED8\u8BA4 960\u00D7540";
    notice.style.cssText = [
      "display:none",
      "margin-top:var(--nav-height)",
      "padding:6px 12px",
      "background:#fbbf24",
      "color:#3b2a06",
      "font-size:12px",
      "font-weight:600",
      "line-height:1.4",
      "text-align:center",
      "border-bottom:1px solid #d97706",
      "box-shadow:0 1px 4px rgba(0,0,0,0.18)"
    ].join(";");
    const nav = document.querySelector(".nav-bar");
    if (nav?.parentNode)
      nav.parentNode.insertBefore(notice, nav.nextSibling);
    else
      document.body.insertBefore(notice, document.body.firstChild);
    this.resolutionFallbackNotice = notice;
    return notice;
  }
  setVersion(v) {
    const el = document.getElementById("app-version");
    if (el)
      el.textContent = v;
  }
  getButton(id) {
    return document.getElementById(id);
  }
};
exports.StatusBar = StatusBar;