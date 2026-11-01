"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationConflictController = void 0;
var MigrationConflictView_js_1 = require_MigrationConflictView();
var DialogHelper_js_1 = require_DialogHelper();
var IpcAdapter_js_1 = require_IpcAdapter();
var MigrationConflictController = class {
  constructor(repository = (0, IpcAdapter_js_1.getPlansGateway)()) {
    this.repository = repository;
    this.finishReview = null;
    this.view = new MigrationConflictView_js_1.MigrationConflictView({
      onSubmit: (keepIds) => {
        void this.submit(keepIds);
      }
    });
  }
  async reviewPending(onBeforeOpen) {
    if (!this.repository?.getMigrationConflicts)
      return;
    const result = await this.repository.getMigrationConflicts();
    if (result.pending && result.conflicts.length > 0) {
      // 6.11b/R36：骨架 z-index 高于 .modal-overlay，必须先摘骨架再弹冲突框。
      if (typeof onBeforeOpen === "function")
        onBeforeOpen();
      this.view.open(result.conflicts);
      await new Promise((resolve) => {
        this.finishReview = resolve;
      });
    }
  }
  async submit(keepIds) {
    if (!this.repository?.resolveMigrationConflicts) {
      this.view.setStatus("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5904\u7406\u8FC1\u79FB\u51B2\u7A81\uFF0C\u8BF7\u91CD\u542F GUI\u3002");
      return;
    }
    const deleteCount = this.view.deleteCount();
    if (deleteCount > 0) {
      const confirmed = await (0, DialogHelper_js_1.showConfirm)("\u786E\u8BA4\u5220\u9664\u672A\u4FDD\u7559\u7684 YAML", [
        `\u5C06\u76F4\u63A5\u5220\u9664 ${deleteCount} \u4E2A\u7528\u6237\u914D\u7F6E\u6587\u4EF6\uFF0C\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002`,
        "\u4E0E\u7CFB\u7EDF\u9884\u8BBE\u5B8C\u5168\u76F8\u540C\u7684\u4EFB\u52A1\u5217\u8868\u548C\u81EA\u52A8\u80D6\u6B21\u5F15\u7528\u4F1A\u81EA\u52A8\u5207\u6362\u5230\u7CFB\u7EDF\u9884\u8BBE\u3002",
        "\u5176\u4ED6\u88AB\u5220\u9664\u914D\u7F6E\u7684\u73B0\u6709\u5F15\u7528\u53EF\u80FD\u5931\u6548\uFF0C\u5B58\u5728\u6570\u636E\u4E22\u5931\u98CE\u9669\u3002"
      ].join("\n"));
      if (!confirmed)
        return;
    }
    this.view.setBusy(true);
    this.view.setStatus("");
    try {
      const result = await this.repository.resolveMigrationConflicts(keepIds);
      if (result.remaining.length > 0) {
        this.view.replace(result.remaining);
        this.view.setStatus(result.errors.join("\n"));
        return;
      }
      this.view.close();
      this.finishReview?.();
      this.finishReview = null;
      await (0, DialogHelper_js_1.showAlert)("\u8FC1\u79FB\u51B2\u7A81\u5904\u7406\u5B8C\u6210", `\u4FDD\u7559 ${result.kept} \u9879\uFF0C\u5220\u9664 ${result.deleted} \u9879\u3002`);
    } catch (error) {
      this.view.setBusy(false);
      this.view.setStatus(error instanceof Error ? error.message : String(error));
    }
  }
};
exports.MigrationConflictController = MigrationConflictController;