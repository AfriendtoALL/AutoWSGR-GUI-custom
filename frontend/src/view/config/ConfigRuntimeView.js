"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigRuntimeView = void 0;
function element(id) {
  const target = document.getElementById(id);
  if (!target)
    throw new Error(`\u8BBE\u7F6E\u63A7\u4EF6\u4E0D\u5B58\u5728: ${id}`);
  return target;
}
var ConfigRuntimeView = class {
  constructor() {
    this.guiUpdateProgress = element("gui-update-progress");
    this.guiUpdateStatus = element("gui-update-status");
    this.guiUpdatePercent = element("gui-update-percent");
    this.guiUpdateProgressTrack = element("gui-update-progress-track");
    this.guiUpdateProgressFill = element("gui-update-progress-fill");
    this.backendUpdateProgress = element("backend-update-progress");
    this.backendUpdateStatus = element("backend-update-status");
    this.backendUpdatePercent = element("backend-update-percent");
    this.backendUpdateProgressTrack = element("backend-update-progress-track");
    this.backendUpdateProgressFill = element("backend-update-progress-fill");
    this.backendStatus = document.getElementById("cfg-backend-status");
    this.cudaStatus = document.getElementById("cfg-cuda-status");
    this.pythonStatus = document.getElementById("cfg-python-status");
    this.adbStatus = document.getElementById("cfg-adb-status");
    this.shipLibraryStatus = document.getElementById("ship-library-status");
    this.validateCudaButton = document.getElementById("btn-validate-cuda");
    this.validatePythonButton = document.getElementById("btn-validate-python");
    this.updateShipLibraryButton = document.getElementById("btn-update-ship-library");
    this.shipLibraryUpdateLabel = "\u66F4\u65B0\u8230\u8239\u6570\u636E\u5E93";
  }
  setCudaStatus(text, status, details = text) {
    this.setStatus(this.cudaStatus, text, status);
    if (this.cudaStatus)
      this.cudaStatus.title = details;
  }
  setPythonStatus(text, status) {
    this.setStatus(this.pythonStatus, text, status);
  }
  setBackendStatus(text, status) {
    this.setStatus(this.backendStatus, text, status);
  }
  setShipLibraryStatus(text, status, details = text) {
    this.setStatus(this.shipLibraryStatus, text, status);
    if (this.shipLibraryStatus)
      this.shipLibraryStatus.title = details;
  }
  setShipLibraryUpdateLabel(label) {
    this.shipLibraryUpdateLabel = label;
    if (this.updateShipLibraryButton && !this.updateShipLibraryButton.disabled) {
      this.updateShipLibraryButton.textContent = label;
    }
  }
  setAdbStatus(text, status) {
    if (!this.adbStatus)
      return;
    this.adbStatus.title = text;
    this.adbStatus.textContent = status === "online" ? "\u5728\u7EBF" : status === "offline" ? "\u79BB\u7EBF" : text.includes("\u4E2D") ? text : "\u672A\u68C0\u6D4B";
    this.adbStatus.className = `adb-status adb-status-${status}`;
  }
  setCudaValidateLoading(loading) {
    if (!this.validateCudaButton)
      return;
    this.validateCudaButton.disabled = loading;
    this.validateCudaButton.textContent = loading ? "\u68C0\u6D4B\u4E2D\u2026" : "\u68C0\u6D4B";
  }
  setPythonValidateLoading(loading) {
    if (!this.validatePythonButton)
      return;
    this.validatePythonButton.disabled = loading;
    this.validatePythonButton.textContent = loading ? "\u68C0\u6D4B\u4E2D\u2026" : "\u68C0\u6D4B";
  }
  setShipLibraryUpdateLoading(loading) {
    if (!this.updateShipLibraryButton)
      return;
    this.updateShipLibraryButton.disabled = loading;
    this.updateShipLibraryButton.textContent = loading ? this.shipLibraryUpdateLabel === "\u540C\u6B65\u540E\u7AEF" ? "\u6B63\u5728\u540C\u6B65\u2026" : "\u6B63\u5728\u68C0\u67E5\u2026" : this.shipLibraryUpdateLabel;
  }
  setBackendCheckLoading(loading) {
    this.setButtonLoading("btn-check-backend", loading, "\u68C0\u6D4B\u4E2D\u2026", "\u68C0\u6D4B");
  }
  setAdbCheckLoading(loading) {
    this.setButtonLoading("btn-check-adb", loading, "\u68C0\u6D4B\u4E2D\u2026", "\u81EA\u52A8\u68C0\u6D4B");
  }
  setAdbConnectionLoading(action, loading) {
    this.setButtonLoading(action === "connect" ? "btn-connect-adb" : "btn-disconnect-adb", loading, action === "connect" ? "\u8FDE\u63A5\u4E2D\u2026" : "\u65AD\u5F00\u4E2D\u2026", action === "connect" ? "\u4E3B\u52A8\u8FDE\u63A5" : "\u65AD\u5F00\u8FDE\u63A5");
  }
  setUpdateCheckLoading(loading) {
    this.setButtonLoading("btn-check-updates", loading, "\u68C0\u67E5\u4E2D\u2026", "\u7ACB\u5373\u68C0\u67E5");
  }
  setGuiUpdateStatus(status) {
    let text;
    let percent = 0;
    let state = "active";
    let percentText = null;
    switch (status.status) {
      case "checking":
        text = "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026";
        percent = null;
        percentText = "\u68C0\u67E5\u4E2D";
        break;
      case "available":
        text = `\u53D1\u73B0 v${status.version}\uFF0C\u7B49\u5F85\u4E0B\u8F7D`;
        break;
      case "up-to-date":
        text = "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C";
        percent = 100;
        state = "complete";
        break;
      case "downloading":
        percent = null;
        percentText = "\u540E\u53F0";
        text = "\u6B63\u5728\u540E\u53F0\u4E0B\u8F7D\u5E76\u6821\u9A8C\u66F4\u65B0\u2026";
        break;
      case "downloaded":
        text = `v${status.version} \u5DF2\u51C6\u5907\u5B8C\u6210\uFF0C\u7B49\u5F85\u9009\u62E9\u91CD\u542F\u65F6\u95F4`;
        percent = 100;
        state = "complete";
        break;
      case "deferred":
        text = `v${status.version} \u5C06\u5728\u4E0B\u6B21\u6253\u5F00\u524D\u66F4\u65B0`;
        percent = 100;
        state = "complete";
        break;
      case "installing":
        text = status.message;
        percent = 100;
        break;
      case "error":
        text = `\u66F4\u65B0\u5931\u8D25\uFF1A${status.message}`;
        percentText = "\u5931\u8D25";
        state = "error";
        break;
    }
    this.guiUpdateProgress.hidden = false;
    this.guiUpdateProgress.dataset["state"] = state;
    this.guiUpdateProgress.title = text;
    this.guiUpdateStatus.textContent = text;
    this.guiUpdatePercent.textContent = percentText ?? `${percent ?? 0}%`;
    this.guiUpdateProgressTrack.classList.toggle("is-indeterminate", percent === null);
    this.guiUpdateProgressFill.style.width = `${percent ?? 0}%`;
    if (percent === null) {
      this.guiUpdateProgressTrack.removeAttribute("aria-valuenow");
    } else {
      this.guiUpdateProgressTrack.setAttribute("aria-valuenow", String(percent));
    }
  }
  setBackendUpdateCheckLoading(loading) {
    this.setButtonLoading("btn-check-backend-updates", loading, "\u68C0\u67E5\u4E2D\u2026", "\u7ACB\u5373\u68C0\u67E5");
  }
  setBackendUpdateStatus(status) {
    let text;
    let percent = 0;
    let state = "active";
    let percentText = null;
    switch (status.status) {
      case "checking":
        text = "\u6B63\u5728\u68C0\u67E5\u540E\u7AEF\u66F4\u65B0\u2026";
        percent = null;
        percentText = "\u68C0\u67E5\u4E2D";
        break;
      case "available":
        text = `\u53D1\u73B0\u540E\u7AEF\u66F4\u65B0 (${status.commit.slice(0, 7)})\uFF0C\u6B63\u5728\u51C6\u5907\u2026`;
        break;
      case "up-to-date":
        text = "\u540E\u7AEF\u5DF2\u662F\u6700\u65B0\u7248\u672C";
        percent = 100;
        state = "complete";
        break;
      case "downloading":
        percent = status.progress;
        text = "\u6B63\u5728\u4E0B\u8F7D\u540E\u7AEF\u66F4\u65B0\u2026";
        percentText = `${percent}%`;
        break;
      case "downloaded":
        text = "\u540E\u7AEF\u66F4\u65B0\u5DF2\u51C6\u5907\u5B8C\u6210\uFF0C\u91CD\u542F GUI \u540E\u751F\u6548";
        percent = 100;
        state = "complete";
        break;
      case "deferred":
        text = "\u540E\u7AEF\u66F4\u65B0\u5C06\u5728\u91CD\u542F GUI \u65F6\u5E94\u7528";
        percent = 100;
        state = "complete";
        break;
      case "error":
        text = `\u540E\u7AEF\u66F4\u65B0\u5931\u8D25\uFF1A${status.message}`;
        percentText = "\u5931\u8D25";
        state = "error";
        break;
    }
    this.backendUpdateProgress.hidden = false;
    this.backendUpdateProgress.dataset["state"] = state;
    this.backendUpdateProgress.title = text;
    this.backendUpdateStatus.textContent = text;
    this.backendUpdatePercent.textContent = percentText ?? `${percent ?? 0}%`;
    this.backendUpdateProgressTrack.classList.toggle("is-indeterminate", percent === null);
    this.backendUpdateProgressFill.style.width = `${percent ?? 0}%`;
    if (percent === null) {
      this.backendUpdateProgressTrack.removeAttribute("aria-valuenow");
    } else {
      this.backendUpdateProgressTrack.setAttribute("aria-valuenow", String(percent));
    }
  }
  setStatus(target, text, status) {
    if (!target)
      return;
    target.textContent = text;
    const cls = status === "ok" ? "adb-status-online" : status === "error" ? "adb-status-offline" : "adb-status-unknown";
    target.className = `adb-status ${cls}`;
  }
  setButtonLoading(id, loading, loadingText, idleText) {
    const button = document.getElementById(id);
    if (!button)
      return;
    button.disabled = loading;
    button.textContent = loading ? loadingText : idleText;
  }
};
exports.ConfigRuntimeView = ConfigRuntimeView;