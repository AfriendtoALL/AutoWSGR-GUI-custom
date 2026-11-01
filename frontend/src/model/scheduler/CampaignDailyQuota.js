"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignDailyQuota = void 0;
var StorageAdapter_js_1 = require_StorageAdapter();
var STORAGE_KEY = "campaign_daily_quota_v1";
var STORAGE_VERSION = 1;
function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function campaignKey(campaignName) {
  return campaignName.trim().toLocaleLowerCase() || "__default__";
}
function targetCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    return 1;
  return Math.max(1, Math.trunc(parsed));
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
var CampaignDailyQuota = class {
  constructor(storage = StorageAdapter_js_1.browserStorageStore, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.state = this.load(this.now());
  }
  remaining(campaignName, target, timestamp = this.now()) {
    this.ensureCurrentDay(timestamp);
    const completed = this.state.completed[campaignKey(campaignName)] ?? 0;
    return Math.max(0, targetCount(target) - completed);
  }
  markCompleted(campaignName, target, timestamp = this.now()) {
    this.ensureCurrentDay(timestamp);
    const key = campaignKey(campaignName);
    this.state.completed[key] = Math.min(targetCount(target), (this.state.completed[key] ?? 0) + 1);
    this.save();
    return this.remaining(campaignName, target, timestamp);
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
exports.CampaignDailyQuota = CampaignDailyQuota;