"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scheduler = void 0;
var Logger_1 = require_Logger();
var index_js_1 = require_adapter();
var StopConditionChecker_1 = require_StopConditionChecker();
var ExpeditionTimer_1 = require_ExpeditionTimer();
var TaskQueue_1 = require_TaskQueue();
var scheduler_1 = require_scheduler();
var SchedulerTaskPolicy_js_1 = require_SchedulerTaskPolicy();
var RESULT_GRADE_ORDER = ["D", "C", "B", "A", "S", "SS"];
var DEFAULT_EXPEDITION_INTERVAL_MS = 15 * 60 * 1e3;
var STOP_CONFIRM_POLL_INTERVAL_MS = 250;
var STOP_CONFIRM_TIMEOUT_MS = 3e4;
var UI_STATE_STALE_MS = 3e4;
var Scheduler = class {
  constructor(api) {
    this.callbacks = {};
    this.currentTask = null;
    this.startingTaskId = null;
    this.pendingTaskCompletions = /* @__PURE__ */ new Map();
    this._status = "not_connected";
    this.systemActive = false;
    this.resolutionFallback = false;
    this.deviceLease = null;
    this.emulatorConnected = true;
    this.recognizerErrors = {};
    this.uiState = null;
    this.uiStateUpdatedAt = 0;
    this.uiStateStale = false;
    this.uiStateStaleTimer = null;
    this.uiStateStaleAfterMs = UI_STATE_STALE_MS;
    this.autoExpedition = true;
    this.stopRequest = null;
    this.lastStartError = null;
    this.startPromise = null;
    this.waitingTasks = /* @__PURE__ */ new Map();
    this.lootEventSeen = false;
    this.api = api;
    this._taskQueue = new TaskQueue_1.TaskQueue();
    this.stopChecker = new StopConditionChecker_1.StopConditionChecker(api, (level, message) => this.emitLog(level, message));
    this.expeditionTimer = new ExpeditionTimer_1.ExpeditionTimer(DEFAULT_EXPEDITION_INTERVAL_MS, {
      onTick: (sec) => this.callbacks.onExpeditionTimerTick?.(sec),
      onTrigger: () => this.handleExpeditionTrigger()
    });
    this.setupApiCallbacks();
  }
  // ── 公开 API ──
  setCallbacks(cb) {
    this.callbacks = cb;
  }
  /** 更新远征检查间隔（分钟），立即重启定时器 */
  setExpeditionInterval(minutes) {
    const clamped = Math.max(1, Math.min(120, minutes));
    this.expeditionTimer.setInterval(clamped * 60 * 1e3);
  }
  /** 开关自动远征检查；运行中修改时立即启停定时器 */
  setAutoExpedition(enabled) {
    this.autoExpedition = enabled;
    if (!enabled) {
      this.expeditionTimer.stop();
    } else if (this.systemActive && !this.expeditionTimer.isRunning) {
      this.expeditionTimer.start();
    }
  }
  get status() {
    return this._status;
  }
  get currentRunningTask() {
    return this.currentTask;
  }
  get taskQueue() {
    return this._taskQueue.items;
  }
  /** 当前无运行、排队、重试或修理延迟任务，可接收空闲自动任务。 */
  get isCompletelyIdle() {
    return this.systemActive && this._status === "idle" && this.currentTask === null && this._taskQueue.length === 0 && this.waitingTasks.size === 0;
  }
  /** 获取轮次间隔或失败重试中的任务。 */
  get waitingTaskList() {
    return [...this.waitingTasks.values()].sort((left, right) => left.readyAt - right.readyAt).map(({ task, reason, readyAt }) => ({
      task,
      reason,
      readyAt
    }));
  }
  /** 按物理任务 ID 查找运行中、排队中或等待中的任务。 */
  findTask(taskId) {
    if (this.currentTask?.id === taskId)
      return this.currentTask;
    return this._taskQueue.findTask(taskId) ?? this.waitingTasks.get(taskId)?.task ?? null;
  }
  /** 执行一次远征检查（系统启动时与远征任务消费时共用） */
  async checkExpedition() {
    this.emitLog("info", "\u6B63\u5728\u68C0\u67E5\u8FDC\u5F81...");
    const provisionalLease = {
      holder: "api:expedition-check",
      since: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.setDeviceLease(provisionalLease);
    try {
      await this.api.expeditionCheck();
      this.emitLog("info", "\u8FDC\u5F81\u68C0\u67E5\u5B8C\u6210");
    } catch {
      this.emitLog("debug", "\u8FDC\u5F81\u68C0\u67E5\u8DF3\u8FC7");
    } finally {
      if (this.deviceLease?.holder === provisionalLease.holder) {
        this.setDeviceLease(null);
      }
      void this.refreshSystemStatus();
    }
  }
  /** 启动系统 (连接模拟器 + 启动游戏)；进行中的 Promise 复用，避免重复启动。 */
  start(configPath) {
    if (this.startPromise)
      return this.startPromise;
    this.startPromise = this.startInternal(configPath).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }
  async startInternal(configPath) {
    const resp = await this.api.systemStart(configPath, 3e5);
    if (!resp.success) {
      const reason = typeof resp.error === "string" && resp.error.trim()
        ? resp.error.trim()
        : typeof resp.message === "string" && resp.message.trim()
          ? resp.message.trim()
          : "模拟器连接/游戏启动异常";
      this.lastStartError = reason;
      return false;
    }
    this.lastStartError = null;
    this.systemActive = true;
    this.stopRequest = null;
    this.api.connectWebSockets();
    await this.refreshSystemStatus();
    this.setStatus("idle");
    if (this.autoExpedition) {
      await this.checkExpedition();
      this.expeditionTimer.start();
    }
    return true;
  }
  /** 仅检查后端是否可达 (不触发 system start) */
  async ping() {
    try {
      const resp = await this.api.systemStatus();
      if (!resp.success)
        return false;
      this.setResolutionFallback(resp.data?.resolution_fallback === true);
      this.setRecognizerErrors(resp.data?.recognizer_errors);
      this.setDeviceLease(resp.data?.device_lease);
      const connected = resp.data?.emulator_connected === true;
      this.setEmulatorConnected(connected);
      if (!connected)
        this.handleEmulatorDisconnected();
      return true;
    } catch {
      return false;
    }
  }
  /** Heartbeat saw the emulator drop: turn red; when idle, fall back to not_connected. */
  handleEmulatorDisconnected() {
    if (this.currentTask)
      return;
    if (this._status === "not_connected")
      return;
    this.systemActive = false;
    this.expeditionTimer.stop();
    this.setStatus("not_connected");
    this.emitLog("warn", "\u6A21\u62DF\u5668\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u5DF2\u5207\u56DE\u300C\u672A\u8FDE\u63A5\u300D");
  }
  /** Sync the backend liveness probe; false turns the status bar red. */
  setEmulatorConnected(connected) {
    const next = connected === true;
    if (this.emulatorConnected === next)
      return;
    this.emulatorConnected = next;
    this.callbacks.onStatusChange?.(this._status);
  }
  /** 检查后端系统是否已经完成模拟器连接。 */
  async isSystemReady() {
    try {
      const resp = await this.api.systemStatus();
      if (resp.success) {
        this.setResolutionFallback(resp.data?.resolution_fallback === true);
        this.setRecognizerErrors(resp.data?.recognizer_errors);
        this.setDeviceLease(resp.data?.device_lease);
        this.setEmulatorConnected(resp.data?.emulator_connected === true);
      }
      return resp.success && resp.data?.emulator_connected === true;
    } catch {
      return false;
    }
  }
  /** 主动同步一次系统状态（启动完成后调用）。 */
  async refreshSystemStatus() {
    try {
      const resp = await this.api.systemStatus();
      if (resp.success) {
        this.setResolutionFallback(resp.data?.resolution_fallback === true);
        this.setRecognizerErrors(resp.data?.recognizer_errors);
        this.setDeviceLease(resp.data?.device_lease);
        this.setEmulatorConnected(resp.data?.emulator_connected === true);
      }
    } catch {
    }
  }
  setResolutionFallback(enabled) {
    const next = enabled === true;
    if (this.resolutionFallback === next)
      return;
    this.resolutionFallback = next;
    if (next)
      Logger_1.Logger.warn("\u5206\u8FA8\u7387\u672A\u8BC6\u522B\uFF0C\u4F7F\u7528\u9ED8\u8BA4 960\u00D7540");
    this.callbacks.onStatusChange?.(this._status);
  }
  /** 同步后端设备租约快照；holder 为空视为设备空闲。 */
  setDeviceLease(lease) {
    const holder = typeof lease?.holder === "string" ? lease.holder.trim() : "";
    const next = holder ? {
      holder,
      since: typeof lease.since === "string" ? lease.since : null
    } : null;
    const prev = this.deviceLease;
    const unchanged = prev === next || prev !== null && next !== null && prev.holder === next.holder && prev.since === next.since;
    if (unchanged)
      return;
    this.deviceLease = next;
    this.callbacks.onStatusChange?.(this._status);
  }
  setRecognizerErrors(errors) {
    const next = {};
    if (errors && typeof errors === "object") {
      for (const [name, raw] of Object.entries(errors)) {
        const count = Number(raw);
        if (Number.isFinite(count) && count > 0)
          next[name] = Math.trunc(count);
      }
    }
    const prev = this.recognizerErrors;
    const nextKeys = Object.keys(next);
    const unchanged = nextKeys.length === Object.keys(prev).length && nextKeys.every((name) => prev[name] === next[name]);
    if (unchanged)
      return;
    this.recognizerErrors = next;
    this.callbacks.onRecognizerErrorsChange?.(next);
  }
  /**
   * HTTP 超时但后端实际已就绪时的恢复:
   * 建立 WebSocket、设置状态、启动远征检查。
   */
  recoverAfterTimeout() {
    this.systemActive = true;
    this.stopRequest = null;
    this.api.connectWebSockets();
    void this.refreshSystemStatus();
    this.setStatus("idle");
    if (this.autoExpedition)
      this.expeditionTimer.start();
  }
  /**
   * 停止系统并释放调度资源。
   * 当前没有生产调用方，保留为正式生命周期清理接口。
   */
  async stop() {
    const hadRunningTask = this.currentTask !== null;
    const canceledLogicalIds = this.collectLogicalIds([
      ...this.currentTask ? [this.currentTask] : [],
      ...this._taskQueue.items,
      ...this.waitingTaskList.map((item) => item.task)
    ]);
    this.systemActive = false;
    this.stopRequest = null;
    this.expeditionTimer.stop();
    this.clearWaitingTasks();
    this._taskQueue.clear();
    this.currentTask = null;
    this.emitLogicalCancellations(canceledLogicalIds, "system_stopped");
    try {
      if (hadRunningTask) {
        try {
          await this.api.taskStop();
        } catch (e) {
          this.emitLog("warn", `\u505C\u6B62\u5F53\u524D\u4EFB\u52A1\u5931\u8D25: ${String(e)}`);
        }
      }
      try {
        await this.api.systemStop();
      } catch (e) {
        this.emitLog("warn", `\u505C\u6B62\u540E\u7AEF\u7CFB\u7EDF\u5931\u8D25: ${String(e)}`);
      }
    } finally {
      this.api.disconnectWebSockets();
      this.stopRequest = null;
      this.resolutionFallback = false;
      this.deviceLease = null;
      this.resetUiState();
      this.setRecognizerErrors({});
      this.setStatus("not_connected");
      this.notifyQueueChange();
    }
  }
  /** 添加任务到队列。 */
  addTask(name, type, request, priority = scheduler_1.TaskPriority.USER_TASK, times = 1, stopCondition, forceRetry, allowPolling, endpointNodes, endpointResult, sortKey) {
    const id = this._taskQueue.addTask(name, type, request, priority, times, stopCondition, forceRetry, allowPolling, endpointNodes, endpointResult, sortKey);
    this.notifyQueueChange();
    return id;
  }
  /** 手动开始消费队列 */
  startConsuming() {
    if (!this.currentTask)
      this.stopRequest = null;
    if (this._status === "idle" && !this.currentTask && this._taskQueue.length > 0) {
      this.consumeNext();
    }
  }
  /** 移除排队或等待中的任务（不能移除正在运行的任务）。 */
  removeTask(taskId) {
    const removed = this._taskQueue.removeTask(taskId) ?? this.removeWaitingTask(taskId);
    if (!removed)
      return false;
    if (!this.hasLogicalTask(removed.logicalId)) {
      this.callbacks.onLogicalTaskCanceled?.(removed.logicalId, "removed");
    }
    this.notifyQueueChange();
    return true;
  }
  /**
   * 请求停止当前任务，等待后端 worker 退出后再放回队列。
   * WebSocket 完成事件和状态轮询任一确认停止即可结束等待。
   */
  async stopRunning() {
    Logger_1.Logger.debug(`stopRunning: currentTask=${this.currentTask?.name ?? "null"} queueLen=${this._taskQueue.length}`, "scheduler");
    const runningTask = this.currentTask;
    if (!runningTask) {
      this.setStatus("idle");
      this.notifyQueueChange();
      return;
    }
    this.stopRequest = {
      taskId: runningTask.id,
      reason: "manual"
    };
    this.setStatus("stopping");
    try {
      const response = await this.api.taskStop();
      if (this.currentTask?.id !== runningTask.id)
        return;
      if (!response.success) {
        this.stopRequest = null;
        this.setStatus("running");
        throw new Error(response.error || "\u540E\u7AEF\u62D2\u7EDD\u505C\u6B62\u4EFB\u52A1");
      }
    } catch (error) {
      if (this.currentTask?.id === runningTask.id) {
        this.stopRequest = null;
        this.setStatus("running");
      }
      throw error;
    }
    const deadline = Date.now() + STOP_CONFIRM_TIMEOUT_MS;
    while (this.currentTask?.id === runningTask.id) {
      try {
        const response = await this.api.taskStatus();
        if (response.success && response.data && ["completed", "failed", "stopped"].includes(response.data.status)) {
          this.finishManualStop(runningTask);
          return;
        }
      } catch {
      }
      if (Date.now() >= deadline) {
        this.stopRequest = null;
        this.setStatus("running");
        throw new Error("\u505C\u6B62\u8BF7\u6C42\u5DF2\u53D1\u9001\uFF0C\u4F46\u540E\u7AEF\u5728 30 \u79D2\u5185\u672A\u786E\u8BA4\u4EFB\u52A1\u7ED3\u675F");
      }
      await new Promise((resolve) => {
        setTimeout(resolve, STOP_CONFIRM_POLL_INTERVAL_MS);
      });
    }
  }
  /** 后端确认退出后，将手动停止的任务恢复为未开始状态。 */
  finishManualStop(runningTask) {
    if (this.currentTask?.id !== runningTask.id)
      return;
    runningTask.retryCount = 0;
    runningTask.backendTaskId = void 0;
    this.currentTask = null;
    this._taskQueue.insertByPriority(runningTask, !runningTask.allowPolling);
    this.stopRequest = null;
    this.setStatus("idle");
    this.notifyQueueChange();
  }
  /** 停止条件命中后结束父任务，不把当前轮重新放回队列。 */
  finishStopCondition(runningTask) {
    if (this.currentTask?.id !== runningTask.id)
      return;
    runningTask.backendTaskId = void 0;
    this.currentTask = null;
    this.stopRequest = null;
    this.emitLog("info", `\u4EFB\u52A1\u300C${runningTask.name}\u300D\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6\uFF0C\u903B\u8F91\u4EFB\u52A1\u5DF2\u7ED3\u675F`);
    this.callbacks.onLogicalTaskCompleted?.(runningTask.logicalId, true, null, false, "stop_condition");
    this.setStatus("idle");
    this.notifyQueueChange();
    this.consumeNext();
  }
  /**
   * 5.9：消费后端结构化掉落事件（主路径）。
   * 事件由 /ws/task 推送，不受后端日志级别影响；日志解析仍在
   * processBackendLog() 中保留为 WS 不可用时的兜底。
   */
  applyLootUpdate(msg) {
    const loot = Number.isInteger(msg.loot_count) ? msg.loot_count : null;
    const ship = Number.isInteger(msg.ship_count) ? msg.ship_count : null;
    if (loot == null && ship == null)
      return;
    this.lootEventSeen = true;
    Logger_1.Logger.debug(`[StopCond] WS loot_update: loot=${loot ?? "-"} ship=${ship ?? "-"}`, "scheduler");
    this.stopChecker.updateTracked(loot, ship);
    this.callbacks.onLootUpdate?.(loot, ship);
    if (this.currentTask?.stopCondition) {
      this.checkAndStopRunningTask(this.currentTask.stopCondition);
    }
  }
  /**
   * 4.5：消费 /ws/task 的 ui_state_update。
   * 后端只在状态变化时推送，前端不重算；30 秒没有新状态即标记 stale，
   * 由状态指示器转黄 + 闪烁提示「可能卡住」。
   */
  applyUiState(msg) {
    const page = typeof msg?.page === "string" && msg.page.trim() ? msg.page.trim() : null;
    const substate = typeof msg?.substate === "string" && msg.substate.trim() ? msg.substate.trim() : null;
    const phase = typeof msg?.phase === "string" && msg.phase.trim() ? msg.phase.trim() : null;
    const stack = Array.isArray(msg?.stack) ? msg.stack.filter((entry) => typeof entry === "string" && entry.length > 0) : [];
    if (page === null && substate === null && phase === null) {
      this.resetUiState();
      return;
    }
    this.uiState = { page, substate, phase, stack };
    this.uiStateUpdatedAt = Date.now();
    this.uiStateStale = false;
    if (this.uiStateStaleTimer) {
      clearTimeout(this.uiStateStaleTimer);
    }
    this.uiStateStaleTimer = setTimeout(() => {
      this.uiStateStaleTimer = null;
      this.uiStateStale = true;
      this.callbacks.onUiStateChange?.();
    }, UI_STATE_STALE_MS);
    this.callbacks.onUiStateChange?.();
  }
  /** 4.5：清空 UI 状态（任务启动/系统停止时不再显示上一轮页面）。 */
  resetUiState() {
    if (this.uiStateStaleTimer) {
      clearTimeout(this.uiStateStaleTimer);
      this.uiStateStaleTimer = null;
    }
    const hadState = this.uiState !== null;
    this.uiState = null;
    this.uiStateUpdatedAt = 0;
    this.uiStateStale = false;
    if (hadState) {
      this.callbacks.onUiStateChange?.();
    }
  }
  /** 处理后端进程 stdout 日志行（WS 不可用时的兜底停止条件解析） */
  processBackendLog(message) {
    const loot = (0, TaskQueue_1.parseUiCount)(message, "\u6218\u5229\u54C1\u6570\u91CF");
    const ship = (0, TaskQueue_1.parseUiCount)(message, "\u8230\u8239\u6570\u91CF");
    if (loot != null)
      Logger_1.Logger.debug(`[StopCond] stdout \u89E3\u6790\u5230\u6218\u5229\u54C1\u6570\u91CF: ${loot}`, "scheduler");
    if (ship != null)
      Logger_1.Logger.debug(`[StopCond] stdout \u89E3\u6790\u5230\u8230\u8239\u6570\u91CF: ${ship}`, "scheduler");
    if (!this.lootEventSeen && (loot != null || ship != null))
      Logger_1.Logger.debug("[StopCond] \u672A\u6536\u5230 loot_update\uFF0C\u4F7F\u7528\u65E5\u5FD7\u89E3\u6790\u515C\u5E95", "scheduler");
    this.stopChecker.updateTracked(loot, ship);
    if ((loot != null || ship != null) && this.currentTask?.stopCondition) {
      Logger_1.Logger.debug(`[StopCond] \u5F53\u524D\u4EFB\u52A1\u6709\u505C\u6B62\u6761\u4EF6\uFF0C\u68C0\u67E5\u662F\u5426\u6EE1\u8DB3`, "scheduler");
      this.checkAndStopRunningTask(this.currentTask.stopCondition);
    }
  }
  /** 清空队列 (不影响当前正在运行的) */
  clearQueue() {
    const canceledLogicalIds = this.collectLogicalIds([
      ...this._taskQueue.items,
      ...this.waitingTaskList.map((item) => item.task)
    ]);
    this.clearWaitingTasks();
    this._taskQueue.clear();
    this.emitLogicalCancellations(canceledLogicalIds, "queue_cleared");
    this.notifyQueueChange();
  }
  /** 移动队列中的任务顺序 */
  moveTask(fromIndex, toIndex) {
    this._taskQueue.moveTask(fromIndex, toIndex);
    this.notifyQueueChange();
  }
  // ── 内部: 消费循环 ──
  async consumeNext() {
    if (!this.systemActive)
      return;
    if (this.currentTask)
      return;
    if (this._taskQueue.length === 0) {
      this.setStatus("idle");
      return;
    }
    const task = this._taskQueue.shift();
    this.currentTask = task;
    this.lootEventSeen = false;
    this.resetUiState();
    this.setStatus("running");
    this.notifyQueueChange();
    Logger_1.Logger.debug(`consumeNext: \u300C${task.name}\u300D type=${task.type} remaining=${task.remainingTimes}/${task.totalTimes} req=${index_js_1.jsonCodec.stringify(task.request)}`, "scheduler");
    if (task.type === "expedition") {
      await this.handlePostExpedition();
      if (!this.systemActive || this.currentTask?.id !== task.id)
        return;
      this.currentTask = null;
      this.consumeNext();
      return;
    }
    if (task.stopCondition) {
      const preflightMet = await this.stopChecker.preflightCheck(task.stopCondition, task.name);
      if (!this.systemActive || this.currentTask?.id !== task.id)
        return;
      if (preflightMet) {
        this.emitLog("info", `\u4EFB\u52A1\u300C${task.name}\u300D\u542F\u52A8\u524D\u5DF2\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6\uFF0C\u8DF3\u8FC7`);
        this.callbacks.onTaskCompleted?.(task.id, true, null, null);
        this.callbacks.onLogicalTaskCompleted?.(task.logicalId, true, null, false, "stop_condition");
        this.currentTask = null;
        this.consumeNext();
        return;
      }
    }
    await this.executeTaskStart(task);
  }
  // ── 内部: 任务启动 + 重试 ──
  /** 向后端发起 taskStart，失败时按重试策略处理 */
  async executeTaskStart(task) {
    this.startingTaskId = task.id;
    this.pendingTaskCompletions.clear();
    try {
      if (task.request.type === "expedition") {
        throw new Error("\u8FDC\u5F81\u68C0\u67E5\u4E0D\u80FD\u901A\u8FC7 taskStart \u6267\u884C");
      }
      const request = task.stopCondition ? { ...task.request, stop_condition: task.stopCondition } : task.request;
      const resp = await this.api.taskStart(request);
      if (!this.systemActive || this.currentTask?.id !== task.id)
        return;
      if (resp.success && resp.data) {
        task.backendTaskId = resp.data.task_id;
        const pendingCompletion = this.pendingTaskCompletions.get(task.backendTaskId);
        this.pendingTaskCompletions.clear();
        if (pendingCompletion)
          this.handleTaskCompletedMessage(pendingCompletion);
      } else {
        const reason = resp.error ?? "\u4EFB\u52A1\u542F\u52A8\u5931\u8D25";
        this.currentTask = null;
        void this.refreshSystemStatus();
        if (this.scheduleRetry(task, reason))
          return;
        this.emitLog("error", `\u4EFB\u52A1\u300C${task.name}\u300D\u542F\u52A8\u5931\u8D25\uFF0C\u91CD\u8BD5\u5DF2\u8017\u5C3D\uFF1A${reason}`);
        this.callbacks.onTaskCompleted?.(task.id, false, null, reason);
        this.callbacks.onLogicalTaskCompleted?.(task.logicalId, false, reason, false, "failed");
        this.consumeNext();
      }
    } catch (e) {
      if (!this.systemActive || this.currentTask?.id !== task.id)
        return;
      const reason = String(e);
      this.currentTask = null;
      void this.refreshSystemStatus();
      if (this.scheduleRetry(task, reason))
        return;
      this.emitLog("error", `\u4EFB\u52A1\u300C${task.name}\u300D\u542F\u52A8\u5F02\u5E38\uFF0C\u91CD\u8BD5\u5DF2\u8017\u5C3D\uFF1A${reason}`);
      this.callbacks.onTaskCompleted?.(task.id, false, null, reason);
      this.callbacks.onLogicalTaskCompleted?.(task.logicalId, false, reason, false, "failed");
      this.consumeNext();
    } finally {
      if (this.startingTaskId === task.id) {
        this.startingTaskId = null;
        this.pendingTaskCompletions.clear();
      }
    }
  }
  /**
   * 通用重试: 若未超过上限，5s 后重新入队并消费。
   * @returns true 表示已安排重试，调用方应 return；false 表示重试耗尽。
   */
  scheduleRetry(task, reason) {
    if (!this.systemActive)
      return false;
    if (task.retryCount >= task.maxRetries)
      return false;
    task.retryCount++;
    const retryHint = task.forceRetry ? "\uFF0C\u5F3A\u5236\u91CD\u8BD5" : "";
    this.emitLog("warn", `\u4EFB\u52A1\u300C${task.name}\u300D${reason}\uFF0C${task.retryCount}/${task.maxRetries} \u6B21\u91CD\u8BD5${retryHint} (5s \u540E)`);
    this.scheduleWaitingTask(task, 5e3, "retry", !!task.forceRetry || !task.allowPolling);
    return true;
  }
  // ── 内部: 任务完成 & 后触发 ──
  handleTaskCompletedMessage(msg) {
    const current = this.currentTask;
    if (current?.backendTaskId === msg.task_id) {
      void this.handleTaskFinished(msg.task_id, msg.success, msg.result, msg.error);
      return;
    }
    if (current && this.startingTaskId === current.id) {
      this.pendingTaskCompletions.set(msg.task_id, msg);
    }
  }
  /** 任务完成后的后触发处理 */
  async handleTaskFinished(taskId, success, result, error) {
    if (!this.systemActive)
      return;
    const finished = this.currentTask;
    if (!finished || finished.backendTaskId !== taskId)
      return;
    const stopReason = this.stopRequest?.taskId === finished.id ? this.stopRequest.reason : null;
    if (stopReason === "manual") {
      Logger_1.Logger.debug(`handleTaskFinished: confirmed manual stop for \u300C${finished.name}\u300D`, "scheduler");
      this.finishManualStop(finished);
      return;
    }
    if (stopReason === "condition") {
      this.finishStopCondition(finished);
      return;
    }
    const backendStopReason = result && typeof result.stop_reason === "string" ? result.stop_reason : null;
    if (backendStopReason === "stop_condition") {
      Logger_1.Logger.debug(`handleTaskFinished: backend stop_condition for \u300C${finished.name}\u300D`, "scheduler");
      this.finishStopCondition(finished);
      return;
    }
    if (backendStopReason === "dock_full") {
      const reason = error || "\u8239\u575E\u5DF2\u6EE1\u4E14\u65E0\u6CD5\u89E3\u88C5\uFF0C\u4EFB\u52A1\u5DF2\u505C\u6B62";
      const message = `\u4EFB\u52A1\u300C${finished.name}\u300D\u8239\u575E\u5DF2\u6EE1\u4E14\u89E3\u88C5\u5931\u8D25\uFF0C\u5DF2\u505C\u6B62\u5269\u4F59\u8F6E\u6B21\uFF1A${reason}`;
      this.emitLog("error", message);
      Logger_1.Logger.error(`[Scheduler] ${message}`, "scheduler");
      this.currentTask = null;
      this.discardLogicalTask(finished.logicalId);
      this.callbacks.onTaskCompleted?.(finished.id, false, result, reason);
      this.callbacks.onLogicalTaskCompleted?.(finished.logicalId, false, reason, false, "dock_full");
      this.consumeNext();
      return;
    }
    if (backendStopReason === "resource_exhausted") {
      const reason = error || "\u8D44\u6E90\u4F4E\u4E8E\u914D\u7F6E\u9608\u503C\uFF0C\u4EFB\u52A1\u5DF2\u4E2D\u6B62";
      const message = `\u4EFB\u52A1\u300C${finished.name}\u300D\u56E0\u8D44\u6E90\u4F4E\u4E8E\u914D\u7F6E\u9608\u503C\u800C\u4E2D\u6B62\uFF1A${reason}`;
      this.emitLog("warn", message);
      Logger_1.Logger.warn(`[Scheduler] ${message}`, "scheduler");
      this.currentTask = null;
      this.discardLogicalTask(finished.logicalId);
      this.callbacks.onTaskCompleted?.(finished.id, false, result, reason);
      this.callbacks.onLogicalTaskCompleted?.(finished.logicalId, false, reason, false, "resource_exhausted");
      this.consumeNext();
      return;
    }
    if (!success) {
      // 页面完全认不出（UNKNOWN_PAGE）：后端已依次试过清确认弹窗 / 网络弹窗 /
      // 点游戏内返回箭头 / 重建导航栈 / 退避重试，全都无效。前端再按普通失败重试，
      // 大概率在同一堵墙上再撞一次、白烧任务次数。
      // 这里直接结束逻辑任务，并把现场截图路径摆到日志里让用户能点开看。
      const unknownDetail = Array.isArray(result && result.details)
        ? result.details.find((d) => d && d.unknown_page)
        : null;
      if (unknownDetail) {
        const shot = unknownDetail.screenshot;
        const unknownMsg = `任务「${finished.name}」因页面无法识别而中止（已尝试弹窗清理/返回箭头/重建导航栈）${shot ? `，现场截图：${shot}` : ""}`;
        this.emitLog("error", unknownMsg);
        // emitLog 只推 UI 面板，不写日志文件；这条是排障关键，必须落盘。
        Logger_1.Logger.error(`[Scheduler] ${unknownMsg}`, "scheduler");
        this.currentTask = null;
        this.discardLogicalTask(finished.logicalId);
        this.callbacks.onTaskCompleted?.(finished.id, false, result, unknownDetail.error || error);
        this.callbacks.onLogicalTaskCompleted?.(
          finished.logicalId,
          false,
          unknownDetail.error || error,
          false,
          "unknown_page"
        );
        this.consumeNext();
        return;
      }
      this.callbacks.onTaskCompleted?.(finished.id, false, result, error);
      this.currentTask = null;
      const terminalResult = (0, SchedulerTaskPolicy_js_1.getNonRetryableTaskResult)(finished, result, error);
      if (terminalResult) {
        this.discardLogicalTask(finished.logicalId);
        this.emitLog("warn", `\u4EFB\u52A1\u300C${finished.name}\u300D\u8FD4\u56DE\u4E0D\u53EF\u91CD\u8BD5\u7ED3\u679C\uFF1A${terminalResult}\uFF0C\u903B\u8F91\u4EFB\u52A1\u5DF2\u7ED3\u675F`);
        this.callbacks.onLogicalTaskCompleted?.(finished.logicalId, false, error, false, "terminal");
        this.consumeNext();
        return;
      }
      const reason = error ? `\u6267\u884C\u5931\u8D25\uFF1A${error}` : "\u6267\u884C\u5931\u8D25";
      if (this.scheduleRetry(finished, reason))
        return;
      this.emitLog("error", `\u4EFB\u52A1\u300C${finished.name}\u300D\u6267\u884C\u5931\u8D25\uFF0C\u91CD\u8BD5\u5DF2\u8017\u5C3D${error ? `\uFF1A${error}` : ""}`);
      const nextRemaining = finished.unlimited ? 1 : finished.remainingTimes - 1;
      if (nextRemaining > 0) {
        const followUp = this.buildFollowUpTask(finished, nextRemaining);
        this._taskQueue.insertByPriority(followUp, !finished.allowPolling);
      } else {
        this.callbacks.onLogicalTaskCompleted?.(finished.logicalId, false, error, false, "failed");
      }
      this.consumeNext();
      return;
    }
    const shouldCountRound = this.shouldCountAsCompletedRound(finished, result);
    if (!shouldCountRound) {
      const endpoints = this.getEndpointNodes(finished);
      if (endpoints.length > 0) {
        const resultHint = finished.endpointResult ? `\u6216\u7EC8\u70B9\u6218\u679C\u672A\u8FBE\u5230 ${finished.endpointResult}` : "";
        this.emitLog("info", `\u4EFB\u52A1\u300C${finished.name}\u300D\u672A\u5230\u8FBE\u7EC8\u70B9\u8282\u70B9 ${endpoints.join("/")}${resultHint}\uFF0C\u672C\u8F6E\u4E0D\u8BA1\u5165\u6B21\u6570`);
      }
    }
    this.callbacks.onTaskCompleted?.(finished.id, true, result, error);
    const nextRemainingTimes = finished.unlimited ? 1 : shouldCountRound ? finished.remainingTimes - 1 : finished.remainingTimes;
    if (nextRemainingTimes > 0) {
      if (finished.stopCondition) {
        const shouldStop = await this.stopChecker.checkCondition(finished.stopCondition, finished.name, result);
        if (!this.systemActive || this.currentTask?.id !== finished.id)
          return;
        if (shouldStop) {
          this.emitLog("info", `\u4EFB\u52A1\u300C${finished.name}\u300D\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6\uFF0C\u4E0D\u518D\u7EE7\u7EED`);
          this.currentTask = null;
          this.callbacks.onLogicalTaskCompleted?.(finished.logicalId, true, null, false, "stop_condition");
          this.consumeNext();
          return;
        }
      }
      const followUp = this.buildFollowUpTask(finished, nextRemainingTimes);
      Logger_1.Logger.debug(`followUp: \u300C${finished.name}\u300D remaining=${followUp.remainingTimes}/${followUp.totalTimes}`, "scheduler");
      const gapSeconds = "gap" in finished.request ? Math.max(0, Number(finished.request.gap) || 0) : 0;
      if (shouldCountRound && gapSeconds > 0) {
        this.scheduleFollowUpAfterGap(followUp, gapSeconds);
      } else {
        this._taskQueue.insertByPriority(followUp, !finished.allowPolling);
      }
    } else {
      this.callbacks.onLogicalTaskCompleted?.(finished.logicalId, true, null, shouldCountRound, "completed");
    }
    this.currentTask = null;
    this.consumeNext();
  }
  buildFollowUpTask(finished, remainingTimes) {
    return (0, SchedulerTaskPolicy_js_1.buildFollowUpTask)(finished, remainingTimes, (0, TaskQueue_1.generateTaskId)());
  }
  /** 按方案 gap 等待后再把下一轮放回队列。 */
  scheduleFollowUpAfterGap(task, gapSeconds) {
    this.emitLog("info", `\u4EFB\u52A1\u300C${task.name}\u300D\u5C06\u5728 ${gapSeconds} \u79D2\u540E\u5F00\u59CB\u4E0B\u4E00\u8F6E`);
    this.scheduleWaitingTask(task, gapSeconds * 1e3, "gap", !task.allowPolling);
  }
  /** 将任务保存为可见、可取消的等待项，时间到后再回到就绪队列。 */
  scheduleWaitingTask(task, delayMs, reason, beforeSamePriority) {
    this.removeWaitingTask(task.id);
    const readyAt = Date.now() + delayMs;
    const timer = setTimeout(() => {
      const entry = this.waitingTasks.get(task.id);
      if (!entry || entry.timer !== timer)
        return;
      this.waitingTasks.delete(task.id);
      if (!this.systemActive)
        return;
      this._taskQueue.insertByPriority(task, beforeSamePriority);
      this.notifyQueueChange();
      this.consumeNext();
    }, delayMs);
    this.waitingTasks.set(task.id, {
      task,
      reason,
      readyAt,
      timer
    });
    if (!this.currentTask)
      this.setStatus("idle");
    this.notifyQueueChange();
  }
  /** 移除一个等待项并取消其定时器。 */
  removeWaitingTask(taskId) {
    const entry = this.waitingTasks.get(taskId);
    if (!entry)
      return null;
    clearTimeout(entry.timer);
    this.waitingTasks.delete(taskId);
    return entry.task;
  }
  /** 取消全部轮次间隔和失败重试定时器。 */
  clearWaitingTasks() {
    for (const entry of this.waitingTasks.values()) {
      clearTimeout(entry.timer);
    }
    this.waitingTasks.clear();
  }
  discardLogicalTask(logicalId) {
    if (this.currentTask?.logicalId === logicalId) {
      this.currentTask = null;
    }
    this._taskQueue.removeTasksByLogicalId(logicalId);
    for (const [taskId, entry] of this.waitingTasks) {
      if (entry.task.logicalId !== logicalId)
        continue;
      clearTimeout(entry.timer);
      this.waitingTasks.delete(taskId);
    }
    this.notifyQueueChange();
  }
  /**
   * 获取本轮认定完成的终点节点列表。
   * 优先使用 task.endpointNodes（用户在 plan 中显式配置），
   * 回退到 selected_nodes 的最后一个节点。
   */
  getEndpointNodes(task) {
    if (task.endpointNodes && task.endpointNodes.length > 0) {
      return task.endpointNodes.map((n) => n.trim().toUpperCase());
    }
    if (task.type !== "normal_fight" && task.type !== "event_fight")
      return [];
    if (task.request.type !== "normal_fight" && task.request.type !== "event_fight")
      return [];
    const selectedNodes = task.request.plan?.selected_nodes;
    if (!selectedNodes || selectedNodes.length === 0)
      return [];
    const last = selectedNodes[selectedNodes.length - 1];
    if (typeof last !== "string" || !last.trim())
      return [];
    return [last.trim().toUpperCase()];
  }
  shouldCountAsCompletedRound(task, result) {
    const endpoints = this.getEndpointNodes(task);
    if (endpoints.length === 0)
      return true;
    const details = result?.details;
    if (!details || details.length === 0)
      return !task.endpointResult;
    if (task.endpointResult) {
      return details.some((round) => this.roundMeetsEndpointResult(round, endpoints, task.endpointResult));
    }
    if (details.some((round) => !round.success))
      return true;
    return details.some((round) => {
      if (!Array.isArray(round.nodes))
        return false;
      return round.nodes.some((node) => {
        const normalized = String(node).trim().toUpperCase();
        return endpoints.includes(normalized);
      });
    });
  }
  /** 检查指定终点的战果是否达到用户要求。 */
  roundMeetsEndpointResult(round, endpoints, requiredResult) {
    const endpointFightEvents = (round.events ?? []).filter((event) => {
      const node = String(event.node ?? "").trim().toUpperCase();
      return (event.type === "RESULT" || event.type === "FIGHT_RESULT") && endpoints.includes(node);
    });
    if (endpointFightEvents.length > 0) {
      return endpointFightEvents.some((event) => this.resultMeetsRequirement(event.result, requiredResult));
    }
    const lastNode = round.nodes?.[round.nodes.length - 1];
    if (!lastNode || !endpoints.includes(String(lastNode).trim().toUpperCase())) {
      return false;
    }
    return this.resultMeetsRequirement(round.grade, requiredResult);
  }
  resultMeetsRequirement(actual, required) {
    if (typeof actual !== "string")
      return false;
    const actualIndex = RESULT_GRADE_ORDER.indexOf(actual.trim().toUpperCase());
    const requiredIndex = RESULT_GRADE_ORDER.indexOf(required);
    return actualIndex >= requiredIndex;
  }
  /** 任务执行中实时检查停止条件，满足则立即发送 taskStop */
  checkAndStopRunningTask(cond) {
    const runningTask = this.currentTask;
    if (!runningTask || this.stopRequest)
      return;
    if (!this.stopChecker.checkRunning(cond))
      return;
    this.stopRequest = {
      taskId: runningTask.id,
      reason: "condition"
    };
    this.setStatus("stopping");
    void this.stopForCondition(runningTask);
  }
  /** 请求停止满足条件的当前轮，并等待后端确认退出。 */
  async stopForCondition(runningTask) {
    try {
      const response = await this.api.taskStop();
      if (this.currentTask?.id !== runningTask.id || this.stopRequest?.reason !== "condition") {
        return;
      }
      if (!response.success) {
        throw new Error(response.error || "\u540E\u7AEF\u62D2\u7EDD\u505C\u6B62\u4EFB\u52A1");
      }
    } catch (error) {
      if (this.currentTask?.id === runningTask.id) {
        this.stopRequest = null;
        this.setStatus("running");
        this.emitLog("warn", `\u4EFB\u52A1\u300C${runningTask.name}\u300D\u505C\u6B62\u6761\u4EF6\u5DF2\u6EE1\u8DB3\uFF0C\u4F46\u505C\u6B62\u5931\u8D25: ${String(error)}`);
      }
      return;
    }
    const deadline = Date.now() + STOP_CONFIRM_TIMEOUT_MS;
    while (this.currentTask?.id === runningTask.id && this.stopRequest?.reason === "condition") {
      try {
        const response = await this.api.taskStatus();
        if (response.success && response.data && ["completed", "failed", "stopped"].includes(response.data.status)) {
          this.finishStopCondition(runningTask);
          return;
        }
      } catch {
      }
      if (Date.now() >= deadline) {
        this.stopRequest = null;
        this.setStatus("running");
        this.emitLog("warn", `\u4EFB\u52A1\u300C${runningTask.name}\u300D\u505C\u6B62\u6761\u4EF6\u5DF2\u6EE1\u8DB3\uFF0C\u4F46\u540E\u7AEF\u672A\u786E\u8BA4\u505C\u6B62`);
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, STOP_CONFIRM_POLL_INTERVAL_MS);
      });
    }
  }
  // ── 内部: 远征后处理 ──
  /** 远征检查与奖励领取统一由后端执行。 */
  async handlePostExpedition() {
    try {
      const response = await this.api.expeditionAutoCheck();
      if (!response.success) {
        this.emitLog("debug", "\u81EA\u52A8\u8FDC\u5F81\u68C0\u67E5\u8DF3\u8FC7");
        return;
      }
      this.emitLog("info", "\u8FDC\u5F81\u68C0\u67E5\u5B8C\u6210");
    } catch {
      this.emitLog("debug", "\u81EA\u52A8\u8FDC\u5F81\u68C0\u67E5\u8DF3\u8FC7");
    }
  }
  // ── 内部: 远征触发 ──
  /** 远征定时器回调 — 排到队首，等待当前单轮完整结束后执行。 */
  handleExpeditionTrigger() {
    if (!this.systemActive || !this.autoExpedition)
      return;
    if (this.currentTask?.type === "expedition")
      return;
    if (this._taskQueue.hasType("expedition"))
      return;
    const id = (0, TaskQueue_1.generateTaskId)();
    const task = {
      id,
      logicalId: id,
      name: "\u8FDC\u5F81\u68C0\u67E5",
      type: "expedition",
      priority: scheduler_1.TaskPriority.EXPEDITION,
      request: { type: "expedition" },
      remainingTimes: 1,
      totalTimes: 1,
      maxRetries: 1,
      retryCount: 0
    };
    this._taskQueue.insertByPriority(task);
    this.notifyQueueChange();
    Logger_1.Logger.debug("\u8FDC\u5F81\u5B9A\u65F6\u5668\u89E6\u53D1\uFF0C\u5DF2\u63D2\u5165\u8FDC\u5F81\u4EFB\u52A1\u5230\u961F\u5217", "scheduler");
    if (!this.currentTask && this._status === "idle") {
      this.consumeNext();
    }
  }
  // ── 内部: WebSocket 回调绑定 ──
  setupApiCallbacks() {
    this.api.setCallbacks({
      onLog: (msg) => {
        this.callbacks.onLog?.(msg);
      },
      onTaskUpdate: (msg) => {
        if (!this.currentTask)
          return;
        this.callbacks.onProgressUpdate?.(this.currentTask.id, msg.progress ?? { current: 0, total: 0, node: null });
      },
      onLootUpdate: (msg) => {
        this.applyLootUpdate(msg);
      },
      onUiStateUpdate: (msg) => {
        this.applyUiState(msg);
      },
      onTaskCompleted: (msg) => {
        this.handleTaskCompletedMessage(msg);
      },
      onWsStatusChange: (connected) => {
        this.callbacks.onConnectionChange?.(connected);
        if (!connected && this._status !== "not_connected") {
        }
      }
    });
  }
  // ── 内部: 状态管理 ──
  setStatus(s) {
    if (this._status === s)
      return;
    const previous = this._status;
    this._status = s;
    this.callbacks.onStatusChange?.(s);
    if (s === "idle" && (previous === "running" || previous === "stopping")) {
      if (this.deviceLease?.holder?.startsWith("task:")) {
        this.setDeviceLease(null);
      }
      setTimeout(() => {
        void this.refreshSystemStatus();
      }, 100);
    }
    // Task drained while the emulator was already gone: do not park in a
    // green-looking idle state for the next heartbeat interval.
    if (s === "idle" && this.emulatorConnected === false) {
      this.handleEmulatorDisconnected();
    }
  }
  /** 通过回调发送前端侧日志 */
  emitLog(level, message) {
    this.callbacks.onLog?.({
      type: "log",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      channel: "scheduler",
      message
    });
  }
  /** 判断同一父任务是否仍有运行、排队、延迟或等待中的物理任务。 */
  hasLogicalTask(logicalId) {
    if (this.currentTask?.logicalId === logicalId)
      return true;
    if (this._taskQueue.items.some((task) => task.logicalId === logicalId)) {
      return true;
    }
    return [...this.waitingTasks.values()].some((entry) => entry.task.logicalId === logicalId);
  }
  collectLogicalIds(tasks) {
    return new Set(tasks.map((task) => task.logicalId));
  }
  emitLogicalCancellations(logicalIds, reason) {
    for (const logicalId of logicalIds) {
      this.callbacks.onLogicalTaskCanceled?.(logicalId, reason);
    }
  }
  /** 6.12：只序列化可持久化字段，运行态句柄/后端 id 不落盘。 */
  serializeTask(task) {
    if (!task || typeof task !== "object")
      return null;
    const clone = (value) => {
      if (value === void 0)
        return void 0;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return void 0;
      }
    };
    return {
      id: task.id,
      logicalId: task.logicalId,
      name: task.name,
      type: task.type,
      priority: task.priority,
      request: clone(task.request),
      remainingTimes: task.remainingTimes,
      totalTimes: task.totalTimes,
      unlimited: task.unlimited === true,
      stopCondition: clone(task.stopCondition),
      maxRetries: task.maxRetries,
      forceRetry: task.forceRetry === true,
      allowPolling: task.allowPolling === true,
      endpointNodes: clone(task.endpointNodes),
      endpointResult: clone(task.endpointResult),
      sortKey: task.sortKey,
      interrupted: task.interrupted === true,
      interruptedAt: task.interruptedAt,
      waitingReason: task.waitingReason
    };
  }
  /** 6.12：导出运行中/队列/等待任务快照。 */
  exportSnapshot() {
    return {
      version: 1,
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      running: this.currentTask ? this.serializeTask(this.currentTask) : null,
      queue: this._taskQueue.items.map((task) => this.serializeTask(task)).filter(Boolean),
      waiting: this.waitingTaskList.map((entry) => ({
        task: this.serializeTask(entry.task),
        reason: entry.reason
      })).filter((entry) => entry.task)
    };
  }
  /** 6.12：恢复快照；运行中任务标中断、放回队首，不设 currentTask、不自动重跑。 */
  restoreSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1)
      return { restored: 0, interrupted: false };
    const normalizeTask = (raw, extra = {}) => {
      if (!raw || typeof raw !== "object")
        return null;
      if (!raw.request || typeof raw.request !== "object")
        return null;
      if (typeof raw.name !== "string" || !raw.name.trim() || typeof raw.type !== "string" || !raw.type.trim())
        return null;
      const positive = (value, fallback) => Number.isFinite(Number(value))
        ? Math.max(1, Math.trunc(Number(value)))
        : fallback;
      const id = typeof raw.id === "string" && raw.id ? raw.id : (0, TaskQueue_1.generateTaskId)();
      return {
        id,
        logicalId: typeof raw.logicalId === "string" && raw.logicalId ? raw.logicalId : id,
        name: raw.name.trim(),
        type: raw.type,
        priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 0,
        request: raw.request,
        remainingTimes: positive(raw.remainingTimes, 1),
        totalTimes: positive(raw.totalTimes, positive(raw.remainingTimes, 1)),
        unlimited: raw.unlimited === true,
        stopCondition: raw.stopCondition,
        maxRetries: positive(raw.maxRetries, 2),
        retryCount: 0,
        forceRetry: raw.forceRetry === true,
        allowPolling: raw.allowPolling === true,
        endpointNodes: raw.endpointNodes,
        endpointResult: raw.endpointResult,
        sortKey: raw.sortKey,
        interrupted: raw.interrupted === true,
        interruptedAt: typeof raw.interruptedAt === "string" ? raw.interruptedAt : void 0,
        waitingReason: typeof raw.waitingReason === "string" ? raw.waitingReason : void 0,
        ...extra
      };
    };
    const tasks = [];
    const running = normalizeTask(snapshot.running, {
      interrupted: true,
      interruptedAt: snapshot.savedAt
    });
    if (running)
      tasks.push(running);
    for (const raw of Array.isArray(snapshot.queue) ? snapshot.queue : []) {
      const task = normalizeTask(raw);
      if (task)
        tasks.push(task);
    }
    for (const entry of Array.isArray(snapshot.waiting) ? snapshot.waiting : []) {
      const task = normalizeTask(entry?.task, { waitingReason: entry?.reason });
      if (task)
        tasks.push(task);
    }
    this.currentTask = null;
    this.startingTaskId = null;
    this.waitingTasks.clear();
    this._taskQueue.replaceAll(tasks);
    this.setStatus("not_connected");
    this.notifyQueueChange();
    const hasInterrupted = Boolean(running) || tasks.some((task) => task.interrupted === true);
    return { restored: tasks.length, interrupted: hasInterrupted };
  }
  notifyQueueChange() {
    this.callbacks.onQueueChange?.(this._taskQueue.items);
  }
};
exports.Scheduler = Scheduler;