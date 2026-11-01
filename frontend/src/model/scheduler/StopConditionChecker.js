"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StopConditionChecker = void 0;
var Logger_1 = require_Logger();
var index_js_1 = require_adapter();
function isEnabledThreshold(value) {
  return Number.isInteger(value) && Number(value) >= 0;
}
var StopConditionChecker = class {
  constructor(api, emitLog) {
    this.trackedLootCount = null;
    this.trackedShipCount = null;
    this.api = api;
    this.emitLog = emitLog;
  }
  /** 更新从日志解析的跟踪值 */
  updateTracked(loot, ship) {
    if (loot != null)
      this.trackedLootCount = loot;
    if (ship != null)
      this.trackedShipCount = ship;
  }
  /** 任务执行中实时检查停止条件，返回是否满足 */
  checkRunning(cond) {
    let met = false;
    if (isEnabledThreshold(cond.loot_count_ge) && this.trackedLootCount != null && this.trackedLootCount >= cond.loot_count_ge) {
      this.emitLog("info", `\u6218\u5229\u54C1\u5DF2\u8FBE ${this.trackedLootCount}/${cond.loot_count_ge}\uFF0C\u5B9E\u65F6\u89E6\u53D1\u505C\u6B62`);
      met = true;
    }
    if (isEnabledThreshold(cond.ship_count_ge) && this.trackedShipCount != null && this.trackedShipCount >= cond.ship_count_ge) {
      this.emitLog("info", `\u8230\u8239\u5DF2\u8FBE ${this.trackedShipCount}/${cond.ship_count_ge}\uFF0C\u5B9E\u65F6\u89E6\u53D1\u505C\u6B62`);
      met = true;
    }
    return met;
  }
  /**
   * 掉落检查：在发起 taskStart 之前确认停止条件是否已满足。
   * 仅依赖 OCR：调用 /api/game/acquisition 读取出征面板数量。
   */
  async preflightCheck(cond, taskName) {
    Logger_1.Logger.debug(`[StopCond] \u6389\u843D\u68C0\u67E5: \u300C${taskName}\u300D \u6761\u4EF6=${index_js_1.jsonCodec.stringify(cond)}`, "scheduler");
    if (!isEnabledThreshold(cond.loot_count_ge) && !isEnabledThreshold(cond.ship_count_ge)) {
      return false;
    }
    try {
      const resp = await this.api.gameAcquisition();
      if (resp.success && resp.data) {
        const { loot_count, ship_count } = resp.data;
        Logger_1.Logger.debug(`[StopCond] acquisition OCR: loot=${loot_count} ship=${ship_count}`, "scheduler");
        if (loot_count != null)
          this.trackedLootCount = loot_count;
        if (ship_count != null)
          this.trackedShipCount = ship_count;
        if (isEnabledThreshold(cond.loot_count_ge) && loot_count != null && loot_count >= cond.loot_count_ge) {
          this.emitLog("info", `[\u6389\u843D] \u6218\u5229\u54C1 ${loot_count} \u2265 ${cond.loot_count_ge}\uFF0C\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6`);
          return true;
        }
        if (isEnabledThreshold(cond.ship_count_ge) && ship_count != null && ship_count >= cond.ship_count_ge) {
          this.emitLog("info", `[\u6389\u843D] \u8230\u8239 ${ship_count} \u2265 ${cond.ship_count_ge}\uFF0C\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6`);
          return true;
        }
        this.emitLog("info", `[\u6389\u843D] \u6218\u5229\u54C1=${loot_count ?? "-"} \u8230\u8239=${ship_count ?? "-"}\uFF0C\u672A\u8FBE\u505C\u6B62\u6761\u4EF6`);
      } else {
        this.emitLog("warn", `[\u6389\u843D] \u68C0\u67E5\u5931\u8D25: ${resp.error ?? "unknown error"}`);
      }
    } catch (e) {
      this.emitLog("warn", `[\u6389\u843D] \u68C0\u67E5\u5F02\u5E38: ${String(e)}`);
    }
    Logger_1.Logger.debug(`[StopCond] \u6389\u843D\u68C0\u67E5: \u672A\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6\uFF0C\u4EFB\u52A1\u5C06\u542F\u52A8`, "scheduler");
    return false;
  }
  /** 检查掉落停止条件（等级条件已由后端 run_rounds 求值，见 stop_reason） */
  async checkCondition(cond, _taskName, _result) {
    if (!isEnabledThreshold(cond.loot_count_ge) && !isEnabledThreshold(cond.ship_count_ge)) {
      return false;
    }
    if (isEnabledThreshold(cond.loot_count_ge) && this.trackedLootCount != null && this.trackedLootCount >= cond.loot_count_ge) {
      this.emitLog("info", `\u6218\u5229\u54C1\u5DF2\u8FBE ${this.trackedLootCount}\uFF0C\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6 (\u2265${cond.loot_count_ge})`);
      return true;
    }
    if (isEnabledThreshold(cond.ship_count_ge) && this.trackedShipCount != null && this.trackedShipCount >= cond.ship_count_ge) {
      this.emitLog("info", `\u8230\u8239\u83B7\u53D6\u5DF2\u8FBE ${this.trackedShipCount}\uFF0C\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6 (\u2265${cond.ship_count_ge})`);
      return true;
    }
    try {
      const resp = await this.api.gameContext();
      if (!resp.success || !resp.data)
        return false;
      const data = resp.data;
      if (isEnabledThreshold(cond.loot_count_ge) && data.dropped_loot_count != null && data.dropped_loot_count >= cond.loot_count_ge) {
        this.emitLog("info", `\u6218\u5229\u54C1\u5DF2\u8FBE ${data.dropped_loot_count}\uFF0C\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6 (\u2265${cond.loot_count_ge})`);
        return true;
      }
      if (isEnabledThreshold(cond.ship_count_ge) && data.dropped_ship_count != null && data.dropped_ship_count >= cond.ship_count_ge) {
        this.emitLog("info", `\u8230\u8239\u83B7\u53D6\u5DF2\u8FBE ${data.dropped_ship_count}\uFF0C\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6 (\u2265${cond.ship_count_ge})`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
};
exports.StopConditionChecker = StopConditionChecker;