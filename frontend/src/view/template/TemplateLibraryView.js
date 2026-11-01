"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateLibraryView = void 0;
var TemplateLibraryView = class {
  constructor() {
    this.container = document.getElementById("template-library-items");
    document.getElementById("btn-create-template")?.addEventListener("click", () => this.onCreate?.());
    document.getElementById("btn-import-template")?.addEventListener("click", () => this.onImport?.());
    this.container?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tpl-action]");
      if (!btn)
        return;
      const id = btn.dataset.tplId;
      const action = btn.dataset.tplAction;
      if (action === "use")
        this.onUse?.(id);
      else if (action === "edit")
        this.onEdit?.(id);
      else if (action === "delete")
        this.onDelete?.(id);
      else if (action === "rename")
        this.onRename?.(id);
    });
  }
  render(items) {
    if (!this.container)
      return;
    if (items.length === 0) {
      this.container.innerHTML = '<p class="tpl-empty">\u6682\u65E0\u6A21\u677F\uFF0C\u70B9\u51FB\u300C\u521B\u5EFA\u6A21\u677F\u300D\u6DFB\u52A0</p>';
      return;
    }
    this.container.innerHTML = items.map((item) => {
      const builtinBadge = item.isBuiltin ? '<span class="tpl-builtin-badge">\u5185\u7F6E</span>' : "";
      const planInfo = item.type === "normal_fight" && item.planCount > 1 ? ` \xB7 ${item.planCount}\u4E2A\u65B9\u6848` : "";
      const descTitle = item.description ? ` title="${this.esc(item.description)}"` : ` title="${this.esc(item.name)}"`;
      const editBtns = item.isBuiltin ? "" : `<button class="btn btn-small" data-tpl-action="edit" data-tpl-id="${item.id}" title="\u7F16\u8F91">\u270E</button>
   <button class="btn btn-small btn-danger" data-tpl-action="delete" data-tpl-id="${item.id}" title="\u5220\u9664">\u2715</button>`;
      return `<div class="tpl-item" data-tpl-id="${item.id}">
  <div class="tpl-item-info"${descTitle}>
    <div class="tpl-item-name">${builtinBadge}${this.esc(item.name)}</div>
    <div class="tpl-item-type">${this.esc(item.typeLabel)}${planInfo}${item.defaultTimes ? ` \xB7 \xD7${item.defaultTimes}` : ""}</div>
  </div>
  <div class="tpl-item-actions">
    <button class="btn btn-small btn-primary" data-tpl-action="use" data-tpl-id="${item.id}" title="\u52A0\u5165\u4EFB\u52A1\u5217\u8868">\u52A0\u5165\u5217\u8868</button>
    ${editBtns}
  </div>
</div>`;
    }).join("");
  }
  esc(s) {
    const d = document.createElement("span");
    d.textContent = s;
    return d.innerHTML;
  }
};
exports.TemplateLibraryView = TemplateLibraryView;