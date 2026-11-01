"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailySortieStats = void 0;
var statistics_js_1 = require_statistics();
var StorageAdapter_js_1 = require_StorageAdapter();
var STORAGE_KEY = "daily_sortie_stats_v1";
var STORAGE_VERSION = 1;
var LOG_DEDUP_WINDOW_MS = 1200;
var DROP_NOTICE_DURATION_MS = 6e4;
var QUINCY_SHIP_NAME = "\u6606\u897F";
var DEFAULT_LOOT_LIMIT = 50;
var DEFAULT_SHIP_LIMIT = 500;
function emptyGrades() {
  return { SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0 };
}
function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function safeCount(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}
function createEmptyState(timestamp) {
  return {
    version: STORAGE_VERSION,
    dateKey: localDateKey(timestamp),
    battleCount: 0,
    grades: emptyGrades(),
    quickRepairCount: 0,
    lootCount: 0,
    lootLimit: DEFAULT_LOOT_LIMIT,
    shipCount: 0,
    shipLimit: DEFAULT_SHIP_LIMIT,
    expeditionCount: 0,
    shipDrops: {}
  };
}
function sanitizeState(value, timestamp) {
  if (!value || typeof value !== "object")
    return createEmptyState(timestamp);
  const source = value;
  if (source.version !== STORAGE_VERSION || source.dateKey !== localDateKey(timestamp)) {
    return createEmptyState(timestamp);
  }
  const grades = emptyGrades();
  for (const grade of statistics_js_1.BATTLE_GRADES) {
    grades[grade] = safeCount(source.grades?.[grade]);
  }
  const shipDrops = {};
  if (source.shipDrops && typeof source.shipDrops === "object") {
    for (const [rawName, rawCount] of Object.entries(source.shipDrops)) {
      const name = rawName.trim();
      const count = safeCount(rawCount);
      if (name && count > 0)
        shipDrops[name] = count;
    }
  }
  return {
    version: STORAGE_VERSION,
    dateKey: source.dateKey,
    battleCount: safeCount(source.battleCount),
    grades,
    quickRepairCount: safeCount(source.quickRepairCount),
    lootCount: safeCount(source.lootCount),
    lootLimit: safeCount(source.lootLimit, DEFAULT_LOOT_LIMIT) || DEFAULT_LOOT_LIMIT,
    shipCount: safeCount(source.shipCount),
    shipLimit: safeCount(source.shipLimit, DEFAULT_SHIP_LIMIT) || DEFAULT_SHIP_LIMIT,
    expeditionCount: safeCount(source.expeditionCount),
    shipDrops
  };
}
function parseStatsEvent(message) {
  const battleMatch = message.match(/\[Combat\]\s*战果:\s*.*?评价\s*[=：:]\s*(SS|S|A|B|C|D)\b/i);
  if (battleMatch) {
    return {
      type: "battle",
      grade: battleMatch[1].toUpperCase()
    };
  }
  const quickRepairMatch = message.match(/\[UI\]\s*修理位置:\s*\[([0-9,\s]*)\]/);
  if (quickRepairMatch) {
    const count = quickRepairMatch[1].split(",").map((value) => value.trim()).filter((value) => /^\d+$/.test(value)).length;
    return { type: "quick-repair", count };
  }
  const lootMatch = message.match(/\[UI\]\s*战利品数量:\s*(\d+)\s*\/\s*(\d+)/);
  if (lootMatch) {
    return {
      type: "loot-count",
      count: Number(lootMatch[1]),
      limit: Number(lootMatch[2])
    };
  }
  const shipCountMatch = message.match(/\[UI\]\s*舰船数量:\s*(\d+)\s*\/\s*(\d+)/);
  if (shipCountMatch) {
    return {
      type: "ship-count",
      count: Number(shipCountMatch[1]),
      limit: Number(shipCountMatch[2])
    };
  }
  const shipDropMatch = message.match(/\[Combat\]\s*获得舰船:\s*(.+?)\s*$/);
  if (shipDropMatch?.[1].trim()) {
    return { type: "ship-drop", shipName: shipDropMatch[1].trim() };
  }
  const expeditionMatch = message.match(/\[UI\]\s*远征收取:\s*(\d+)\s*支/);
  if (expeditionMatch) {
    return { type: "expedition", count: Number(expeditionMatch[1]) };
  }
  return null;
}
var DailySortieStats = class {
  constructor(storage = StorageAdapter_js_1.browserStorageStore, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.dropNotice = null;
    this.recentLogs = /* @__PURE__ */ new Map();
    this.state = this.load(this.now());
  }
  /** 解析一条运行日志。返回 true 表示统计显示内容发生变化。 */
  consume(message, timestamp = this.now()) {
    const dayChanged = this.ensureCurrentDay(timestamp);
    const normalized = message.trim();
    const event = parseStatsEvent(normalized);
    if (!event)
      return dayChanged;
    if (this.isDuplicate(normalized, timestamp))
      return dayChanged;
    switch (event.type) {
      case "battle":
        this.state.battleCount += 1;
        this.state.grades[event.grade] += 1;
        break;
      case "quick-repair":
        if (event.count === 0)
          return dayChanged;
        this.state.quickRepairCount += event.count;
        break;
      case "loot-count":
        this.state.lootCount = safeCount(event.count);
        this.state.lootLimit = safeCount(event.limit, DEFAULT_LOOT_LIMIT) || DEFAULT_LOOT_LIMIT;
        break;
      case "ship-count":
        this.state.shipCount = safeCount(event.count);
        this.state.shipLimit = safeCount(event.limit, DEFAULT_SHIP_LIMIT) || DEFAULT_SHIP_LIMIT;
        break;
      case "ship-drop":
        this.state.shipCount += 1;
        this.state.shipDrops[event.shipName] = (this.state.shipDrops[event.shipName] ?? 0) + 1;
        if (event.shipName === QUINCY_SHIP_NAME) {
          this.dropNotice = {
            shipName: event.shipName,
            dailyIndex: this.state.shipCount,
            visibleUntil: timestamp + DROP_NOTICE_DURATION_MS
          };
        }
        break;
      case "expedition":
        this.state.expeditionCount += safeCount(event.count);
        break;
    }
    this.save();
    return true;
  }
  getSnapshot(timestamp = this.now()) {
    this.ensureCurrentDay(timestamp);
    if (this.dropNotice && this.dropNotice.visibleUntil <= timestamp) {
      this.dropNotice = null;
    }
    return {
      battleCount: this.state.battleCount,
      grades: { ...this.state.grades },
      quickRepairCount: this.state.quickRepairCount,
      lootCount: this.state.lootCount,
      lootLimit: this.state.lootLimit,
      shipCount: this.state.shipCount,
      shipLimit: this.state.shipLimit,
      expeditionCount: this.state.expeditionCount,
      shipDrops: Object.entries(this.state.shipDrops).map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN")),
      dropNotice: this.dropNotice ? { ...this.dropNotice } : null
    };
  }
  reset(timestamp = this.now()) {
    this.state = createEmptyState(timestamp);
    this.dropNotice = null;
    this.recentLogs.clear();
    this.save();
  }
  ensureCurrentDay(timestamp) {
    if (this.state.dateKey === localDateKey(timestamp))
      return false;
    this.reset(timestamp);
    return true;
  }
  isDuplicate(message, timestamp) {
    const previous = this.recentLogs.get(message);
    this.recentLogs.set(message, timestamp);
    for (const [loggedMessage, loggedAt] of this.recentLogs) {
      if (timestamp < loggedAt || timestamp - loggedAt >= LOG_DEDUP_WINDOW_MS) {
        this.recentLogs.delete(loggedMessage);
      }
    }
    return previous !== void 0 && timestamp >= previous && timestamp - previous < LOG_DEDUP_WINDOW_MS;
  }
  load(timestamp) {
    try {
      const raw = this.storage.get(STORAGE_KEY);
      if (!raw)
        return createEmptyState(timestamp);
      return sanitizeState(JSON.parse(raw), timestamp);
    } catch {
      return createEmptyState(timestamp);
    }
  }
  save() {
    try {
      this.storage.set(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
    }
  }
};
exports.DailySortieStats = DailySortieStats;