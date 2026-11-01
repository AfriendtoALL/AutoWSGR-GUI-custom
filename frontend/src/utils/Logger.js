"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LOG_LEVEL_ALIASES = void 0;
var LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  critical: 4
};
exports.LOG_LEVEL_ALIASES = {
  TRACE: "debug",
  DEBUG: "debug",
  INFO: "info",
  SUCCESS: "info",
  WARNING: "warning",
  WARN: "warning",
  ERROR: "error",
  CRITICAL: "critical"
};
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatTimestamp() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
/** 6.9/R32：缓冲区上限，超出丢最旧，写盘卡死时内存不随日志无限增长。 */
var MAX_BUFFER_ENTRIES = 5000;
/** 6.9/R32：刷写失败指数退避 1s → 2s → 4s …，上限 30s。 */
var FLUSH_RETRY_BASE_MS = 1e3;
var FLUSH_RETRY_MAX_MS = 3e4;
/** 6.9/R32：满 50 条立即刷写（保留 6.4 前的原有触发阈值）。 */
var FLUSH_BATCH_THRESHOLD = 50;
var LoggerImpl = class {
  constructor() {
    this.opts = null;
    this.buffer = [];
    this.fileLevel = "debug";
    this.flushTimer = null;
    this.flushInFlight = false;
    this.flushPromise = Promise.resolve();
    this.retryTimer = null;
    this.retryDelayMs = 0;
    this.disposed = false;
  }
  /** 初始化 Logger（应在 AppController.initAsync 中调用一次） */
  init(opts) {
    this.opts = opts;
    this.disposed = false;
    if (opts.level)
      this.fileLevel = opts.level;
    // 6.4：二次初始化复用同一个定时器，避免日志被重复刷写。
    if (!this.flushTimer)
      this.flushTimer = setInterval(() => this.flush(), 2e3);
  }
  /**
   * 6.9/R32：释放定时器。先停周期刷写与退避定时器，再把余量刷一次；
   * dispose 之后不再自动重试，重复调用无副作用。
   */
  dispose() {
    this.disposed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryDelayMs = 0;
    return this.flush();
  }
  /** 6.9/R32：维持 buffer 上限，超出丢最旧条目。 */
  trimBuffer() {
    if (this.buffer.length > MAX_BUFFER_ENTRIES)
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_ENTRIES);
  }
  /** 6.9/R32：写盘失败后退避重试（1s → 2s → 4s …，封顶 30s）。 */
  scheduleRetry() {
    if (this.disposed)
      return;
    if (this.retryTimer)
      return;
    this.retryDelayMs = this.retryDelayMs ? Math.min(this.retryDelayMs * 2, FLUSH_RETRY_MAX_MS) : FLUSH_RETRY_BASE_MS;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, this.retryDelayMs);
  }
  /** 6.9/R32：写盘成功后清退避状态。 */
  resetRetry() {
    this.retryDelayMs = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  /** 设置日志文件写入等级阈值（与 GUI 设置页日志等级联动）。 */
  setLevel(level) {
    this.fileLevel = level;
  }
  info(message, channel = "GUI") {
    this.log("info", channel, message);
  }
  debug(message, channel = "GUI") {
    this.log("debug", channel, message);
  }
  warn(message, channel = "GUI") {
    this.log("warning", channel, message);
  }
  error(message, channel = "GUI") {
    this.log("error", channel, message);
  }
  /** 通用方法，level 作为字符串传入 */
  logLevel(level, message, channel = "GUI") {
    const normalized = level === "warn" ? "warning" : level;
    const l = ["debug", "info", "warning", "error", "critical"].includes(normalized) ? normalized : "info";
    this.log(l, channel, message);
  }
  /** 仅写入日志文件和控制台，不推送到 UI 面板（用于原始输出等不适合展示的内容） */
  logToFile(message) {
    this.log("error", "GUI", message, false);
  }
  /** 手动刷新缓冲区到文件；返回本次写入的完成 Promise */
  flush() {
    if (!this.opts || this.buffer.length === 0)
      return this.flushInFlight ? this.flushPromise : Promise.resolve();
    if (this.flushInFlight)
      return this.flushPromise;
    const pending = this.buffer;
    this.buffer = [];
    this.flushInFlight = true;
    this.flushPromise = this.opts.appendGuiLog(pending.join("")).then(() => {
      this.flushInFlight = false;
      this.resetRetry();
      if (this.buffer.length >= FLUSH_BATCH_THRESHOLD)
        void this.flush();
    }).catch((error) => {
      this.buffer = [...pending, ...this.buffer];
      this.trimBuffer();
      this.flushInFlight = false;
      console.error("[Logger] GUI log write failed:", error);
      this.scheduleRetry();
    });
    return this.flushPromise;
  }
  /** 等待缓冲区全部写入文件（退出前由主进程等待） */
  async flushAsync() {
    for (let i = 0; i < 4; i++) {
      if (this.flushInFlight) {
        await this.flushPromise;
        continue;
      }
      if (!this.opts || this.buffer.length === 0)
        return;
      await this.flush();
    }
  }
  log(level, channel, message, showInUi = true) {
    const ts = formatTimestamp();
    if (LEVEL_ORDER[level] >= LEVEL_ORDER[this.fileLevel]) {
      this.buffer.push(`${ts} | ${level.toUpperCase().padEnd(5)} | ${channel} | ${message}
`);
      if (this.buffer.length > MAX_BUFFER_ENTRIES)
        this.trimBuffer();
      if (this.buffer.length >= FLUSH_BATCH_THRESHOLD)
        this.flush();
    }
    const tag = `[${channel}]`;
    switch (level) {
      case "error":
      case "critical":
        console.error(tag, message);
        break;
      case "warning":
        console.warn(tag, message);
        break;
      case "debug":
        console.debug(tag, message);
        break;
      default:
        console.log(tag, message);
    }
    if (showInUi)
      this.opts?.uiCallback(level, channel, message);
  }
};
exports.Logger = new LoggerImpl();