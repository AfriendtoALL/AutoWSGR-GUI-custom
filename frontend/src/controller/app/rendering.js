"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAcquisitionText = buildAcquisitionText;
exports.buildMainViewObject = buildMainViewObject;
var constants_1 = require_constants();
function buildAcquisitionText(trackedLoot, trackedShip) {
  const parts = [];
  if (trackedLoot)
    parts.push(`\u88C5\u5907 ${trackedLoot}`);
  if (trackedShip)
    parts.push(`\u8230\u8239 ${trackedShip}`);
  return parts.length > 0 ? parts.join(" | ") : void 0;
}
function buildMainViewObject(state) {
  const { scheduler, currentFleet, currentProgress, trackedLoot, trackedShip, dailySortieStats, wsConnected, expeditionTimerText } = state;
  const running = scheduler.currentRunningTask;
  const queue = scheduler.taskQueue;
  const lease = scheduler.deviceLease;
  const leaseHolder = typeof lease?.holder === "string" ? lease.holder.trim() : "";
  const emulatorConnected = scheduler.emulatorConnected !== false;
  const busyWhileIdle = scheduler.status === "idle" && leaseHolder.length > 0;
  const status = busyWhileIdle ? "busy" : scheduler.status === "not_connected" ? "not_connected" : scheduler.status;
  const uiState = scheduler.uiState ?? null;
  const uiStateActive = status === "running";
  const uiStateStale = uiStateActive && scheduler.uiStateStale === true;
  const uiStateStaleAfterSeconds = Math.max(1, Math.round((Number(scheduler.uiStateStaleAfterMs) || 3e4) / 1e3));
  const statusText = busyWhileIdle ? `\u8BBE\u5907\u5FD9\uFF1A${leaseHolder}` : scheduler.status === "idle" && queue.length > 0 ? "\u961F\u5217\u5DF2\u6682\u505C" : constants_1.STATUS_TEXT[scheduler.status] ?? "\u672A\u77E5";
  // Keep the running status while a task drains, append a hint, and let
  // StatusBar force the red dot (5.1).
  const displayStatusText = !emulatorConnected && status !== "not_connected" ? `${statusText}\uFF08\u6A21\u62DF\u5668\u5DF2\u65AD\u5F00\uFF09` : statusText;
  const taskQueueVo = [];
  if (running) {
    let progressPercent = 0;
    if (currentProgress) {
      const parts = currentProgress.split("/");
      if (parts.length === 2) {
        const cur = parseInt(parts[0], 10);
        const total = parseInt(parts[1], 10);
        if (total > 0)
          progressPercent = cur / total;
      }
    }
    taskQueueVo.push({
      id: running.id,
      name: running.name,
      priorityLabel: constants_1.PRIORITY_LABELS[running.priority] ?? "\u7528\u6237",
      remaining: running.remainingTimes,
      totalTimes: running.totalTimes,
      unlimited: running.unlimited,
      progress: currentProgress || void 0,
      progressPercent,
      acquisitionText: buildAcquisitionText(trackedLoot, trackedShip)
    });
  }
  for (const t of queue) {
    taskQueueVo.push({
      id: t.id,
      name: t.name,
      priorityLabel: constants_1.PRIORITY_LABELS[t.priority] ?? "\u7528\u6237",
      remaining: t.remainingTimes,
      totalTimes: t.totalTimes,
      unlimited: t.unlimited,
      interrupted: t.interrupted === true,
      interruptedText: t.interrupted === true ? "上次运行中断" : void 0
    });
  }
  for (const waiting of scheduler.waitingTaskList) {
    const t = waiting.task;
    taskQueueVo.push({
      id: t.id,
      name: t.name,
      priorityLabel: constants_1.PRIORITY_LABELS[t.priority] ?? "\u7528\u6237",
      remaining: t.remainingTimes,
      totalTimes: t.totalTimes,
      unlimited: t.unlimited,
      waiting: true,
      waitingText: waiting.reason === "gap" ? "\u7B49\u5F85\u4E0B\u4E00\u8F6E" : "\u7B49\u5F85\u91CD\u8BD5"
    });
  }
  return {
    status,
    statusText: displayStatusText,
    emulatorConnected,
    currentTask: running ? {
      name: running.name,
      type: running.type,
      progress: currentProgress || "0/0",
      startedAt: ""
    } : null,
    currentFleet,
    dailySortieStats,
    expeditionTimer: expeditionTimerText,
    taskQueue: taskQueueVo,
    wsConnected,
    resolutionFallback: scheduler.resolutionFallback === true,
    deviceLease: leaseHolder ? { holder: leaseHolder, since: typeof lease.since === "string" ? lease.since : null } : null,
    uiState: uiState ? {
      page: uiState.page ?? null,
      substate: uiState.substate ?? null,
      phase: uiState.phase ?? null,
      stack: Array.isArray(uiState.stack) ? [...uiState.stack] : []
    } : null,
    uiStateActive,
    uiStateStale,
    uiStateStaleAfterSeconds,
    runningTaskId: running?.id ?? null
  };
}