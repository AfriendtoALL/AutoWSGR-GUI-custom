"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogView = void 0;
var LOG_ICONS = {
  debug: '<svg class="log-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 1a.5.5 0 0 0-.5.5v1.02a4.5 4.5 0 0 0-1.87 1.16L.94 2.94a.5.5 0 1 0-.38.92l1.2.5A4.5 4.5 0 0 0 1.5 5.5H.5a.5.5 0 0 0 0 1h1.05a4.5 4.5 0 0 0 .55 1.53l-1.16.48a.5.5 0 1 0 .38.92l1.19-.49a4.5 4.5 0 0 0 1.99 1.56v.5a.5.5 0 0 0 1 0v-.16A4.5 4.5 0 0 0 8 11.5a4.5 4.5 0 0 0 2-.44v.44a.5.5 0 0 0 1 0v-.78a4.5 4.5 0 0 0 1.69-1.28l1.19.49a.5.5 0 1 0 .38-.92l-1.16-.48A4.5 4.5 0 0 0 13.5 7h.5a.5.5 0 0 0 0-1h-1a4.5 4.5 0 0 0-.26-1.14l1.2-.5a.5.5 0 1 0-.38-.92l-1.19.74A4.5 4.5 0 0 0 11 2.52V1.5a.5.5 0 0 0-1 0v.68A4.5 4.5 0 0 0 8 1.5a4.5 4.5 0 0 0-2 .68V1.5a.5.5 0 0 0-.5-.5zM8 3a3.5 3.5 0 0 1 3.5 3.5v1A3.5 3.5 0 0 1 8 11a3.5 3.5 0 0 1-3.5-3.5v-1A3.5 3.5 0 0 1 8 3z"/></svg>',
  info: '<svg class="log-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm0 3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM7 7.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v3.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1H8V8h-.5a.5.5 0 0 1-.5-.5z"/></svg>',
  warning: '<svg class="log-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.134 1.503a1 1 0 0 1 1.732 0l6 10.392A1 1 0 0 1 14 13.5H2a1 1 0 0 1-.866-1.5l6-10.497zM8 4.5a.5.5 0 0 0-.5.5v3.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5zm0 6a.625.625 0 1 0 0 1.25.625.625 0 0 0 0-1.25z"/></svg>',
  error: '<svg class="log-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm2.354 3.146a.5.5 0 0 1 0 .708L8.707 8l1.647 1.646a.5.5 0 0 1-.708.708L8 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L7.293 8 5.646 6.354a.5.5 0 0 1 .708-.708L8 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/></svg>',
  critical: '<svg class="log-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm2.354 3.146a.5.5 0 0 1 0 .708L8.707 8l1.647 1.646a.5.5 0 0 1-.708.708L8 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L7.293 8 5.646 6.354a.5.5 0 0 1 .708-.708L8 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/></svg>'
};
var LogView = class _LogView {
  constructor() {
    this.logFilterState = {
      debug: true,
      info: true,
      warning: true,
      error: true,
      critical: true
    };
    this.logCounts = {
      debug: 0,
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };
    this.debugMode = false;
    this.recognizerBadges = /* @__PURE__ */ new Map();
    this.logContainer = document.getElementById("log-container");
    this.initLogFilters();
  }
  initLogFilters() {
    const container = document.getElementById("log-filters");
    if (!container)
      return;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".log-filter-btn");
      if (!btn)
        return;
      const level = btn.dataset.level;
      const levels = level === "error" ? ["error", "critical"] : [level];
      const newState = !this.logFilterState[level];
      levels.forEach((l) => this.logFilterState[l] = newState);
      btn.classList.toggle("active", newState);
      this.applyLogFilter();
    });
  }
  setDebugMode(on) {
    this.debugMode = on;
    const debugBtn = document.querySelector('.log-filter-btn[data-level="debug"]');
    if (debugBtn) {
      debugBtn.style.display = on ? "" : "none";
    }
    if (!on) {
      this.logFilterState.debug = false;
      this.applyLogFilter();
    } else {
      this.logFilterState.debug = true;
      if (debugBtn)
        debugBtn.classList.add("active");
      this.applyLogFilter();
    }
  }
  applyLogFilter() {
    const entries = this.logContainer.querySelectorAll(".log-entry");
    entries.forEach((el) => {
      const lvl = el.dataset.level || "";
      el.classList.toggle("log-hidden", !this.logFilterState[lvl]);
    });
  }
  updateFilterCount(level) {
    const countKey = level === "critical" ? "error" : level;
    const el = document.getElementById(`log-count-${countKey}`);
    if (!el)
      return;
    const sum = countKey === "error" ? this.logCounts.error + this.logCounts.critical : this.logCounts[countKey] ?? 0;
    el.textContent = sum > 999 ? "999+" : String(sum);
  }
  shouldDrop(entry) {
    if (this.debugMode)
      return false;
    if (entry.level === "debug")
      return true;
    if (entry.level === "info" && entry.channel !== "GUI") {
      const msg = entry.message;
      for (const pat of _LogView.VERBOSE_PATTERNS) {
        if (msg.includes(pat))
          return true;
      }
    }
    return false;
  }
  appendLog(entry) {
    if (this.shouldDrop(entry))
      return;
    const level = entry.level || "info";
    const recognizerError = this.parseRecognizerError(entry.message);
    const recognizerRecovery = this.parseRecognizerRecovery(entry.message);
    this.logCounts[level] = (this.logCounts[level] || 0) + 1;
    this.updateFilterCount(level);
    const div = document.createElement("div");
    div.className = `log-entry level-${level}`;
    div.dataset.level = level;
    if (recognizerError)
      div.dataset.recognizer = recognizerError.name;
    if (entry.message.startsWith("[UI]") && (level === "info" || level === "debug"))
      div.classList.add("log-ui-recognition");
    if (entry.message.includes("\u8FC2\u56DE"))
      div.classList.add("log-detour");
    if (entry.message.includes("\u6389\u843D"))
      div.classList.add("log-ship-drop");
    if (!this.logFilterState[level])
      div.classList.add("log-hidden");
    const icon = LOG_ICONS[level] || LOG_ICONS.info;
    let msgHtml = this.esc(entry.message);
    msgHtml = msgHtml.replace(/评价=(SS|S|A|B|C|D)\b/, (_, g) => {
      const cls = g === "SS" ? "grade-ss" : g === "S" ? "grade-s" : g === "A" ? "grade-a" : "grade-low";
      return `\u8BC4\u4EF7=<span class="log-grade ${cls}">${g}</span>`;
    });
    msgHtml = msgHtml.replace(/MVP[:：]\s*(.+?)(?=\s*[,，|]|$)/, (_match, name) => {
      return `<span class="log-mvp">MVP: ${name}</span>`;
    });
    msgHtml = msgHtml.replace(/掉落[:：]\s*(.+?)(?=\s*$)/, (_match, name) => {
      return `\u6389\u843D: <span class="log-ship-drop-name">${name}</span>`;
    });
    div.innerHTML = `${icon}<div class="log-body"><div class="log-meta"><span class="log-time">${this.esc(entry.time)}</span><span class="log-channel">${this.esc(entry.channel)}</span></div><div class="log-msg">${msgHtml}</div></div>`;
    if (recognizerError)
      this.attachRecognizerBadge(div, recognizerError.name, recognizerError.count, level);
    else if (recognizerRecovery)
      this.clearRecognizerBadge(recognizerRecovery);
    this.logContainer.appendChild(div);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    while (this.logContainer.childElementCount > 500) {
      const first = this.logContainer.firstElementChild;
      if (first) {
        const oldLevel = first.dataset.level || "info";
        this.logCounts[oldLevel] = Math.max(0, (this.logCounts[oldLevel] || 0) - 1);
        this.updateFilterCount(oldLevel);
        const recognizerName = first.dataset.recognizer;
        if (recognizerName && this.recognizerBadges.get(recognizerName)?.row === first)
          this.recognizerBadges.delete(recognizerName);
      }
      this.logContainer.removeChild(this.logContainer.firstChild);
    }
  }
  /** 解析识别器异常行，返回 {name, count}；不是该格式时返回 null。 */
  parseRecognizerError(message) {
    const match = message.match(/^\[UI\] \u9875\u9762 '([^']+)' \u8BC6\u522B\u5668\u5F02\u5E38\uFF08\u8FDE\u7EED (\d+) \u6B21\uFF09/);
    if (!match)
      return null;
    const count = Number(match[2]);
    return Number.isFinite(count) && count > 0 ? { name: match[1], count } : null;
  }
  /** 解析识别器恢复行，返回识别器名；不是该格式时返回 null。 */
  parseRecognizerRecovery(message) {
    const match = message.match(/^\[UI\] \u9875\u9762 '([^']+)' \u8BC6\u522B\u5668\u6062\u590D\u6B63\u5E38/);
    return match ? match[1] : null;
  }
  clearRecognizerBadge(name) {
    const current = this.recognizerBadges.get(name);
    if (!current)
      return;
    current.badge.remove();
    this.recognizerBadges.delete(name);
  }
  /** 用 /api/system/status 的权威计数校正角标（只增不清零，清零走恢复日志/空映射）。 */
  setRecognizerErrors(errors) {
    const active = errors && typeof errors === "object" ? errors : {};
    for (const [name, current] of [...this.recognizerBadges]) {
      if (!current.row.isConnected) {
        this.clearRecognizerBadge(name);
        continue;
      }
      const count = Number(active[name]);
      if (!Number.isFinite(count) || count <= 0) {
        this.clearRecognizerBadge(name);
      } else if (count > current.count) {
        current.count = count;
        current.badge.textContent = `\u00D7${count}`;
        current.badge.title = `\u8FDE\u7EED\u5F02\u5E38 ${count} \u6B21`;
      }
    }
  }
  attachRecognizerBadge(div, name, count, level) {
    this.clearRecognizerBadge(name);
    const badge = document.createElement("span");
    badge.className = "log-recognizer-badge";
    badge.textContent = `\u00D7${count}`;
    badge.title = `\u8FDE\u7EED\u5F02\u5E38 ${count} \u6B21`;
    const isError = level === "error" || level === "critical";
    badge.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "min-width:20px",
      "height:16px",
      "padding:0 5px",
      "border-radius:999px",
      "font-size:10px",
      "font-weight:700",
      "line-height:1",
      `color:${isError ? "var(--danger)" : "var(--warning)"}`,
      `background:${isError ? "rgba(248,113,113,0.16)" : "rgba(251,191,36,0.16)"}`,
      `border:1px solid ${isError ? "rgba(248,113,113,0.45)" : "rgba(251,191,36,0.45)"}`
    ].join(";");
    div.querySelector(".log-meta")?.appendChild(badge);
    this.recognizerBadges.set(name, { row: div, badge, count });
  }
  esc(s) {
    const d = document.createElement("span");
    d.textContent = s;
    return d.innerHTML;
  }
};
exports.LogView = LogView;
LogView.VERBOSE_PATTERNS = [
  "\u6CE8\u518C\u8868\u8BFB\u53D6\u8DF3\u8FC7",
  "adb kill-server",
  "adb start-server",
  "taskkill adb",
  "Detector",
  "cap_method="
];