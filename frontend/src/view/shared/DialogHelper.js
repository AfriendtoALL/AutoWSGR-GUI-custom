"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showSaveSuccess = showSaveSuccess;
exports.showWarningNotice = showWarningNotice;
exports.showPrompt = showPrompt;
exports.showConfirm = showConfirm;
exports.showAlert = showAlert;
var noticeTimer = null;
function showNotice(message, warning) {
  let notice = document.getElementById("save-success-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "save-success-notice";
    notice.className = "save-success-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.setAttribute("aria-hidden", "true");
    const icon2 = document.createElement("span");
    icon2.className = "save-success-notice-icon";
    icon2.setAttribute("aria-hidden", "true");
    const text2 = document.createElement("span");
    text2.className = "save-success-notice-text";
    notice.append(icon2, text2);
    document.body.append(notice);
  }
  const icon = notice.querySelector(".save-success-notice-icon");
  if (icon)
    icon.textContent = warning ? "!" : "\u2713";
  const text = notice.querySelector(".save-success-notice-text");
  if (text)
    text.textContent = message;
  notice.classList.toggle("is-warning", warning);
  notice.classList.add("is-visible");
  notice.setAttribute("aria-hidden", "false");
  if (noticeTimer !== null) {
    window.clearTimeout(noticeTimer);
  }
  noticeTimer = window.setTimeout(() => {
    notice?.classList.remove("is-visible");
    notice?.setAttribute("aria-hidden", "true");
    noticeTimer = null;
  }, 2400);
}
function showSaveSuccess(message = "\u4FDD\u5B58\u6210\u529F") {
  showNotice(message, false);
}
function showWarningNotice(message) {
  showNotice(message, true);
}
function closeDialogOnEscape(event, close) {
  if (event.key !== "Escape")
    return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
function showPrompt(title, message = "", defaultValue = "") {
  const overlay = document.getElementById("generic-prompt");
  const titleEl = document.getElementById("generic-prompt-title");
  const msgEl = document.getElementById("generic-prompt-message");
  const inputEl = document.getElementById("generic-prompt-input");
  const okBtn = document.getElementById("generic-prompt-ok");
  const cancelBtn = document.getElementById("generic-prompt-cancel");
  titleEl.textContent = title;
  msgEl.textContent = message;
  msgEl.style.display = message ? "" : "none";
  inputEl.style.display = "";
  inputEl.value = defaultValue;
  cancelBtn.style.display = "";
  overlay.style.display = "";
  inputEl.focus();
  inputEl.select();
  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("keydown", onKey);
    };
    const onOk = () => {
      cleanup();
      resolve(inputEl.value);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onKey = (event) => {
      if (event.key === "Enter" && event.target === inputEl) {
        onOk();
        return;
      }
      closeDialogOnEscape(event, onCancel);
    };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("keydown", onKey);
  });
}
function showConfirm(title, message = "") {
  const overlay = document.getElementById("generic-prompt");
  const titleEl = document.getElementById("generic-prompt-title");
  const msgEl = document.getElementById("generic-prompt-message");
  const inputEl = document.getElementById("generic-prompt-input");
  const okBtn = document.getElementById("generic-prompt-ok");
  const cancelBtn = document.getElementById("generic-prompt-cancel");
  titleEl.textContent = title;
  msgEl.textContent = message;
  msgEl.style.display = message ? "" : "none";
  inputEl.style.display = "none";
  cancelBtn.style.display = "";
  overlay.style.display = "";
  okBtn.focus();
  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("keydown", onKey);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onKey = (event) => {
      closeDialogOnEscape(event, onCancel);
    };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("keydown", onKey);
  });
}
function showAlert(title, message = "") {
  const overlay = document.getElementById("generic-prompt");
  const titleEl = document.getElementById("generic-prompt-title");
  const msgEl = document.getElementById("generic-prompt-message");
  const inputEl = document.getElementById("generic-prompt-input");
  const okBtn = document.getElementById("generic-prompt-ok");
  const cancelBtn = document.getElementById("generic-prompt-cancel");
  titleEl.textContent = title;
  msgEl.textContent = message;
  msgEl.style.display = message ? "" : "none";
  inputEl.style.display = "none";
  cancelBtn.style.display = "none";
  overlay.style.display = "";
  okBtn.focus();
  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      overlay.removeEventListener("keydown", onKey);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onKey = (event) => {
      closeDialogOnEscape(event, onOk);
    };
    okBtn.addEventListener("click", onOk);
    overlay.addEventListener("keydown", onKey);
  });
}