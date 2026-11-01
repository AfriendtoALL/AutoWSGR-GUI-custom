"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAMPAIGN_OUT_OF_TIMES_RESULT = void 0;
exports.getNonRetryableTaskResult = getNonRetryableTaskResult;
exports.findPriorityInsertionIndex = findPriorityInsertionIndex;
exports.createSchedulerTask = createSchedulerTask;
exports.buildFollowUpTask = buildFollowUpTask;
var scheduler_1 = require_scheduler();
exports.CAMPAIGN_OUT_OF_TIMES_RESULT = "out of times";
var MANUAL_REPAIR_TERMINATION_MARKERS = [
  "\u9700\u8981\u8FDB\u884C\u624B\u52A8\u4FEE\u7406",
  "\u624B\u52A8\u7EF4\u4FEE\u5904\u7406\u5931\u8D25"
];
function getNonRetryableTaskResult(task, result, error) {
  const errors = [
    ...error ? [error] : [],
    ...(result?.details ?? []).map((detail) => detail.error).filter((message) => typeof message === "string")
  ];
  const manualRepairError = errors.find((message) => MANUAL_REPAIR_TERMINATION_MARKERS.some((marker) => message.includes(marker)));
  if (manualRepairError)
    return manualRepairError;
  if (task.type !== "campaign")
    return null;
  return result?.details.some((detail) => detail.result === exports.CAMPAIGN_OUT_OF_TIMES_RESULT) ? exports.CAMPAIGN_OUT_OF_TIMES_RESULT : null;
}
function findPriorityInsertionIndex(queue, task, beforeSamePriority = false) {
  return queue.findIndex((current) => {
    if (current.priority < task.priority)
      return false;
    if (current.priority > task.priority)
      return true;
    const currentKey = current.sortKey ?? Infinity;
    const taskKey = task.sortKey ?? Infinity;
    return beforeSamePriority ? currentKey >= taskKey : currentKey > taskKey;
  });
}
function createSchedulerTask(options) {
  const times = options.times ?? 1;
  const unlimited = !Number.isFinite(times);
  const normalizedTimes = unlimited ? 1 : Math.max(1, Math.trunc(times));
  return {
    id: options.id,
    logicalId: options.id,
    name: options.name,
    type: options.type,
    priority: options.priority ?? scheduler_1.TaskPriority.USER_TASK,
    request: options.request,
    remainingTimes: normalizedTimes,
    totalTimes: normalizedTimes,
    unlimited,
    stopCondition: options.stopCondition,
    maxRetries: 2,
    retryCount: 0,
    forceRetry: options.forceRetry,
    allowPolling: !!options.allowPolling,
    endpointNodes: options.endpointNodes,
    endpointResult: options.endpointResult,
    sortKey: options.sortKey
  };
}
function buildFollowUpTask(task, remainingTimes, id) {
  return {
    id,
    logicalId: task.logicalId,
    name: task.name,
    type: task.type,
    priority: task.priority,
    request: task.request,
    remainingTimes,
    totalTimes: task.totalTimes,
    unlimited: task.unlimited,
    stopCondition: task.stopCondition,
    maxRetries: task.maxRetries,
    retryCount: 0,
    forceRetry: task.forceRetry,
    allowPolling: task.allowPolling,
    endpointNodes: task.endpointNodes,
    endpointResult: task.endpointResult,
    sortKey: task.sortKey
  };
}