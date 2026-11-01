"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerBinder = void 0;
var scheduler_1 = require_scheduler2();
var Logger_1 = require_Logger();
var ScheduledTaskLoader_1 = require_ScheduledTaskLoader();
var SchedulerRuntimeTracker_1 = require_SchedulerRuntimeTracker();
var SchedulerBinder = class {
  constructor(host, runtime = new SchedulerRuntimeTracker_1.SchedulerRuntimeTracker(host.scheduler, host.renderMain), taskLoader = new ScheduledTaskLoader_1.ScheduledTaskLoader(host)) {
    this.host = host;
    this.runtime = runtime;
    this.taskLoader = taskLoader;
    this.pendingExerciseTaskId = null;
    this.pendingBattleTaskId = null;
    this.pendingBattleConfig = null;
    this.pendingBattleResult = null;
    this.pendingDecisiveTaskId = null;
    this.pendingDecisiveResult = null;
    this.pendingLootTaskId = null;
    this.pendingNormalFightTaskIds = /* @__PURE__ */ new Set();
    this.pendingNormalFightConfigs = /* @__PURE__ */ new Map();
  }
  get runtimeState() {
    return this.runtime.snapshot;
  }
  resetRuntimeState() {
    this.runtime.reset();
  }
  /** 在 Renderer 卸载时释放运行状态监听。 */
  dispose() {
    this.runtime.dispose();
  }
  /** 绑定 Scheduler 回调 */
  bindSchedulerCallbacks() {
    this.host.scheduler.setCallbacks({
      onStatusChange: (_status) => {
        this.host.renderMain();
        this.host.persistQueueSnapshot?.();
      },
      onProgressUpdate: (_taskId, progress) => {
        this.runtime.updateProgress(progress.current, progress.total);
        this.host.renderMain();
      },
      onTaskCompleted: (taskId, success, result, _error) => {
        const runningTask = this.host.scheduler.currentRunningTask;
        if (runningTask?.id === taskId && runningTask.logicalId === this.pendingBattleTaskId && runningTask.type === "campaign") {
          const details = result?.details ?? [];
          this.pendingBattleResult = details.some((detail) => detail.result === scheduler_1.CAMPAIGN_OUT_OF_TIMES_RESULT) ? scheduler_1.CAMPAIGN_OUT_OF_TIMES_RESULT : details[details.length - 1]?.result ?? null;
          if (success && (result?.success_runs ?? 0) > 0 && this.pendingBattleConfig) {
            const remaining = this.host.campaignDailyQuota.markCompleted(this.pendingBattleConfig.campaignName, this.pendingBattleConfig.target);
            Logger_1.Logger.info(`\u81EA\u52A8\u6218\u5F79\u4ECA\u65E5\u6B63\u5E38\u7ED3\u7B97 1 \u6B21\uFF0C\u5269\u4F59 ${remaining} \u6B21`);
          }
        }
        if (runningTask?.id === taskId && runningTask.logicalId === this.pendingDecisiveTaskId && runningTask.type === "decisive") {
          const details = result?.details ?? [];
          const decisiveResult = details[details.length - 1]?.result;
          this.pendingDecisiveResult = typeof decisiveResult === "string" ? decisiveResult : success ? null : "error";
        }
        this.runtime.reset();
        this.host.renderMain();
      },
      onLogicalTaskCompleted: (logicalId, success, _error, countedRound, completionReason) => {
        this.runtime.reset();
        if (logicalId === this.pendingExerciseTaskId) {
          if (success) {
            this.host.cronScheduler.markExerciseCompleted();
          } else {
            this.host.cronScheduler.clearExercisePending();
          }
          this.pendingExerciseTaskId = null;
        }
        if (logicalId === this.pendingBattleTaskId) {
          const config = this.pendingBattleConfig;
          const remaining = config ? this.host.campaignDailyQuota.remaining(config.campaignName, config.target) : 0;
          if (remaining === 0) {
            this.host.cronScheduler.markBattleHandled();
          } else if (this.pendingBattleResult === scheduler_1.CAMPAIGN_OUT_OF_TIMES_RESULT) {
            const completed = config ? Math.max(0, config.target - remaining) : 0;
            Logger_1.Logger.warn(`\u81EA\u52A8\u6218\u5F79\u6B21\u6570\u5DF2\u7528\u5B8C\uFF0C\u4ECA\u65E5\u6B63\u5E38\u7ED3\u7B97 ${completed}/${config?.target ?? 0} \u6B21\uFF0C\u5269\u4F59\u6E38\u620F\u6B21\u6570 0`);
            this.host.cronScheduler.markBattleHandled();
          } else if (config && remaining < config.remainingAtStart) {
            Logger_1.Logger.warn(`\u81EA\u52A8\u6218\u5F79\u672C\u6279\u5DF2\u6709\u6B63\u5E38\u7ED3\u7B97\u8BB0\u5F55\uFF0C\u4ECA\u65E5\u4ECD\u7F3A\u5C11 ${remaining} \u6B21\uFF0C\u5C06\u5728\u4E0B\u6B21\u68C0\u67E5\u65F6\u8865\u8DD1`);
            this.host.cronScheduler.clearBattlePending();
          } else {
            Logger_1.Logger.warn("\u81EA\u52A8\u6218\u5F79\u672C\u6279\u672A\u6B63\u5E38\u7ED3\u7B97\uFF0C\u5355\u8F6E\u91CD\u8BD5\u5DF2\u8017\u5C3D\uFF0C\u4ECA\u65E5\u505C\u6B62\u8865\u8DD1");
            this.host.cronScheduler.markBattleHandled();
          }
          this.pendingBattleTaskId = null;
          this.pendingBattleConfig = null;
          this.pendingBattleResult = null;
        }
        if (logicalId === this.pendingDecisiveTaskId) {
          if (this.pendingDecisiveResult === "chapter_clear" || this.pendingDecisiveResult === "leave") {
            this.host.cronScheduler.markDecisiveHandled();
          } else {
            Logger_1.Logger.warn("\u81EA\u52A8\u51B3\u6218\u672A\u6B63\u5E38\u7ED3\u675F\uFF0C\u5355\u8F6E\u91CD\u8BD5\u5DF2\u8017\u5C3D\uFF0C\u4ECA\u65E5\u505C\u6B62\u8865\u8DD1");
            this.host.cronScheduler.markDecisiveHandled();
          }
          this.pendingDecisiveTaskId = null;
          this.pendingDecisiveResult = null;
        }
        if (logicalId === this.pendingLootTaskId) {
          if (completionReason === "stop_condition") {
            this.host.cronScheduler.markLootHandled();
          } else {
            Logger_1.Logger.warn("\u81EA\u52A8\u6218\u5229\u54C1\u672C\u6279\u672A\u8FBE\u5230\u505C\u6B62\u6570\u91CF\uFF0C\u5DF2\u5230\u8FBE\u6279\u6B21\u6216\u91CD\u8BD5\u4E0A\u9650\uFF0C\u4ECA\u65E5\u505C\u6B62\u8865\u8DD1");
            this.host.cronScheduler.markLootHandled();
          }
          this.pendingLootTaskId = null;
        }
        const normalFightConfig = this.pendingNormalFightConfigs.get(logicalId);
        this.pendingNormalFightConfigs.delete(logicalId);
        if (this.pendingNormalFightTaskIds.delete(logicalId)) {
          if (success && countedRound === true && normalFightConfig) {
            const remaining = this.host.normalFightDailyQuota.markCompleted(normalFightConfig);
            Logger_1.Logger.info(`\u81EA\u52A8\u51FA\u5F81\u4ECA\u65E5\u6709\u6548\u5B8C\u6210 1 \u6B21\uFF0C\u5F53\u524D\u8BA1\u5212\u5269\u4F59 ${remaining} \u6B21`);
            this.host.refreshNormalFightRemaining();
          }
          if (this.pendingNormalFightTaskIds.size === 0) {
            this.host.cronScheduler.markNormalFightHandled();
          }
        }
        this.host.renderMain();
      },
      onLogicalTaskCanceled: (logicalId, reason) => {
        if (!this.host.scheduler.currentRunningTask) {
          this.runtime.reset();
        }
        this.handleLogicalTaskCanceled(logicalId, reason);
        this.host.renderMain();
      },
      onLootUpdate: (loot, ship) => {
        if (this.runtime.applyLootUpdate(loot, ship))
          this.host.renderMain();
      },
      onUiStateChange: () => {
        this.host.renderMain();
      },
      onLog: (msg) => {
        const changed = this.runtime.consume(msg.message);
        if (changed)
          this.host.renderMain();
      },
      onRecognizerErrorsChange: (errors) => {
        this.host.mainView.setRecognizerErrors(errors);
      },
      onQueueChange: () => {
        this.host.renderMain();
        this.host.persistQueueSnapshot?.();
      },
      onConnectionChange: (connected) => {
        this.runtime.setConnection(connected);
        this.host.updateOpsAvailability(connected);
        if (connected) {
          this.host.api.health().then((res) => {
            if (res.success && res.data) {
              const uptime = Math.floor(res.data.uptime_seconds);
              Logger_1.Logger.debug(`\u540E\u7AEF\u5065\u5EB7\u68C0\u67E5: \u8FD0\u884C ${uptime}s, \u6A21\u62DF\u5668${res.data.emulator_connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5"}`);
            }
          }).catch(() => {
          });
        }
        this.host.renderMain();
      },
      onExpeditionTimerTick: (seconds) => {
        this.host.updateExpeditionTimer(this.runtime.updateExpeditionTimer(seconds));
      }
    });
  }
  /**
   * 同步被取消的父任务。
   * 用户删除或清空表示本时段主动放弃；系统停止则只释放 pending，
   * 允许下次启动后重新触发。
   */
  handleLogicalTaskCanceled(logicalId, reason) {
    const allowRetry = reason === "system_stopped";
    if (logicalId === this.pendingExerciseTaskId) {
      if (allowRetry) {
        this.host.cronScheduler.clearExercisePending();
      } else {
        this.host.cronScheduler.markExerciseHandled();
      }
      this.pendingExerciseTaskId = null;
    }
    if (logicalId === this.pendingBattleTaskId) {
      if (allowRetry) {
        this.host.cronScheduler.clearBattlePending();
      } else {
        this.host.cronScheduler.markBattleHandled();
      }
      this.pendingBattleTaskId = null;
      this.pendingBattleConfig = null;
      this.pendingBattleResult = null;
    }
    if (logicalId === this.pendingDecisiveTaskId) {
      if (allowRetry) {
        this.host.cronScheduler.clearDecisivePending();
      } else {
        this.host.cronScheduler.markDecisiveHandled();
      }
      this.pendingDecisiveTaskId = null;
      this.pendingDecisiveResult = null;
    }
    if (logicalId === this.pendingLootTaskId) {
      if (allowRetry) {
        this.host.cronScheduler.clearLootPending();
      } else {
        this.host.cronScheduler.markLootHandled();
      }
      this.pendingLootTaskId = null;
    }
    this.pendingNormalFightConfigs.delete(logicalId);
    if (this.pendingNormalFightTaskIds.delete(logicalId)) {
      if (this.pendingNormalFightTaskIds.size !== 0)
        return;
      if (allowRetry) {
        this.host.cronScheduler.clearNormalFightPending();
      } else {
        this.host.cronScheduler.markNormalFightHandled();
      }
    }
  }
  /** 处理后端 stdout 日志，作为 WebSocket 日志的进度兜底。 */
  handleBackendRuntimeLog(message) {
    if (this.runtime.consume(message)) {
      this.host.renderMain();
    }
  }
  /** 绑定定时调度器回调 */
  bindCronCallbacks() {
    this.host.cronScheduler.setCallbacks({
      onExerciseDue: (fleetId) => {
        const id = this.host.scheduler.addTask("\u81EA\u52A8\u6F14\u4E60", "exercise", { type: "exercise", fleet_id: fleetId }, scheduler_1.TaskPriority.DAILY, 1);
        this.pendingExerciseTaskId = id;
        Logger_1.Logger.info(`\u81EA\u52A8\u6F14\u4E60\u5DF2\u52A0\u5165\u961F\u5217 (\u8230\u961F ${fleetId})`);
        this.host.scheduler.startConsuming();
      },
      onCampaignDue: (campaignName, times) => {
        const remaining = this.host.campaignDailyQuota.remaining(campaignName, times);
        if (remaining === 0) {
          this.host.cronScheduler.markBattleHandled();
          return;
        }
        const id = this.host.scheduler.addTask(`\u81EA\u52A8\u6218\u5F79\xB7${campaignName}`, "campaign", { type: "campaign", campaign_name: campaignName, times: 1 }, scheduler_1.TaskPriority.DAILY, remaining);
        this.pendingBattleTaskId = id;
        this.pendingBattleConfig = {
          campaignName,
          target: times,
          remainingAtStart: remaining
        };
        this.pendingBattleResult = null;
        Logger_1.Logger.info(`\u81EA\u52A8\u6218\u5F79\u5DF2\u52A0\u5165\u961F\u5217 (${campaignName}\uFF0C\u5269\u4F59\u7ED3\u7B97 ${remaining} \u6B21)`);
        this.host.scheduler.startConsuming();
      },
      onLootDue: (source, planId, stopCount) => {
        void this.enqueueLootTask(source, planId, stopCount);
      },
      canStartNormalFight: () => {
        const tasks = this.host.configModel.current.daily_automation.normal_fight_tasks;
        const hasRemaining = this.host.normalFightDailyQuota.hasRemaining(tasks);
        const completelyIdle = this.host.scheduler.isCompletelyIdle;
        this.host.refreshNormalFightRemaining();
        return completelyIdle && hasRemaining;
      },
      onNormalFightDue: () => {
        void this.enqueueNormalFightTasks();
      },
      onDecisiveDue: (source) => {
        void this.enqueueDecisiveTask(source);
      },
      onLog: (level, message) => {
        Logger_1.Logger.logLevel(level, message);
      }
    });
  }
  async enqueueDecisiveTask(source) {
    try {
      this.pendingDecisiveTaskId = await this.taskLoader.loadDecisiveTask(source);
    } catch (error) {
      Logger_1.Logger.error(`\u81EA\u52A8\u51B3\u6218\u52A0\u8F7D\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      this.host.cronScheduler.clearDecisivePending();
    }
  }
  async enqueueNormalFightTasks() {
    try {
      const result = await this.taskLoader.loadNormalFightTasks();
      if (result.status === "handled") {
        this.host.cronScheduler.markNormalFightHandled();
        return;
      }
      if (result.status === "retry") {
        this.host.cronScheduler.clearNormalFightPending();
        return;
      }
      for (const task of result.tasks) {
        this.pendingNormalFightTaskIds.add(task.taskId);
        this.pendingNormalFightConfigs.set(task.taskId, structuredClone(task.config));
      }
      this.host.scheduler.startConsuming();
    } catch (error) {
      Logger_1.Logger.error(`\u81EA\u52A8\u51FA\u5F81\u52A0\u8F7D\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      this.host.cronScheduler.clearNormalFightPending();
    }
  }
  async enqueueLootTask(source, planId, stopCount) {
    try {
      const taskId = await this.taskLoader.loadLootTask(source, planId, stopCount);
      if (taskId) {
        this.pendingLootTaskId = taskId;
        return;
      }
      this.host.cronScheduler.clearLootPending();
    } catch (error) {
      Logger_1.Logger.error(`\u81EA\u52A8\u6218\u5229\u54C1\u52A0\u8F7D\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      this.host.cronScheduler.clearLootPending();
    }
  }
};
exports.SchedulerBinder = SchedulerBinder;