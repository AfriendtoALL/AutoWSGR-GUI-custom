"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showSelector = showSelector;
exports.showMultiSelector = showMultiSelector;
/** 6.2/R18：选项文案来自方案/预设名，必须转义后再拼 HTML。 */
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
function showSelector(title, options, showTimes = false, defaultTimes = 1) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("plan-selector-dialog");
    const titleEl = document.getElementById("plan-selector-title");
    const list = document.getElementById("plan-selector-list");
    const timesRow = document.getElementById("plan-selector-times-row");
    const timesInput = document.getElementById("plan-selector-times");
    const confirmBtn = document.getElementById("btn-plan-selector-confirm");
    confirmBtn.style.display = "none";
    timesRow.style.display = showTimes ? "" : "none";
    if (showTimes)
      timesInput.value = String(defaultTimes);
    titleEl.textContent = title;
    list.innerHTML = options.map((opt, i) => {
      return `<div class="plan-selector-item" data-plan-idx="${i}">
  <span class="plan-icon">${escapeHtml(opt.icon)}</span>
  <span>${escapeHtml(opt.label)}</span>
</div>`;
    }).join("");
    const cleanup = () => {
      overlay.style.display = "none";
      list.removeEventListener("click", onSelect);
      document.getElementById("btn-plan-selector-cancel")?.removeEventListener("click", onCancel);
    };
    const onSelect = (e) => {
      const item = e.target.closest(".plan-selector-item");
      if (!item)
        return;
      const idx = parseInt(item.dataset.planIdx ?? "-1");
      if (idx < 0 || idx >= options.length)
        return;
      const times = showTimes ? parseInt(timesInput.value) || 1 : defaultTimes;
      cleanup();
      resolve({ index: idx, times });
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    list.addEventListener("click", onSelect);
    document.getElementById("btn-plan-selector-cancel")?.addEventListener("click", onCancel);
    overlay.style.display = "flex";
  });
}
function showMultiSelector(title, options) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("plan-selector-dialog");
    const titleEl = document.getElementById("plan-selector-title");
    const list = document.getElementById("plan-selector-list");
    const timesRow = document.getElementById("plan-selector-times-row");
    const confirmBtn = document.getElementById("btn-plan-selector-confirm");
    timesRow.style.display = "none";
    confirmBtn.style.display = "";
    titleEl.textContent = title;
    list.innerHTML = options.map((opt, i) => {
      return `<div class="plan-selector-item" data-plan-idx="${i}" style="cursor:pointer">
  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;width:100%">
    <input type="checkbox" data-preset-idx="${i}" style="flex-shrink:0">
    <div style="flex:1;min-width:0">
      <div style="font-weight:600; margin-bottom:2px">${escapeHtml(opt.icon)} ${escapeHtml(opt.label)}</div>
      ${opt.sublabel ? `<div class="fleet-preset-ships" style="font-size:10px">${opt.sublabel}</div>` : ""}
    </div>
  </label>
</div>`;
    }).join("");
    const updateBtn = () => {
      const checked = list.querySelectorAll('input[type="checkbox"]:checked');
      confirmBtn.textContent = checked.length > 0 ? `\u786E\u8BA4 (${checked.length})` : "\u786E\u8BA4";
      confirmBtn.disabled = checked.length === 0;
    };
    updateBtn();
    const cleanup = () => {
      overlay.style.display = "none";
      confirmBtn.style.display = "none";
      list.removeEventListener("change", onCheckChange);
      confirmBtn.removeEventListener("click", onConfirm);
      document.getElementById("btn-plan-selector-cancel")?.removeEventListener("click", onCancel);
    };
    const onCheckChange = () => updateBtn();
    const onConfirm = () => {
      const checked = list.querySelectorAll('input[type="checkbox"]:checked');
      if (checked.length === 0)
        return;
      const indices = Array.from(checked).map((cb) => parseInt(cb.dataset.presetIdx ?? "-1")).filter((i) => i >= 0);
      cleanup();
      resolve(indices);
    };
    const onCancel = () => {
      cleanup();
      resolve([]);
    };
    list.addEventListener("change", onCheckChange);
    confirmBtn.addEventListener("click", onConfirm);
    document.getElementById("btn-plan-selector-cancel")?.addEventListener("click", onCancel);
    overlay.style.display = "flex";
  });
}