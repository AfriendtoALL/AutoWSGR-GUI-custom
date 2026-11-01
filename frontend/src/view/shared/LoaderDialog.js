"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoaderDialog = void 0;
var LoaderDialog = class {
  constructor(overlay) {
    this.overlay = overlay;
    this.dismissBound = false;
  }
  open() {
    this.overlay.style.display = "flex";
  }
  close() {
    this.overlay.style.display = "none";
  }
  isOpen() {
    return window.getComputedStyle(this.overlay).display !== "none";
  }
  /** 关闭回调属于业务层，共用层只判断何时应当触发。 */
  bindDismiss(onDismiss) {
    if (this.dismissBound)
      return;
    this.dismissBound = true;
    this.overlay.addEventListener("click", (event) => {
      if (event.target === this.overlay)
        onDismiss();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.isOpen() || !this.isTopmostModal()) {
        return;
      }
      event.preventDefault();
      onDismiss();
    });
  }
  isTopmostModal() {
    const visibleModals = Array.from(document.querySelectorAll(".modal-overlay")).filter((element) => window.getComputedStyle(element).display !== "none");
    const topmostModal = visibleModals.reduce((topmost, element) => {
      if (!topmost)
        return element;
      const topmostZIndex = this.readZIndex(topmost);
      const elementZIndex = this.readZIndex(element);
      return elementZIndex >= topmostZIndex ? element : topmost;
    }, null);
    return topmostModal === this.overlay;
  }
  readZIndex(element) {
    const zIndex = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
    return Number.isNaN(zIndex) ? 0 : zIndex;
  }
};
exports.LoaderDialog = LoaderDialog;