"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAnimatedSelects = initAnimatedSelects;
var AnimatedSelectController = class {
  constructor() {
    this.activeSelect = null;
    this.optionElements = [];
    this.activeIndex = -1;
    this.closeTimer = null;
    this.handleMouseDown = (event) => {
      const target = event.target;
      if (this.panel.contains(target)) {
        if (target instanceof HTMLElement && target.closest(".animated-select-option")) {
          event.preventDefault();
        }
        return;
      }
      if (this.isSupportedSelect(target)) {
        if (target.matches(":disabled"))
          return;
        event.preventDefault();
        target.focus({ preventScroll: true });
        if (this.activeSelect === target && !this.panel.hidden) {
          this.close();
        } else {
          this.open(target);
        }
        return;
      }
      this.close();
    };
    this.handleClick = (event) => {
      if (this.isSupportedSelect(event.target)) {
        event.preventDefault();
      }
    };
    this.handleKeyDown = (event) => {
      if (!this.isSupportedSelect(event.target))
        return;
      const select = event.target;
      const isOpen = this.activeSelect === select && !this.panel.hidden;
      if (!isOpen) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          this.open(select);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveActive(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveActive(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        this.moveToBoundary(1);
      } else if (event.key === "End") {
        event.preventDefault();
        this.moveToBoundary(-1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.commitActive();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      } else if (event.key === "Tab") {
        this.close();
      }
    };
    this.handlePanelMouseMove = (event) => {
      const item = event.target.closest(".animated-select-option");
      if (!item || item.classList.contains("is-disabled"))
        return;
      const index = Number(item.dataset["optionIndex"]);
      if (Number.isInteger(index))
        this.setActiveIndex(index);
    };
    this.handlePanelClick = (event) => {
      const item = event.target.closest(".animated-select-option");
      if (!item || item.classList.contains("is-disabled"))
        return;
      const index = Number(item.dataset["optionIndex"]);
      if (!Number.isInteger(index))
        return;
      this.setActiveIndex(index);
      this.commitActive();
    };
    this.handleResize = () => {
      if (this.activeSelect)
        this.positionPanel(this.activeSelect);
    };
    this.handleScroll = (event) => {
      if (this.panel.contains(event.target))
        return;
      this.close();
    };
    this.panel = document.createElement("div");
    this.panel.id = "animated-select-listbox";
    this.panel.className = "animated-select-popover";
    this.panel.setAttribute("role", "listbox");
    this.panel.hidden = true;
    document.body.appendChild(this.panel);
    this.enhanceNode(document);
    this.observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => this.enhanceNode(node));
      });
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    document.addEventListener("mousedown", this.handleMouseDown, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("scroll", this.handleScroll, true);
    this.panel.addEventListener("mousemove", this.handlePanelMouseMove);
    this.panel.addEventListener("click", this.handlePanelClick);
  }
  enhanceNode(node) {
    if (node instanceof HTMLSelectElement) {
      this.enhanceSelect(node);
    }
    if (node instanceof Document || node instanceof HTMLElement) {
      node.querySelectorAll("select").forEach((select) => this.enhanceSelect(select));
    }
  }
  enhanceSelect(select) {
    if (select.multiple || select.size > 1)
      return;
    select.classList.add("animated-select-source");
    select.setAttribute("aria-haspopup", "listbox");
    select.setAttribute("aria-expanded", "false");
    select.setAttribute("aria-controls", this.panel.id);
  }
  isSupportedSelect(target) {
    return target instanceof HTMLSelectElement && target.classList.contains("animated-select-source") && !target.multiple && target.size <= 1;
  }
  open(select) {
    this.cancelClose();
    this.activeSelect?.classList.remove("is-select-open");
    this.activeSelect?.setAttribute("aria-expanded", "false");
    this.activeSelect = select;
    select.classList.add("is-select-open");
    select.setAttribute("aria-expanded", "true");
    this.renderOptions(select);
    this.positionPanel(select);
    this.panel.hidden = false;
    this.panel.classList.remove("is-open");
    requestAnimationFrame(() => {
      if (this.activeSelect !== select)
        return;
      this.panel.classList.add("is-open");
      this.scrollActiveIntoView();
    });
  }
  close() {
    if (!this.activeSelect && this.panel.hidden)
      return;
    this.activeSelect?.classList.remove("is-select-open");
    this.activeSelect?.setAttribute("aria-expanded", "false");
    this.activeSelect?.removeAttribute("aria-activedescendant");
    this.activeSelect = null;
    this.panel.classList.remove("is-open");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.finishClose();
      return;
    }
    this.cancelClose();
    this.closeTimer = window.setTimeout(() => this.finishClose(), 140);
  }
  finishClose() {
    this.cancelClose();
    if (this.activeSelect)
      return;
    this.panel.hidden = true;
    this.panel.replaceChildren();
    this.optionElements = [];
    this.activeIndex = -1;
  }
  cancelClose() {
    if (this.closeTimer === null)
      return;
    window.clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
  renderOptions(select) {
    this.panel.replaceChildren();
    this.optionElements = Array.from(select.options);
    Array.from(select.children).forEach((child) => {
      if (child instanceof HTMLOptionElement) {
        this.panel.appendChild(this.createOptionItem(child));
        return;
      }
      if (child instanceof HTMLOptGroupElement) {
        const label = document.createElement("div");
        label.className = "animated-select-group";
        label.textContent = child.label;
        this.panel.appendChild(label);
        Array.from(child.children).forEach((option) => {
          if (option instanceof HTMLOptionElement) {
            this.panel.appendChild(this.createOptionItem(option));
          }
        });
      }
    });
    const selectedIndex = select.selectedIndex;
    this.activeIndex = this.isSelectable(selectedIndex) ? selectedIndex : this.findNextSelectable(-1, 1);
    this.updateActiveOption();
  }
  createOptionItem(option) {
    const optionIndex = this.optionElements.indexOf(option);
    const item = document.createElement("div");
    item.id = `animated-select-option-${optionIndex}`;
    item.className = "animated-select-option";
    item.dataset["optionIndex"] = String(optionIndex);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.selected));
    item.textContent = option.label || option.textContent || "";
    if (this.isOptionDisabled(option)) {
      item.classList.add("is-disabled");
      item.setAttribute("aria-disabled", "true");
    }
    if (option.selected)
      item.classList.add("is-selected");
    return item;
  }
  isOptionDisabled(option) {
    return option.disabled || option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled;
  }
  isSelectable(index) {
    const option = this.optionElements[index];
    return Boolean(option && !this.isOptionDisabled(option));
  }
  findNextSelectable(start, direction) {
    const count = this.optionElements.length;
    if (count === 0)
      return -1;
    for (let step = 1; step <= count; step += 1) {
      const index = (start + direction * step + count) % count;
      if (this.isSelectable(index))
        return index;
    }
    return -1;
  }
  moveActive(direction) {
    const next = this.findNextSelectable(this.activeIndex, direction);
    if (next >= 0)
      this.setActiveIndex(next);
  }
  moveToBoundary(direction) {
    const start = direction === 1 ? -1 : this.optionElements.length;
    const next = this.findNextSelectable(start, direction);
    if (next >= 0)
      this.setActiveIndex(next);
  }
  setActiveIndex(index) {
    if (!this.isSelectable(index))
      return;
    this.activeIndex = index;
    this.updateActiveOption();
    this.scrollActiveIntoView();
  }
  updateActiveOption() {
    this.panel.querySelectorAll(".animated-select-option").forEach((item) => {
      item.classList.toggle("is-active", Number(item.dataset["optionIndex"]) === this.activeIndex);
    });
    if (this.activeSelect && this.activeIndex >= 0) {
      this.activeSelect.setAttribute("aria-activedescendant", `animated-select-option-${this.activeIndex}`);
    }
  }
  scrollActiveIntoView() {
    this.panel.querySelector(".animated-select-option.is-active")?.scrollIntoView({ block: "nearest" });
  }
  commitActive() {
    const select = this.activeSelect;
    if (!select || !this.isSelectable(this.activeIndex))
      return;
    const changed = select.selectedIndex !== this.activeIndex;
    select.selectedIndex = this.activeIndex;
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    this.close();
  }
  positionPanel(select) {
    const rect = select.getBoundingClientRect();
    const viewportMargin = 8;
    const gap = 4;
    const matchSourceWidth = select.dataset["animatedSelectWidth"] === "source";
    const panelWidth = Math.min(matchSourceWidth ? rect.width : Math.max(rect.width, 160), window.innerWidth - viewportMargin * 2);
    const availableBelow = window.innerHeight - rect.bottom - gap - viewportMargin;
    const availableAbove = rect.top - gap - viewportMargin;
    const openAbove = availableBelow < 160 && availableAbove > availableBelow;
    const availableHeight = openAbove ? availableAbove : availableBelow;
    const left = Math.min(Math.max(rect.left, viewportMargin), window.innerWidth - viewportMargin - panelWidth);
    this.panel.classList.toggle("is-above", openAbove);
    this.panel.style.left = `${left}px`;
    this.panel.style.width = `${panelWidth}px`;
    this.panel.style.maxHeight = `${Math.max(48, Math.min(280, availableHeight))}px`;
    if (openAbove) {
      this.panel.style.top = "auto";
      this.panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      this.panel.style.top = `${rect.bottom + gap}px`;
      this.panel.style.bottom = "auto";
    }
  }
};
var controller = null;
function initAnimatedSelects() {
  controller ?? (controller = new AnimatedSelectController());
}