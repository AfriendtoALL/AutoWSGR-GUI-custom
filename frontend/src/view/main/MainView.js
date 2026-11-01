"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainView = void 0;
var LogView_1 = require_LogView();
var TaskQueueView_1 = require_TaskQueueView();
var StatusBar_1 = require_StatusBar();
var FleetPreviewView_1 = require_FleetPreviewView();
var MainView = class {
  constructor() {
    this.logView = new LogView_1.LogView();
    this.taskQueueView = new TaskQueueView_1.TaskQueueView();
    this.statusBar = new StatusBar_1.StatusBar();
    this.fleetPreviewView = new FleetPreviewView_1.FleetPreviewView();
    window.addEventListener("beforeunload", () => {
      this.beforeUnloadHandler?.();
    });
  }
  /* ── 回调转发（Controller 直接赋值） ── */
  set onRemoveQueueItem(fn) {
    this.taskQueueView.onRemoveQueueItem = fn;
  }
  set onMoveQueueItem(fn) {
    this.taskQueueView.onMoveQueueItem = fn;
  }
  set onDropFromTaskGroup(fn) {
    this.taskQueueView.onDropFromTaskGroup = fn;
  }
  set onEditQueueItem(fn) {
    this.taskQueueView.onEditQueueItem = fn;
  }
  set onStopTask(fn) {
    this.taskQueueView.onStopTask = fn;
  }
  set onClearQueue(fn) {
    this.taskQueueView.onClearQueue = fn;
  }
  set onImportPlan(fn) {
    this.taskQueueView.onImportPlan = fn;
  }
  set onStartQueue(fn) {
    this.taskQueueView.onStartQueue = fn;
  }
  set onOperation(fn) {
    this.statusBar.onOperation = fn;
  }
  set onBeforeUnload(fn) {
    this.beforeUnloadHandler = fn;
  }
  /* ── 渲染 ── */
  render(vo) {
    this.statusBar.render(vo);
    this.taskQueueView.render(vo);
    this.fleetPreviewView.render(vo.currentFleet, vo.currentTask !== null, vo.dailySortieStats);
  }
  appendLog(entry) {
    this.logView.appendLog(entry);
  }
  setDebugMode(on) {
    this.logView.setDebugMode(on);
  }
  /* ── 状态 / 日常操作 ── */
  setOpsAvailability(connected) {
    this.statusBar.setOpsAvailability(connected);
  }
  setOpsStatus(text) {
    this.statusBar.setOpsStatus(text);
  }
  setOperationLoading(operation, loading) {
    this.statusBar.setOperationLoading(operation, loading);
  }
  setExpeditionTimer(text) {
    this.statusBar.setExpeditionTimer(text);
  }
  setRecognizerErrors(errors) {
    this.logView.setRecognizerErrors(errors);
  }
  setVersion(v) {
    this.statusBar.setVersion(v);
  }
};
exports.MainView = MainView;