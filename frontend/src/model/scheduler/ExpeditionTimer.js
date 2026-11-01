"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpeditionTimer = void 0;
var EXPEDITION_TIMER_TICK_MS = 1e3;
var ExpeditionTimer = class {
  constructor(intervalMs, callbacks) {
    this.timer = null;
    this.tickTimer = null;
    this.lastCheck = 0;
    this._intervalMs = intervalMs;
    this.callbacks = callbacks;
  }
  /** 更新间隔（毫秒），如果正在运行则自动重启 */
  setInterval(ms) {
    this._intervalMs = ms;
    if (this.timer) {
      this.start();
    }
  }
  start() {
    this.lastCheck = Date.now();
    this.stop();
    this.timer = setInterval(() => {
      this.lastCheck = Date.now();
      this.callbacks.onTrigger();
    }, this._intervalMs);
    this.tickTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastCheck;
      const remaining = Math.max(0, this._intervalMs - elapsed);
      this.callbacks.onTick?.(Math.ceil(remaining / 1e3));
    }, EXPEDITION_TIMER_TICK_MS);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
  get isRunning() {
    return this.timer != null;
  }
};
exports.ExpeditionTimer = ExpeditionTimer;