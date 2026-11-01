"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NormalFightDailyQuota = exports.uniqueNormalFightTasks = exports.normalFightTaskKey = exports.normalFightDailyLimit = exports.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS = exports.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS = void 0;
var StorageAdapter_js_1 = require_StorageAdapter();
var normalFightQuota_js_1 = require_normalFightQuota();
var normalFightQuota_js_2 = require_normalFightQuota();
Object.defineProperty(exports, "DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS", { enumerable: true, get: function() {
  return normalFightQuota_js_2.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS;
} });
Object.defineProperty(exports, "MAX_NORMAL_FIGHT_DAILY_EXECUTIONS", { enumerable: true, get: function() {
  return normalFightQuota_js_2.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS;
} });
Object.defineProperty(exports, "normalFightDailyLimit", { enumerable: true, get: function() {
  return normalFightQuota_js_2.normalFightDailyLimit;
} });
Object.defineProperty(exports, "normalFightTaskKey", { enumerable: true, get: function() {
  return normalFightQuota_js_2.normalFightTaskKey;
} });
Object.defineProperty(exports, "uniqueNormalFightTasks", { enumerable: true, get: function() {
  return normalFightQuota_js_2.uniqueNormalFightTasks;
} });
var STORAGE_KEY = "normal_fight_daily_quota_v1";
var STORAGE_VERSION = 1;
function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function emptyState(timestamp) {
  return {
    version: STORAGE_VERSION,
    dateKey: localDateKey(timestamp),
    completed: {}
  };
}
function sanitizeState(value, timestamp) {
  if (!value || typeof value !== "object")
    return emptyState(timestamp);
  const source = value;
  if (source.version !== STORAGE_VERSION || source.dateKey !== localDateKey(timestamp) || !source.completed || typeof source.completed !== "object") {
    return emptyState(timestamp);
  }
  const completed = {};
  for (const [key, rawCount] of Object.entries(source.completed)) {
    const count = Number(rawCount);
    if (key && Number.isFinite(count) && count > 0) {
      completed[key] = Math.trunc(count);
    }
  }
  return {
    version: STORAGE_VERSION,
    dateKey: source.dateKey,
    completed
  };
}
var NormalFightDailyQuota = class {
  constructor(storage = StorageAdapter_js_1.browserStorageStore, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.state = this.load(this.now());
  }
  remaining(task, timestamp = this.now()) {
    this.ensureCurrentDay(timestamp);
    const limit = (0, normalFightQuota_js_1.normalFightDailyLimit)(task.times);
    const completed = this.state.completed[(0, normalFightQuota_js_1.normalFightTaskKey)(task)] ?? 0;
    return Math.max(0, limit - completed);
  }
  totalRemaining(tasks, timestamp = this.now()) {
    return (0, normalFightQuota_js_1.uniqueNormalFightTasks)(tasks).reduce((total, task) => total + this.remaining(task, timestamp), 0);
  }
  hasRemaining(tasks, timestamp = this.now()) {
    return (0, normalFightQuota_js_1.uniqueNormalFightTasks)(tasks).some((task) => this.remaining(task, timestamp) > 0);
  }
  markCompleted(task, timestamp = this.now()) {
    this.ensureCurrentDay(timestamp);
    const key = (0, normalFightQuota_js_1.normalFightTaskKey)(task);
    this.state.completed[key] = (this.state.completed[key] ?? 0) + 1;
    this.save();
    return this.remaining(task, timestamp);
  }
  ensureCurrentDay(timestamp) {
    if (this.state.dateKey === localDateKey(timestamp))
      return;
    this.state = emptyState(timestamp);
    this.save();
  }
  load(timestamp) {
    try {
      const raw = this.storage.get(STORAGE_KEY);
      return raw ? sanitizeState(JSON.parse(raw), timestamp) : emptyState(timestamp);
    } catch {
      return emptyState(timestamp);
    }
  }
  save() {
    try {
      this.storage.set(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
    }
  }
};
exports.NormalFightDailyQuota = NormalFightDailyQuota;