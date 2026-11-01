"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS = exports.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS = void 0;
exports.normalFightDailyLimit = normalFightDailyLimit;
exports.normalFightTaskKey = normalFightTaskKey;
exports.uniqueNormalFightTasks = uniqueNormalFightTasks;
exports.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS = 999;
exports.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS = 1;
function normalFightDailyLimit(value, fallback = exports.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    return fallback;
  return Math.max(1, Math.min(exports.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS, Math.trunc(parsed)));
}
function normalFightTaskKey(task) {
  const name = task.name.trim().replace(/\\/g, "/").toLocaleLowerCase();
  const plan = task.source ? `${task.source}:${name}` : name;
  return JSON.stringify([
    plan,
    task.fleet_id ?? null,
    task.fleet_preset_index ?? null
  ]);
}
function uniqueNormalFightTasks(tasks) {
  const seen = /* @__PURE__ */ new Set();
  return tasks.filter((task) => {
    const key = normalFightTaskKey(task);
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}