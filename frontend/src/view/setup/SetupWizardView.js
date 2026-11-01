"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupWizardView = void 0;
var SetupWizardView = class {
  constructor() {
    this.overlay = document.getElementById("setup-wizard");
    this.emuType = document.getElementById("setup-emu-type");
    this.emuSerial = document.getElementById("setup-emu-serial");
    this.pythonPath = document.getElementById("setup-python-path");
    this.hint = document.getElementById("setup-serial-hint");
    this.confirmBtn = document.getElementById("btn-setup-confirm");
    this.checkAdbBtn = document.getElementById("btn-setup-check-adb");
    this.checkAdbBtn.addEventListener("click", () => this.onCheckAdb?.());
    this.confirmBtn.addEventListener("click", () => this.onConfirm?.());
  }
  show(vo) {
    this.emuType.value = vo.emuType;
    this.emuSerial.value = vo.serial;
    this.pythonPath.value = vo.pythonPath;
    this.hint.textContent = "";
    this.hint.style.color = "";
    this.overlay.style.display = "flex";
  }
  hide() {
    this.overlay.style.display = "none";
  }
  collectValues() {
    return {
      emuType: this.emuType.value,
      serial: this.emuSerial.value.trim(),
      pythonPath: this.pythonPath.value.trim()
    };
  }
  setSerialHint(text, type) {
    this.hint.textContent = text;
    this.hint.style.color = type === "error" ? "var(--danger, #e74c3c)" : "var(--accent)";
  }
  setSerialValue(serial) {
    this.emuSerial.value = serial;
  }
  setCheckAdbLoading(loading) {
    this.checkAdbBtn.textContent = loading ? "\u68C0\u6D4B\u4E2D\u2026" : "\u68C0\u6D4B";
    this.checkAdbBtn.disabled = loading;
  }
  focusSerial() {
    this.emuSerial.focus();
  }
};
exports.SetupWizardView = SetupWizardView;