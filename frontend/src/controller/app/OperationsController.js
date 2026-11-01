"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsController = void 0;
var OperationsController = class {
  constructor(api, mainView, logger) {
    this.api = api;
    this.mainView = mainView;
    this.logger = logger;
    this.operations = {
      expedition: {
        label: "\u6536\u53D6\u8FDC\u5F81",
        run: () => this.api.expeditionCheck()
      },
      reward: {
        label: "\u6536\u53D6\u5956\u52B1",
        run: () => this.api.rewardCollect()
      },
      buildCollect: {
        label: "\u6536\u53D6\u5EFA\u9020",
        run: () => this.api.buildCollect()
      },
      cook: {
        label: "\u98DF\u5802\u70F9\u996A",
        run: () => this.api.cook()
      }
    };
  }
  bindOpsActions() {
    this.mainView.onOperation = (operation) => {
      void this.runOperation(operation);
    };
  }
  updateOpsAvailability(connected) {
    this.mainView.setOpsAvailability(connected);
  }
  async runOperation(operation) {
    const { label, run } = this.operations[operation];
    this.mainView.setOperationLoading(operation, true);
    this.mainView.setOpsStatus(`${label}\u4E2D\u2026`);
    try {
      const response = await run();
      if (response.success) {
        this.logger.info(`${label}\u5B8C\u6210`);
        this.mainView.setOpsStatus(`${label}\u5B8C\u6210`);
      } else {
        this.logger.warn(`${label}\u5931\u8D25: ${response.error ?? response.message ?? "\u672A\u77E5\u9519\u8BEF"}`);
        this.mainView.setOpsStatus(`${label}\u5931\u8D25`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${label}\u5F02\u5E38: ${message}`);
      this.mainView.setOpsStatus(`${label}\u5F02\u5E38`);
    } finally {
      this.mainView.setOperationLoading(operation, false);
      setTimeout(() => this.mainView.setOpsStatus(""), 3e3);
    }
  }
};
exports.OperationsController = OperationsController;