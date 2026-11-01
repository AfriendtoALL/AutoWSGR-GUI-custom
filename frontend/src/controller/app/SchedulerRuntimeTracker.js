"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerRuntimeTracker = void 0;
var DailySortieStats_1 = require_DailySortieStats();
var Logger_1 = require_Logger();
var DEFAULT_EXERCISE_TOTAL = 5;
var LOG_DEDUP_WINDOW_MS = 1200;
var SchedulerRuntimeTracker = class {
  constructor(scheduler, onRefresh) {
    this.scheduler = scheduler;
    this.onRefresh = onRefresh;
    this.exerciseTotal = DEFAULT_EXERCISE_TOTAL;
    this.exerciseCurrent = 0;
    this.exerciseRoundInProgress = false;
    this.lastParsedLogMessage = "";
    this.lastParsedLogTaskId = "";
    this.lastParsedLogAt = 0;
    this.dailySortieStats = new DailySortieStats_1.DailySortieStats();
    this.dailyStatsRefreshTimer = null;
    this.currentProgress = "";
    this.trackedLoot = "";
    this.trackedShip = "";
    this.wsConnected = false;
    this.expeditionTimerText = "--:--";
    this.scheduleDailyStatsRefresh();
  }
  get snapshot() {
    return {
      currentProgress: this.currentProgress,
      trackedLoot: this.trackedLoot,
      trackedShip: this.trackedShip,
      dailySortieStats: this.dailySortieStats.getSnapshot(),
      wsConnected: this.wsConnected,
      expeditionTimerText: this.expeditionTimerText
    };
  }
  updateProgress(current, total) {
    if (this.scheduler.currentRunningTask?.type === "exercise") {
      if (!this.currentProgress) {
        this.currentProgress = `0/${this.exerciseTotal}`;
      }
      return;
    }
    this.currentProgress = `${current}/${total}`;
  }
  setConnection(connected) {
    this.wsConnected = connected;
  }
  updateExpeditionTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    this.expeditionTimerText = `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    return this.expeditionTimerText;
  }
  reset() {
    this.currentProgress = "";
    this.exerciseCurrent = 0;
    this.exerciseTotal = DEFAULT_EXERCISE_TOTAL;
    this.exerciseRoundInProgress = false;
    this.lastParsedLogMessage = "";
    this.lastParsedLogTaskId = "";
    this.lastParsedLogAt = 0;
    this.trackedLoot = "";
    this.trackedShip = "";
  }
  /** 5.9：用 WS loot_update 更新 UI 统计，日志解析仍可覆盖为 x/max 形式。 */
  applyLootUpdate(loot, ship) {
    let changed = false;
    if (Number.isInteger(loot)) {
      const next = String(loot);
      if (next !== this.trackedLoot) {
        this.trackedLoot = next;
        changed = true;
      }
    }
    if (Number.isInteger(ship)) {
      const next = String(ship);
      if (next !== this.trackedShip) {
        this.trackedShip = next;
        changed = true;
      }
    }
    return changed;
  }
  consume(message) {
    const normalized = message.trim();
    let changed = this.dailySortieStats.consume(normalized);
    if (changed)
      this.scheduleDailyStatsRefresh();
    const lootMatch = message.match(/\[UI\] 战利品数量: (\d+\/\d+)/);
    if (lootMatch && lootMatch[1] !== this.trackedLoot) {
      this.trackedLoot = lootMatch[1];
      changed = true;
    }
    const shipMatch = message.match(/\[UI\] 舰船数量: (\d+\/\d+)/);
    if (shipMatch && shipMatch[1] !== this.trackedShip) {
      this.trackedShip = shipMatch[1];
      changed = true;
    }
    const campaignMatch = message.match(/\[OPS\] 战役次数: (\d+)\/(\d+)/);
    if (campaignMatch) {
      this.updateCampaignRemains(Number.parseInt(campaignMatch[1], 10));
      changed = true;
    }
    const running = this.scheduler.currentRunningTask;
    if (running?.type !== "exercise")
      return changed;
    const now = Date.now();
    const duplicate = this.lastParsedLogTaskId === running.id && this.lastParsedLogMessage === normalized && now - this.lastParsedLogAt < LOG_DEDUP_WINDOW_MS;
    if (duplicate)
      return changed;
    const progressChanged = this.updateExerciseProgress(normalized);
    this.lastParsedLogTaskId = running.id;
    this.lastParsedLogMessage = normalized;
    this.lastParsedLogAt = now;
    return changed || progressChanged;
  }
  dispose() {
    if (this.dailyStatsRefreshTimer) {
      clearTimeout(this.dailyStatsRefreshTimer);
      this.dailyStatsRefreshTimer = null;
    }
  }
  updateCampaignRemains(remains) {
    const running = this.scheduler.currentRunningTask;
    const queue = this.scheduler.taskQueue;
    let campaignRemaining = 0;
    if (running?.type === "campaign") {
      campaignRemaining += running.remainingTimes;
    }
    for (const task of queue) {
      if (task.type === "campaign") {
        campaignRemaining += task.remainingTimes;
      }
    }
    if (remains >= campaignRemaining)
      return;
    let difference = campaignRemaining - remains;
    Logger_1.Logger.info(`\u6218\u5F79\u6B21\u6570\u540C\u6B65: \u540E\u7AEF\u62A5\u544A\u5269\u4F59 ${remains}\uFF0C\u524D\u7AEF\u961F\u5217\u5F85\u6267\u884C ${campaignRemaining}\uFF0C\u51CF\u5C11 ${difference} \u6B21`);
    for (let index = queue.length - 1; index >= 0 && difference > 0; index--) {
      const task = queue[index];
      if (task.type !== "campaign")
        continue;
      const deduct = Math.min(difference, task.remainingTimes);
      task.remainingTimes -= deduct;
      difference -= deduct;
      if (task.remainingTimes <= 0) {
        this.scheduler.removeTask(task.id);
      }
    }
    this.scheduler.notifyQueueChange();
  }
  updateExerciseProgress(message) {
    let changed = false;
    if (/(?:\[[^\]]+\]\s*)?开始演习流程/.test(message)) {
      this.exerciseCurrent = 0;
      this.exerciseRoundInProgress = false;
      this.currentProgress = `0/${this.exerciseTotal}`;
      return true;
    }
    const rivalMatch = message.match(/(?:\[[^\]]+\]\s*)?(?:当前可挑战对手|演习对手状态):\s*ExerciseRivalStatus\(\[([^\]]*)\]\)/);
    if (rivalMatch) {
      const flags = rivalMatch[1].split(",").map((flag) => flag.trim().toUpperCase()).filter(Boolean);
      if (flags.length > 0) {
        const available = flags.filter((flag) => flag === "Y").length;
        const nextTotal = available > 0 ? available : flags.length;
        if (nextTotal > 0 && nextTotal !== this.exerciseTotal) {
          this.exerciseTotal = nextTotal;
          changed = true;
        }
        if (!this.currentProgress) {
          this.currentProgress = `0/${this.exerciseTotal}`;
          changed = true;
        }
      }
    }
    const hasRoundStartSignal = /(?:\[[^\]]+\]\s*)?正在挑战对手\s*\d+/.test(message) || /(?:\[[^\]]+\]\s*)?选择对手\s*\d+/.test(message) || /(?:\[[^\]]+\]\s*)?演习\s*[->→]\s*开始战斗/.test(message);
    if (hasRoundStartSignal && !this.exerciseRoundInProgress) {
      this.exerciseRoundInProgress = true;
      this.exerciseCurrent += 1;
      if (this.exerciseCurrent > this.exerciseTotal) {
        this.exerciseTotal = this.exerciseCurrent;
      }
      const next = `${this.exerciseCurrent}/${this.exerciseTotal}`;
      if (next !== this.currentProgress) {
        this.currentProgress = next;
        changed = true;
      }
    }
    if (/(?:\[[^\]]+\]\s*)?战斗结束:\s*/.test(message)) {
      if (!this.exerciseRoundInProgress) {
        this.exerciseCurrent += 1;
        if (this.exerciseCurrent > this.exerciseTotal) {
          this.exerciseTotal = this.exerciseCurrent;
        }
        const next = `${this.exerciseCurrent}/${this.exerciseTotal}`;
        if (next !== this.currentProgress) {
          this.currentProgress = next;
          changed = true;
        }
      }
      this.exerciseRoundInProgress = false;
    }
    const finishedMatch = message.match(/(?:\[[^\]]+\]\s*)?演习流程结束,\s*共完成\s*(\d+)\s*场/);
    if (finishedMatch) {
      const done = Number.parseInt(finishedMatch[1], 10);
      if (Number.isFinite(done) && done >= 0) {
        this.exerciseCurrent = done;
        this.exerciseRoundInProgress = false;
        if (done > this.exerciseTotal)
          this.exerciseTotal = done;
        const next = `${this.exerciseCurrent}/${this.exerciseTotal}`;
        if (next !== this.currentProgress) {
          this.currentProgress = next;
          changed = true;
        }
      }
    }
    return changed;
  }
  scheduleDailyStatsRefresh() {
    if (this.dailyStatsRefreshTimer) {
      clearTimeout(this.dailyStatsRefreshTimer);
    }
    const now = Date.now();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const noticeUntil = this.dailySortieStats.getSnapshot(now).dropNotice?.visibleUntil;
    const nextRefreshAt = noticeUntil && noticeUntil > now ? Math.min(noticeUntil, tomorrow.getTime()) : tomorrow.getTime();
    const delay = Math.max(25, nextRefreshAt - now + 25);
    this.dailyStatsRefreshTimer = setTimeout(() => {
      this.dailySortieStats.getSnapshot();
      this.onRefresh();
      this.scheduleDailyStatsRefresh();
    }, delay);
  }
};
exports.SchedulerRuntimeTracker = SchedulerRuntimeTracker;