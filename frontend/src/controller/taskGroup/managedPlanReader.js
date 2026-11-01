"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTaskGroupItemFile = readTaskGroupItemFile;
var IpcAdapter_1 = require_IpcAdapter();
async function readTaskGroupItemFile(item, repository = (0, IpcAdapter_1.getPlansGateway)()) {
  if (!repository)
    throw new Error("Electron bridge is unavailable");
  if (item.dailySource && item.dailyFile) {
    if (!repository.readDailyPlan) {
      throw new Error("\u5F53\u524D GUI \u4E0D\u652F\u6301\u8BFB\u53D6\u65E5\u5E38\u4EFB\u52A1\u76EE\u5F55");
    }
    const result = await repository.readDailyPlan(item.dailySource, item.dailyFile);
    if (!result.success || result.content === void 0 || !result.path) {
      throw new Error(result.error || `\u65E0\u6CD5\u8BFB\u53D6 ${item.dailyFile}`);
    }
    return {
      content: result.content,
      path: result.path
    };
  }
  if (item.managedSource && item.managedFile) {
    if (!repository.readManagedCombatPlan) {
      throw new Error("\u5F53\u524D GUI \u4E0D\u652F\u6301\u8BFB\u53D6\u8BA1\u5212\u7BA1\u7406\u76EE\u5F55");
    }
    const result = await repository.readManagedCombatPlan(item.managedSource, item.managedFile);
    if (!result.success || result.content === void 0 || !result.path) {
      throw new Error(result.error || `\u65E0\u6CD5\u8BFB\u53D6 ${item.managedFile}`);
    }
    return {
      content: result.content,
      path: result.runtimePath ?? result.path
    };
  }
  if (!item.path)
    throw new Error("\u4EFB\u52A1\u6CA1\u6709\u5173\u8054\u914D\u7F6E\u6587\u4EF6");
  if (repository.readCombatPlanFile) {
    const result = await repository.readCombatPlanFile(item.path);
    if (!result.success || result.content === void 0 || !result.path) {
      throw new Error(result.error || `\u65E0\u6CD5\u8BFB\u53D6 ${item.path}`);
    }
    return {
      content: result.content,
      path: result.runtimePath ?? result.path
    };
  }
  return {
    content: await repository.readFile(item.path),
    path: item.path
  };
}