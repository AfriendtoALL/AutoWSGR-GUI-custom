"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_TEXT = exports.PRIORITY_LABELS = void 0;
var scheduler_1 = require_scheduler2();
exports.PRIORITY_LABELS = {
  [scheduler_1.TaskPriority.EXPEDITION]: "\u8FDC\u5F81",
  [scheduler_1.TaskPriority.USER_TASK]: "\u7528\u6237",
  [scheduler_1.TaskPriority.DAILY]: "\u65E5\u5E38"
};
exports.STATUS_TEXT = {
  idle: "\u7A7A\u95F2",
  running: "\u8FD0\u884C\u4E2D",
  stopping: "\u6B63\u5728\u505C\u6B62\u2026",
  not_connected: "\u672A\u8FDE\u63A5"
};