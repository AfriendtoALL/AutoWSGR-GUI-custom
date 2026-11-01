"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipAutocomplete = void 0;
var shipCatalog_1 = require_shipCatalog();
var fleetShipTypes_1 = require_fleetShipTypes();
function escapeHtml(str) {
  const d = document.createElement("span");
  d.textContent = str;
  return d.innerHTML;
}
var ShipAutocomplete = class {
  constructor(container, inputSelector, options) {
    this.container = container;
    this.inputSelector = inputSelector;
    this.dropdown = null;
    this.onInput = (e) => {
      const inp = this.match(e);
      if (inp)
        this.show(inp);
    };
    this.onFocusIn = (e) => {
      const inp = this.match(e);
      if (inp && inp.value.trim())
        this.show(inp);
    };
    this.onFocusOut = (e) => {
      if (this.match(e))
        setTimeout(() => this.hide(), 150);
    };
    this.onKeyDown = (e) => {
      const ke = e;
      const inp = this.match(ke);
      if (!inp || !this.dropdown)
        return;
      const items = this.dropdown.querySelectorAll(".ship-ac-item");
      if (!items.length)
        return;
      const active = this.dropdown.querySelector(".ship-ac-item.active");
      let idx = active ? Array.from(items).indexOf(active) : -1;
      if (ke.key === "ArrowDown") {
        ke.preventDefault();
        active?.classList.remove("active");
        idx = (idx + 1) % items.length;
        items[idx].classList.add("active");
        items[idx].scrollIntoView({ block: "nearest" });
      } else if (ke.key === "ArrowUp") {
        ke.preventDefault();
        active?.classList.remove("active");
        idx = idx <= 0 ? items.length - 1 : idx - 1;
        items[idx].classList.add("active");
        items[idx].scrollIntoView({ block: "nearest" });
      } else if (ke.key === "Enter") {
        ke.preventDefault();
        if (active) {
          inp.value = active.dataset.shipName;
          this.hide();
        }
      } else if (ke.key === "Escape") {
        this.hide();
      }
    };
    this.maxResults = options?.maxResults ?? 20;
    this.container.addEventListener("input", this.onInput);
    this.container.addEventListener("focusin", this.onFocusIn);
    this.container.addEventListener("focusout", this.onFocusOut);
    this.container.addEventListener("keydown", this.onKeyDown);
  }
  // ── 事件委托 ────────────────────────────────
  match(e) {
    const el = e.target;
    return el.matches?.(this.inputSelector) ? el : null;
  }
  // ── 下拉渲染 ────────────────────────────────
  show(inp) {
    const query = inp.value.trim().toLowerCase();
    if (!query) {
      this.hide();
      return;
    }
    const matches = shipCatalog_1.ALL_SHIPS.filter((s) => s.name.toLowerCase().includes(query)).slice(0, this.maxResults);
    if (!matches.length) {
      this.hide();
      return;
    }
    if (matches.length === 1 && matches[0].name === inp.value.trim()) {
      this.hide();
      return;
    }
    this.hide();
    const dd = document.createElement("div");
    dd.className = "ship-autocomplete";
    for (const ship of matches) {
      const item = document.createElement("div");
      item.className = "ship-ac-item";
      item.dataset.shipName = ship.name;
      item.innerHTML = `<span class="ship-ac-name">${this.highlight(ship.name, query)}</span><span class="ship-ac-meta">${escapeHtml(ship.nation)} \xB7 ${escapeHtml((0, fleetShipTypes_1.shipTypeLabel)(ship.ship_type))}</span>`;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        inp.value = ship.name;
        this.hide();
      });
      dd.appendChild(item);
    }
    inp.parentElement.appendChild(dd);
    this.dropdown = dd;
  }
  hide() {
    this.dropdown?.remove();
    this.dropdown = null;
  }
  highlight(name, query) {
    const idx = name.toLowerCase().indexOf(query);
    if (idx < 0)
      return escapeHtml(name);
    return escapeHtml(name.slice(0, idx)) + "<b>" + escapeHtml(name.slice(idx, idx + query.length)) + "</b>" + escapeHtml(name.slice(idx + query.length));
  }
};
exports.ShipAutocomplete = ShipAutocomplete;