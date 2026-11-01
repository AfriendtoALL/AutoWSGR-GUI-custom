"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyTaskLoaderView = void 0;
var LoaderDialog_1 = require_LoaderDialog();
var scrollPosition_1 = require_scrollPosition();
var DailyTaskLoaderView = class {
  constructor() {
    this.actions = null;
    this.overlay = document.getElementById("daily-task-loader");
    this.list = document.getElementById("daily-task-loader-list");
    this.status = document.getElementById("daily-task-loader-status");
    this.addToList = document.getElementById("btn-daily-task-add-list");
    this.addToQueue = document.getElementById("btn-daily-task-add-queue");
    this.modal = new LoaderDialog_1.LoaderDialog(this.overlay);
  }
  bindActions(actions) {
    document.getElementById("btn-close-daily-task-loader")?.addEventListener("click", actions.onClose);
    this.addToList.addEventListener("click", actions.onAddToList);
    this.addToQueue.addEventListener("click", actions.onAddToQueue);
    this.modal.bindDismiss(actions.onClose);
    this.overlay.querySelectorAll("[data-daily-task-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        actions.onTabChange(button.dataset["dailyTaskTab"]);
      });
    });
    this.actions = actions;
  }
  open() {
    this.modal.open();
  }
  close() {
    this.modal.close();
  }
  setStatus(message) {
    this.status.textContent = message;
    this.status.hidden = !message;
  }
  render(plans, activeType, selected) {
    this.overlay.querySelectorAll("[data-daily-task-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset["dailyTaskTab"] === activeType);
    });
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(this.list);
    this.list.innerHTML = "";
    const visible = plans.filter((plan) => plan.taskType === activeType);
    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "daily-task-loader-empty";
      empty.textContent = "\u5F53\u524D\u5206\u7C7B\u6682\u65E0\u53EF\u7528\u65E5\u5E38\u4EFB\u52A1\u3002";
      this.list.appendChild(empty);
    } else {
      visible.forEach((plan) => this.list.appendChild(this.createCard(plan, selected)));
    }
    (0, scrollPosition_1.restoreScrollPosition)(this.list, scrollPosition);
    this.addToList.disabled = selected === null;
    this.addToQueue.disabled = selected === null;
  }
  createCard(plan, selected) {
    const isSelected = selected?.plan.source === plan.source && selected.plan.file === plan.file;
    const card = document.createElement("article");
    card.className = `daily-task-card${isSelected ? " selected" : ""}`;
    card.tabIndex = 0;
    card.addEventListener("click", () => this.actions?.onSelect(plan));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ")
        return;
      event.preventDefault();
      this.actions?.onSelect(plan);
    });
    const heading = document.createElement("div");
    heading.className = "daily-task-card-heading";
    const tag = document.createElement("span");
    tag.className = "daily-task-card-tag";
    tag.textContent = "\u65E5\u5E38\u4EFB\u52A1";
    const source = document.createElement("span");
    source.className = `tg-source daily-task-card-source ${plan.source}`;
    source.textContent = plan.source === "system" ? "\u7CFB\u7EDF\u9884\u8BBE" : "\u7528\u6237\u914D\u7F6E";
    const name = document.createElement("h4");
    name.textContent = plan.name;
    heading.append(tag, name);
    if (plan.taskType === "campaign" || plan.taskType === "decisive") {
      const controls = document.createElement("div");
      controls.className = "daily-task-card-controls";
      controls.addEventListener("click", (event) => event.stopPropagation());
      const timesField = document.createElement("label");
      timesField.className = "daily-task-times";
      const timesLabel = document.createElement("span");
      timesLabel.textContent = "\u6267\u884C\u6B21\u6570";
      const times = document.createElement("input");
      times.className = "input";
      times.type = "number";
      times.min = "1";
      times.max = "9999";
      times.value = String(isSelected ? selected.times : plan.times);
      times.addEventListener("change", () => {
        const value = Math.max(1, Number.parseInt(times.value, 10) || 1);
        times.value = String(value);
        this.actions?.onTimesChange(plan, value);
      });
      timesField.append(timesLabel, times);
      controls.appendChild(timesField);
      if (plan.taskType === "decisive") {
        const quickRepair = document.createElement("label");
        quickRepair.className = "config-switch daily-task-quick-repair";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = isSelected ? selected.useQuickRepair !== false : plan.useQuickRepair !== false;
        input.addEventListener("change", () => {
          this.actions?.onQuickRepairChange(plan, input.checked);
        });
        const track = document.createElement("span");
        track.className = "config-switch-track";
        track.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = "\u4F7F\u7528\u5FEB\u4FEE";
        quickRepair.append(input, track, label);
        controls.appendChild(quickRepair);
      }
      heading.appendChild(controls);
    }
    heading.appendChild(source);
    card.appendChild(heading);
    return card;
  }
};
exports.DailyTaskLoaderView = DailyTaskLoaderView;