"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskQueue = void 0;
exports.generateTaskId = generateTaskId;
exports.parseUiCount = parseUiCount;
exports.normalizeRoundTask = normalizeRoundTask;
var scheduler_1 = require_scheduler();
var SchedulerTaskPolicy_js_1 = require_SchedulerTaskPolicy();
var nextTaskId = 1;
function generateTaskId() {
  return `sched_${nextTaskId++}`;
}
function parseUiCount(msg, label) {
  const re = new RegExp(`\\[UI\\] ${label}[:\uFF1A]\\s*(\\d+)`);
  const m = msg.match(re);
  return m ? parseInt(m[1], 10) : null;
}
function normalizeRoundTask(type, request, times) {
  const schedulerTimes = times === Number.POSITIVE_INFINITY ? times : Number.isFinite(times) ? Math.max(1, Math.trunc(times)) : 1;
  const isRoundBased = type === "normal_fight" || type === "event_fight" || type === "campaign";
  const hasRoundRequest = request.type === "normal_fight" || request.type === "event_fight" || request.type === "campaign";
  if (!isRoundBased || !hasRoundRequest) {
    return { request, times: schedulerTimes };
  }
  const requestTimes = Number.isFinite(request.times) ? Math.max(1, Math.trunc(request.times ?? 1)) : 1;
  return {
    request: { ...request, times: 1 },
    times: schedulerTimes === Number.POSITIVE_INFINITY ? schedulerTimes : Math.max(schedulerTimes, requestTimes)
  };
}
var TaskQueue = class {
  constructor() {
    this.queue = [];
  }
  // ── 队列读取 ──
  get items() {
    return this.queue;
  }
  get length() {
    return this.queue.length;
  }
  /** 从队首取出一个任务 */
  shift() {
    return this.queue.shift();
  }
  /** 检查队列中是否存在指定类型的任务 */
  hasType(type) {
    return this.queue.some((t) => t.type === type);
  }
  // ── 队列写入 ──
  /**
   * 按优先级插入队列。
   * 同优先级内按 sortKey 升序排列（sortKey 越小越靠前）。
   * beforeSamePriority=true 时，会插入到同优先级任务之前（用于重试/跟随）。
   */
  insertByPriority(task, beforeSamePriority = false) {
    const idx = (0, SchedulerTaskPolicy_js_1.findPriorityInsertionIndex)(this.queue, task, beforeSamePriority);
    if (idx === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(idx, 0, task);
    }
  }
  /** 创建任务并按优先级入队，返回任务 ID */
  addTask(name, type, request, priority = scheduler_1.TaskPriority.USER_TASK, times = 1, stopCondition, forceRetry, allowPolling, endpointNodes, endpointResult, sortKey) {
    const id = generateTaskId();
    const normalized = normalizeRoundTask(type, request, times);
    const task = (0, SchedulerTaskPolicy_js_1.createSchedulerTask)({
      id,
      name,
      type,
      request: normalized.request,
      priority,
      times: normalized.times,
      stopCondition,
      forceRetry,
      allowPolling,
      endpointNodes,
      endpointResult,
      sortKey
    });
    this.insertByPriority(task);
    return id;
  }
  /** 查找队列中的任务。 */
  findTask(taskId) {
    return this.queue.find((task) => task.id === taskId) ?? null;
  }
  /** 移除队列中的任务，并返回被移除的任务。 */
  removeTask(taskId) {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx === -1)
      return null;
    return this.queue.splice(idx, 1)[0];
  }
  removeTasksByLogicalId(logicalId) {
    this.queue = this.queue.filter((task) => task.logicalId !== logicalId);
  }
  /** 移动队列中的任务顺序 */
  moveTask(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.queue.length)
      return;
    if (toIndex < 0 || toIndex >= this.queue.length)
      return;
    if (fromIndex === toIndex)
      return;
    const [task] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, task);
  }
  /** 清空队列 */
  clear() {
    this.queue = [];
  }
  /** 6.12：恢复快照时按原顺序替换整个队列。 */
  replaceAll(tasks) {
    this.queue = Array.isArray(tasks) ? tasks.slice() : [];
  }
};
exports.TaskQueue = TaskQueue;