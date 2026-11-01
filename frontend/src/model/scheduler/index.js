"use strict";
var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
}));
var __exportStar = exports && exports.__exportStar || function(m, exports2) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPriority = exports.uniqueNormalFightTasks = exports.normalFightTaskKey = exports.normalFightDailyLimit = exports.NormalFightDailyQuota = exports.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS = exports.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS = exports.CampaignDailyQuota = exports.CronScheduler = exports.Scheduler = void 0;
var Scheduler_1 = require_Scheduler();
Object.defineProperty(exports, "Scheduler", { enumerable: true, get: function() {
  return Scheduler_1.Scheduler;
} });
__exportStar(require_SchedulerTaskPolicy(), exports);
var CronScheduler_1 = require_CronScheduler();
Object.defineProperty(exports, "CronScheduler", { enumerable: true, get: function() {
  return CronScheduler_1.CronScheduler;
} });
var CampaignDailyQuota_1 = require_CampaignDailyQuota();
Object.defineProperty(exports, "CampaignDailyQuota", { enumerable: true, get: function() {
  return CampaignDailyQuota_1.CampaignDailyQuota;
} });
var NormalFightDailyQuota_1 = require_NormalFightDailyQuota();
Object.defineProperty(exports, "DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS", { enumerable: true, get: function() {
  return NormalFightDailyQuota_1.DEFAULT_NORMAL_FIGHT_DAILY_EXECUTIONS;
} });
Object.defineProperty(exports, "MAX_NORMAL_FIGHT_DAILY_EXECUTIONS", { enumerable: true, get: function() {
  return NormalFightDailyQuota_1.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS;
} });
Object.defineProperty(exports, "NormalFightDailyQuota", { enumerable: true, get: function() {
  return NormalFightDailyQuota_1.NormalFightDailyQuota;
} });
Object.defineProperty(exports, "normalFightDailyLimit", { enumerable: true, get: function() {
  return NormalFightDailyQuota_1.normalFightDailyLimit;
} });
Object.defineProperty(exports, "normalFightTaskKey", { enumerable: true, get: function() {
  return NormalFightDailyQuota_1.normalFightTaskKey;
} });
Object.defineProperty(exports, "uniqueNormalFightTasks", { enumerable: true, get: function() {
  return NormalFightDailyQuota_1.uniqueNormalFightTasks;
} });
var scheduler_1 = require_scheduler();
Object.defineProperty(exports, "TaskPriority", { enumerable: true, get: function() {
  return scheduler_1.TaskPriority;
} });