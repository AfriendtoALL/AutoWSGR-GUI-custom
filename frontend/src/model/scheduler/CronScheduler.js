"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronScheduler = void 0;
var index_js_1 = require_adapter();
var campaign_js_1 = require_campaign();
var EXERCISE_REFRESH_HOURS = [0, 12, 18];
var LS_KEY_LAST_EXERCISE_RUN = "cron_lastExerciseRun";
var LS_KEY_LAST_BATTLE_RUN = "cron_lastBattleRun";
var LS_KEY_LAST_DECISIVE_RUN = "cron_lastDecisiveRun";
var LS_KEY_LAST_LOOT_RUN = "cron_lastLootRun";
var CronScheduler = class {
  constructor(config, storage = index_js_1.browserStorageStore) {
    this.callbacks = {};
    this.timer = null;
    this.lastExerciseRun = null;
    this.lastBattleRun = "";
    this.exercisePending = false;
    this.battlePending = false;
    this.normalFightPending = false;
    this.lastDecisiveRun = "";
    this.decisivePending = false;
    this.lastLootRun = "";
    this.lootPending = false;
    this.config = {
      ...config,
      battleTimes: campaign_js_1.DAILY_CAMPAIGN_TIMES
    };
    this.storage = storage;
  }
  setCallbacks(cb) {
    this.callbacks = cb;
  }
  /** 更新配置 (配置页保存时调用) */
  updateConfig(config) {
    Object.assign(this.config, config);
    this.config.battleTimes = campaign_js_1.DAILY_CAMPAIGN_TIMES;
  }
  /** 启动定时检查 (每分钟) */
  start() {
    this.stop();
    this.loadTimestamps();
    this.log("info", `\u5B9A\u65F6\u8C03\u5EA6\u914D\u7F6E: \u6F14\u4E60=${this.config.autoExercise}, \u6218\u5F79=${this.config.autoBattle}, \u5E38\u89C4\u51FA\u51FB=${this.config.autoNormalFight}, \u51B3\u6218=${this.config.autoDecisive}`);
    if (this.lastExerciseRun) {
      this.log("info", `\u4E0A\u6B21\u6F14\u4E60\u5B8C\u6210: ${this.lastExerciseRun.toLocaleString()}`);
    }
    if (this.lastBattleRun) {
      this.log("info", `\u4E0A\u6B21\u6218\u5F79\u5B8C\u6210: ${this.lastBattleRun}`);
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), 6e4);
  }
  /** 停止定时检查 */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  // ── 时间戳记录 ──
  /** Controller 在演习任务成功完成后调用 */
  markExerciseCompleted() {
    this.lastExerciseRun = /* @__PURE__ */ new Date();
    this.exercisePending = false;
    try {
      this.storage.set(LS_KEY_LAST_EXERCISE_RUN, this.lastExerciseRun.toISOString());
    } catch {
    }
    this.log("info", "\u6F14\u4E60\u4EFB\u52A1\u5B8C\u6210\uFF0C\u5DF2\u8BB0\u5F55\u8FD0\u884C\u65F6\u95F4");
  }
  /** 演习任务被用户取消，本刷新时段不再重复触发。 */
  markExerciseHandled() {
    this.lastExerciseRun = /* @__PURE__ */ new Date();
    this.exercisePending = false;
    try {
      this.storage.set(LS_KEY_LAST_EXERCISE_RUN, this.lastExerciseRun.toISOString());
    } catch {
    }
    this.log("info", "\u6F14\u4E60\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF0C\u672C\u5237\u65B0\u65F6\u6BB5\u4E0D\u518D\u91CD\u590D\u89E6\u53D1");
  }
  /** 战役目标完成、次数耗尽或重试耗尽后，标记当天不再触发。 */
  markBattleHandled() {
    this.lastBattleRun = this.dateKey(/* @__PURE__ */ new Date());
    this.battlePending = false;
    try {
      this.storage.set(LS_KEY_LAST_BATTLE_RUN, this.lastBattleRun);
    } catch {
    }
    this.log("info", "\u6218\u5F79\u4EFB\u52A1\u5DF2\u5904\u7406\uFF0C\u4ECA\u65E5\u4E0D\u518D\u91CD\u590D\u89E6\u53D1");
  }
  /** 演习任务失败 — 清除 pending 标记，下次 tick 将重新触发 */
  clearExercisePending() {
    this.exercisePending = false;
  }
  /** 战役已有进展但目标未完成，清除 pending 以便下次 tick 补跑。 */
  clearBattlePending() {
    this.battlePending = false;
  }
  /** 一轮空闲自动出征已结束，允许下次空闲检查重新触发。 */
  markNormalFightHandled() {
    this.normalFightPending = false;
  }
  /** 常规出击失败 — 清除 pending，下次 tick 重试 */
  clearNormalFightPending() {
    this.normalFightPending = false;
  }
  /** 自动决战完成、主动离开或重试耗尽后，标记当天不再触发。 */
  markDecisiveHandled() {
    this.lastDecisiveRun = this.dateKey(/* @__PURE__ */ new Date());
    this.decisivePending = false;
    try {
      this.storage.set(LS_KEY_LAST_DECISIVE_RUN, this.lastDecisiveRun);
    } catch {
    }
    this.log("info", "\u81EA\u52A8\u51B3\u6218\u5DF2\u5904\u7406\uFF0C\u4ECA\u65E5\u4E0D\u518D\u91CD\u590D\u89E6\u53D1");
  }
  /** 决战任务尚未入队时清除 pending，允许下次 tick 重试。 */
  clearDecisivePending() {
    this.decisivePending = false;
  }
  /** 战利品达到停止条件、批次上限或重试上限后，标记当天不再触发。 */
  markLootHandled() {
    this.lastLootRun = this.dateKey(/* @__PURE__ */ new Date());
    this.lootPending = false;
    try {
      this.storage.set(LS_KEY_LAST_LOOT_RUN, this.lastLootRun);
    } catch {
    }
  }
  /** 战利品任务失败 — 清除 pending，下次 tick 重试 */
  clearLootPending() {
    this.lootPending = false;
  }
  // ── 持久化 ──
  /** 从持久化存储加载上次运行时间戳 */
  loadTimestamps() {
    try {
      const exRaw = this.storage.get(LS_KEY_LAST_EXERCISE_RUN);
      if (exRaw) {
        const d = new Date(exRaw);
        if (!isNaN(d.getTime()))
          this.lastExerciseRun = d;
      }
      this.lastBattleRun = this.storage.get(LS_KEY_LAST_BATTLE_RUN) || "";
      this.lastDecisiveRun = this.storage.get(LS_KEY_LAST_DECISIVE_RUN) || "";
      this.lastLootRun = this.storage.get(LS_KEY_LAST_LOOT_RUN) || "";
    } catch {
    }
  }
  // ── 核心 tick ──
  tick() {
    const now = /* @__PURE__ */ new Date();
    this.checkExercise(now);
    this.checkCampaign(now);
    this.checkNormalFight();
    this.checkDecisive(now);
    this.checkLoot(now);
  }
  /**
   * 检查演习:
   * 找到当前所属刷新时段的起始时间，若 lastExerciseRun 早于该时间则触发。
   * 上一时段任务仍在排队或执行时不重复触发；它执行时会消耗当前时段次数。
   */
  checkExercise(now) {
    if (!this.config.autoExercise)
      return;
    if (this.exercisePending)
      return;
    const hour = now.getHours();
    let slotHour = -1;
    for (let i = EXERCISE_REFRESH_HOURS.length - 1; i >= 0; i--) {
      if (hour >= EXERCISE_REFRESH_HOURS[i]) {
        slotHour = EXERCISE_REFRESH_HOURS[i];
        break;
      }
    }
    if (slotHour < 0)
      return;
    const slotStart = new Date(now);
    slotStart.setHours(slotHour, 0, 0, 0);
    if (!this.lastExerciseRun || this.lastExerciseRun < slotStart) {
      this.exercisePending = true;
      this.log("info", `\u81EA\u52A8\u6F14\u4E60\u89E6\u53D1 (${slotHour}:00 \u65F6\u6BB5, \u8230\u961F ${this.config.exerciseFleetId})`);
      this.callbacks.onExerciseDue?.(this.config.exerciseFleetId);
    }
  }
  /**
   * 检查战役:
   * 战役每日 0 点刷新。若 lastBattleRun 的日期不是今天则触发。
   * 上一天任务仍在排队或执行时不重复触发。
   */
  checkCampaign(now) {
    if (!this.config.autoBattle)
      return;
    if (this.battlePending)
      return;
    const todayStr = this.dateKey(now);
    if (this.lastBattleRun >= todayStr)
      return;
    this.battlePending = true;
    this.log("info", `\u81EA\u52A8\u6218\u5F79\u89E6\u53D1 (${this.config.battleType} \xD7${this.config.battleTimes})`);
    this.callbacks.onCampaignDue?.(this.config.battleType, this.config.battleTimes);
  }
  /**
   * 检查常规出击:
   * 每分钟确认调度器完全空闲，满足后将配置的任务各执行一次。
   */
  checkNormalFight() {
    if (!this.config.autoNormalFight)
      return;
    if (this.normalFightPending)
      return;
    if (this.callbacks.canStartNormalFight?.() !== true)
      return;
    this.normalFightPending = true;
    this.log("info", "\u8C03\u5EA6\u5668\u7A7A\u95F2\uFF0C\u81EA\u52A8\u51FA\u5F81\u89E6\u53D1 (\u914D\u7F6E\u4EFB\u52A1\u5404\u6267\u884C\u4E00\u6B21)");
    this.callbacks.onNormalFightDue?.();
  }
  /**
   * 检查决战:
   * 每日最多加入一轮。无法查询剩余票数，因此不推导票数保留或执行轮数。
   */
  checkDecisive(now) {
    if (!this.config.autoDecisive)
      return;
    if (this.decisivePending)
      return;
    const todayStr = this.dateKey(now);
    if (this.lastDecisiveRun >= todayStr)
      return;
    this.decisivePending = true;
    this.log("info", `\u81EA\u52A8\u51B3\u6218\u89E6\u53D1 (\u65B9\u6848=${this.config.decisiveTemplateId}, \u8F6E\u6570=1)`);
    this.callbacks.onDecisiveDue?.(this.config.decisiveTemplateId);
  }
  /**
   * 检查战利品:
   * 每日 0 点刷新。若 lastLootRun 不是今天则触发。
   * 上一天任务仍在排队或执行时不重复触发。
   */
  checkLoot(now) {
    if (!this.config.autoLoot)
      return;
    if (this.lootPending)
      return;
    const todayStr = this.dateKey(now);
    if (this.lastLootRun >= todayStr)
      return;
    this.lootPending = true;
    this.log("info", `\u81EA\u52A8\u6218\u5229\u54C1\u89E6\u53D1 (\u6765\u6E90=${this.config.lootPlanSource}, \u65B9\u6848=${this.config.lootPlanId}, \u505C\u6B62\u6570\u91CF=${this.config.lootStopCount})`);
    this.callbacks.onLootDue?.(this.config.lootPlanSource, this.config.lootPlanId, this.config.lootStopCount);
  }
  dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  log(level, message) {
    this.callbacks.onLog?.(level, message);
  }
};
exports.CronScheduler = CronScheduler;