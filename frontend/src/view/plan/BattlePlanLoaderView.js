"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattlePlanLoaderView = void 0;
var lootPlans_js_1 = require_lootPlans();
var normalFightQuota_js_1 = require_normalFightQuota();
var LoaderDialog_1 = require_LoaderDialog();
var scrollPosition_1 = require_scrollPosition();
var TeamPlanListUi_1 = require_TeamPlanListUi();
var BattlePlanLoaderView = class {
  constructor() {
    this.dialogElement = document.getElementById("battle-plan-loader");
    this.dialog = new LoaderDialog_1.LoaderDialog(this.dialogElement);
    this.callbacks = null;
  }
  bindActions(callbacks) {
    this.callbacks = callbacks;
    document.getElementById("btn-cancel-battle-plan-loader")?.addEventListener("click", () => callbacks.onCancel());
    document.getElementById("btn-import-local-battle-plan")?.addEventListener("click", () => callbacks.onImportLocal());
    document.getElementById("btn-refresh-battle-plan-loader")?.addEventListener("click", () => callbacks.onRefresh());
    document.getElementById("battle-plan-loader-search")?.addEventListener("input", () => callbacks.onFiltersChange());
    document.getElementById("battle-plan-loader-filter-system")?.addEventListener("change", () => callbacks.onFiltersChange());
    document.getElementById("battle-plan-loader-sort-asc")?.addEventListener("change", () => callbacks.onFiltersChange());
    document.querySelectorAll("[data-battle-plan-sort-field]").forEach((button) => {
      button.addEventListener("click", () => {
        callbacks.onSortFieldChange(button.dataset["battlePlanSortField"] === "name" ? "name" : "modifiedAt");
      });
    });
    document.getElementById("battle-plan-loader-list")?.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-loot-plan-add]");
      if (addButton) {
        const file2 = addButton.dataset["lootPlanFile"];
        const source2 = addButton.dataset["lootPlanSource"];
        if (file2 && (source2 === "system" || source2 === "user")) {
          callbacks.onAddLootPlan(file2, source2);
        }
        return;
      }
      const button = event.target.closest("[data-battle-plan-file]");
      const file = button?.dataset["battlePlanFile"];
      const source = button?.dataset["battlePlanSource"];
      if (file && (source === "system" || source === "user")) {
        callbacks.onSelectPlan(file, source);
      }
    });
    document.getElementById("battle-plan-loader-preview-body")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-loot-plan-delete]");
      const file = button?.dataset["lootPlanFile"];
      const source = button?.dataset["lootPlanSource"];
      if (file && (source === "system" || source === "user")) {
        callbacks.onDeleteLootPlan(source, file);
      }
    });
    document.getElementById("btn-confirm-battle-plan-loader")?.addEventListener("click", () => callbacks.onConfirm());
    this.dialog.bindDismiss(callbacks.onCancel);
  }
  open() {
    this.dialog.open();
  }
  close() {
    this.dialog.close();
  }
  resetSearch() {
    const searchInput = document.getElementById("battle-plan-loader-search");
    if (searchInput)
      searchInput.value = "";
  }
  focusSearch() {
    const searchInput = document.getElementById("battle-plan-loader-search");
    searchInput?.focus();
  }
  getFilters() {
    const searchInput = document.getElementById("battle-plan-loader-search");
    const filterSystem = document.getElementById("battle-plan-loader-filter-system");
    const sortAsc = document.getElementById("battle-plan-loader-sort-asc");
    return {
      keyword: (searchInput?.value ?? "").trim().toLocaleLowerCase("zh-CN"),
      excludeSystem: filterSystem?.checked ?? false,
      ascending: sortAsc?.checked ?? false
    };
  }
  setSortField(field) {
    document.querySelectorAll("[data-battle-plan-sort-field]").forEach((item) => {
      item.classList.toggle("active", item.dataset["battlePlanSortField"] === field);
    });
  }
  setPurposeCopy(purpose) {
    const pickingForQueue = purpose === "queue";
    const pickingForTaskList = purpose === "task-list";
    const pickingForAutomation = purpose === "automation";
    const pickingForLootAutomation = purpose === "loot-automation";
    const title = document.getElementById("battle-plan-loader-title");
    const description = document.getElementById("battle-plan-loader-description");
    const confirm = document.getElementById("btn-confirm-battle-plan-loader");
    if (title) {
      title.textContent = pickingForQueue ? "\u52A0\u8F7D\u8BA1\u5212\u5230\u4EFB\u52A1\u961F\u5217" : pickingForTaskList ? "\u6DFB\u52A0\u8BA1\u5212\u5230\u4EFB\u52A1\u5217\u8868" : pickingForAutomation ? "\u52A0\u8F7D\u81EA\u52A8\u51FA\u5F81\u8BA1\u5212" : pickingForLootAutomation ? "\u52A0\u8F7D\u81EA\u52A8\u80D6\u6B21\u8BA1\u5212" : "\u52A0\u8F7D\u51FA\u5F81\u914D\u7F6E";
    }
    if (description) {
      description.textContent = pickingForQueue ? "\u9009\u62E9\u52A0\u5165\u4EFB\u52A1\u961F\u5217\u7684\u4F5C\u6218\u8BA1\u5212\uFF1B\u8BA1\u5212\u5305\u542B\u7F16\u961F\u65F6\u9700\u9009\u62E9\u672C\u6B21\u4F7F\u7528\u7684\u7F16\u961F\u3002" : pickingForTaskList ? "\u9009\u62E9\u4F5C\u6218\u8BA1\u5212\uFF1B\u8BA1\u5212\u5305\u542B\u7F16\u961F\u65F6\u9700\u9009\u62E9\u672C\u6B21\u4F7F\u7528\u7684\u7F16\u961F\u3002" : pickingForAutomation ? "\u9009\u62E9\u81EA\u52A8\u51FA\u5F81\u4F7F\u7528\u7684\u4F5C\u6218\u8BA1\u5212\u548C\u961F\u4F0D\u3002" : pickingForLootAutomation ? "\u5C06\u7CFB\u7EDF\u6216\u7528\u6237\u51FA\u5F81\u8BA1\u5212\u52A0\u5165\u81EA\u52A8\u80D6\u6B21\u4E0B\u62C9\u5217\u8868\u3002" : "\u8BFB\u53D6\u7CFB\u7EDF\u4E0E\u7528\u6237\u4F5C\u6218\u8BA1\u5212\u76EE\u5F55\u4E2D\u7684\u5408\u6CD5 YAML \u914D\u7F6E\u3002";
    }
    if (confirm) {
      confirm.textContent = pickingForQueue ? "\u52A0\u5165\u961F\u5217" : pickingForTaskList ? "\u6DFB\u52A0\u5230\u5217\u8868" : pickingForLootAutomation ? "\u786E\u8BA4" : "\u52A0\u8F7D";
    }
  }
  setStatus(message) {
    const status = document.getElementById("battle-plan-loader-status");
    if (!status)
      return;
    status.textContent = message;
    status.hidden = !message;
  }
  setCount(count) {
    const element = document.getElementById("battle-plan-loader-count");
    if (element)
      element.textContent = `\u5171\u8BFB\u53D6 ${count} \u4E2A\u4F5C\u6218\u914D\u7F6E`;
  }
  setImportLoading(loading) {
    const button = document.getElementById("btn-import-local-battle-plan");
    if (button)
      button.disabled = loading;
  }
  render(vo) {
    const list = document.getElementById("battle-plan-loader-list");
    if (!list)
      return;
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(list);
    list.replaceChildren();
    if (vo.plans.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fleet-team-loader-preview-empty";
      empty.textContent = vo.totalPlanCount === 0 ? "\u672A\u8BFB\u53D6\u5230\u5408\u6CD5\u7684\u4F5C\u6218\u914D\u7F6E" : "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u6761\u4EF6\u7684\u4F5C\u6218\u914D\u7F6E";
      list.append(empty);
      this.clearSelection(vo.purpose, vo.lootPlans, vo.confirmEnabled);
      (0, scrollPosition_1.restoreScrollPosition)(list, scrollPosition);
      return;
    }
    const lootPlanKeys = new Set(vo.lootPlans.map((plan) => (0, lootPlans_js_1.lootAutomationPlanKey)(plan)));
    vo.plans.forEach((plan) => {
      const card = document.createElement(vo.purpose === "loot-automation" ? "div" : "button");
      if (card instanceof HTMLButtonElement)
        card.type = "button";
      card.className = "fleet-team-loader-item battle-plan-loader-item";
      card.dataset["battlePlanFile"] = plan.file;
      card.dataset["battlePlanSource"] = plan.source;
      card.classList.toggle("active", this.sameBattlePlan(plan, vo.selectedPlan));
      if (vo.purpose === "loot-automation") {
        card.classList.add("loot-automation-plan-card");
      }
      const heading = document.createElement("div");
      heading.className = "fleet-team-loader-item-heading";
      const name = document.createElement("strong");
      name.textContent = plan.name;
      const badge = document.createElement("span");
      badge.className = `fleet-team-source-badge ${plan.source}`;
      badge.textContent = plan.source === "system" ? "\u7CFB\u7EDF\u9884\u8BBE" : "\u7528\u6237\u9884\u8BBE";
      heading.append(name, badge);
      const fileName = document.createElement("span");
      fileName.className = "battle-plan-loader-item-file";
      fileName.textContent = plan.file;
      fileName.title = plan.file;
      const meta = document.createElement("span");
      meta.className = "battle-plan-loader-item-meta";
      meta.textContent = plan.kind === "preset" ? `${this.taskPresetTypeLabel(plan)} \xB7 \u4EFB\u52A1\u9884\u8BBE` : plan.modifiedAt > 0 ? `${this.battlePlanMapLabel(plan)} \xB7 ${plan.fleetCount} \u652F\u5173\u8054\u7F16\u961F` : `${plan.fleetCount} \u652F\u5173\u8054\u7F16\u961F \xB7 \u91CD\u542F\u540E\u663E\u793A\u5B8C\u6574\u6458\u8981`;
      card.append(heading, fileName, meta);
      if (vo.purpose === "loot-automation") {
        const addButton = document.createElement("button");
        const added = lootPlanKeys.has((0, lootPlans_js_1.lootAutomationPlanKey)(plan));
        addButton.type = "button";
        addButton.className = "btn btn-small btn-primary loot-plan-add-button";
        addButton.dataset["lootPlanAdd"] = "true";
        addButton.dataset["lootPlanFile"] = plan.file;
        addButton.dataset["lootPlanSource"] = plan.source;
        addButton.textContent = added ? "\u5DF2\u52A0\u5165" : "\u52A0\u5165\u5217\u8868";
        addButton.disabled = added;
        card.append(addButton);
      }
      list.append(card);
    });
    if (vo.selectedPlan) {
      this.renderPreview(vo.selectedPlan, vo.selectedFleetIndex, vo.purpose, vo.lootPlans, vo.automationDailyMax, vo.fleetSelectionEnabled, vo.confirmEnabled);
    }
    (0, scrollPosition_1.restoreScrollPosition)(list, scrollPosition);
  }
  renderPreview(plan, selectedFleetIndex, purpose, lootPlans, automationDailyMax, fleetSelectionEnabled, confirmEnabled) {
    const title = document.getElementById("battle-plan-loader-preview-title");
    const badge = document.getElementById("battle-plan-loader-preview-source");
    const body = document.getElementById("battle-plan-loader-preview-body");
    const confirmButton = document.getElementById("btn-confirm-battle-plan-loader");
    if (title)
      title.textContent = `\u914D\u7F6E\u9884\u89C8\uFF1A${plan.name}`;
    if (badge) {
      badge.hidden = false;
      badge.className = `fleet-team-source-badge ${plan.source}`;
      badge.textContent = plan.source === "system" ? "\u7CFB\u7EDF\u9884\u8BBE" : "\u7528\u6237\u9884\u8BBE";
    }
    if (body) {
      const hasDetails = plan.modifiedAt > 0;
      if (plan.kind === "preset") {
        body.replaceChildren(this.createPreviewField("\u4EFB\u52A1\u7C7B\u578B", this.taskPresetTypeLabel(plan)), this.createPreviewField("\u6267\u884C\u6B21\u6570", `${plan.times} \u6B21`), this.createPreviewField("\u4EFB\u52A1\u53C2\u6570", this.taskPresetParameterLabel(plan), true), this.createPreviewField("\u5B8C\u6574\u914D\u7F6E", "\u52A0\u8F7D\u540E\u53EF\u5728\u4EFB\u52A1\u9884\u8BBE\u9875\u9762\u67E5\u770B", true));
      } else {
        const children = [
          this.createPreviewField("\u7AE0\u8282\u5173\u5361", this.battlePlanMapLabel(plan)),
          purpose === "automation" ? this.createAutomationDailyMaxField(automationDailyMax) : this.createPreviewField("\u6267\u884C\u6B21\u6570", hasDetails ? `${plan.times} \u6B21` : "\u91CD\u542F\u540E\u663E\u793A"),
          this.createPreviewField("维修方案", hasDetails ? this.battlePlanRepairLabel(plan.repairMode) : "重启后显示"),
          this.createPreviewField("\u7EC8\u70B9\u6218\u679C\u5224\u65AD", hasDetails ? this.battlePlanResultLabel(plan.result) : "\u91CD\u542F\u540E\u663E\u793A"),
          this.createFleetPreview(plan, hasDetails, selectedFleetIndex, fleetSelectionEnabled)
        ];
        if (purpose === "loot-automation") {
          children.push(this.createLootPlanListPreview(plan.name, lootPlans));
        } else {
          children.push(this.createStopPreview(plan, hasDetails));
        }
        body.replaceChildren(...children);
      }
    }
    if (confirmButton) {
      confirmButton.disabled = !confirmEnabled;
    }
  }
  createLootPlanListPreview(selectedName, plans) {
    const section = document.createElement("section");
    section.className = "battle-plan-preview-section wide loot-plan-list-preview";
    const heading = document.createElement("div");
    heading.className = "battle-plan-preview-heading loot-plan-list-preview-heading";
    const title = document.createElement("h3");
    title.textContent = `\u5217\u8868\u9884\u89C8\uFF1A${selectedName}`;
    const note = document.createElement("span");
    note.textContent = "\u8BBE\u7F6E\u81EA\u52A8\u80D6\u6B21\u7684\u4E0B\u62C9\u5217\u8868";
    heading.append(title, note);
    const list = document.createElement("div");
    list.className = "loot-plan-list-preview-cards";
    if (plans.length === 0) {
      const empty = document.createElement("div");
      empty.className = "battle-plan-preview-empty";
      empty.textContent = "\u5217\u8868\u4E3A\u7A7A\uFF0C\u8BF7\u4ECE\u5DE6\u4FA7\u52A0\u5165\u8BA1\u5212";
      list.append(empty);
    } else {
      plans.forEach((plan) => {
        const card = document.createElement("div");
        card.className = "loot-plan-list-preview-card";
        const name = document.createElement("strong");
        name.textContent = plan.name;
        name.title = plan.name;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-small loot-plan-delete-button";
        remove.dataset["lootPlanDelete"] = "true";
        remove.dataset["lootPlanFile"] = plan.file;
        remove.dataset["lootPlanSource"] = plan.source;
        remove.textContent = "\u5220\u9664";
        card.append(name, remove);
        list.append(card);
      });
    }
    section.append(heading, list);
    return section;
  }
  createPreviewField(label, value, wide = false) {
    const field = document.createElement("div");
    field.className = `battle-plan-preview-field${wide ? " wide" : ""}`;
    const caption = document.createElement("span");
    caption.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    content.title = value;
    field.append(caption, content);
    return field;
  }
  createAutomationDailyMaxField(value) {
    const field = document.createElement("label");
    field.className = "battle-plan-preview-field automation-daily-max-field";
    const caption = document.createElement("span");
    caption.textContent = "\u6BCF\u65E5\u6700\u5927\u6267\u884C\u6B21\u6570";
    const editor = document.createElement("span");
    editor.className = "automation-daily-max-editor";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "input";
    input.min = "1";
    input.max = String(normalFightQuota_js_1.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS);
    input.step = "1";
    input.value = String(value);
    input.addEventListener("input", () => {
      if (input.valueAsNumber >= 1 && input.valueAsNumber <= normalFightQuota_js_1.MAX_NORMAL_FIGHT_DAILY_EXECUTIONS) {
        this.callbacks?.onAutomationDailyMaxChange(input.valueAsNumber);
      }
    });
    input.addEventListener("change", () => {
      const normalized = this.callbacks?.onAutomationDailyMaxChange(input.valueAsNumber) ?? value;
      input.value = String(normalized);
    });
    const unit = document.createElement("strong");
    unit.textContent = "\u6B21";
    editor.append(input, unit);
    field.append(caption, editor);
    return field;
  }
  createFleetPreview(plan, hasDetails, selectedFleetIndex, fleetSelectionEnabled) {
    const section = document.createElement("section");
    section.className = "battle-plan-preview-section wide";
    const heading = document.createElement("div");
    heading.className = "battle-plan-preview-section-heading";
    const title = document.createElement("span");
    title.textContent = "\u4F7F\u7528\u8230\u961F";
    const fleetId = document.createElement("strong");
    fleetId.textContent = hasDetails ? `\u8230\u961F\u7F16\u53F7\uFF1A\u7B2C ${plan.fleetId} \u8230\u961F` : "\u8230\u961F\u7F16\u53F7\uFF1A\u91CD\u542F\u540E\u663E\u793A";
    heading.append(title, fleetId);
    const list = document.createElement("div");
    list.className = "battle-plan-preview-fleet-list";
    if (plan.fleets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "battle-plan-preview-empty";
      empty.textContent = fleetSelectionEnabled ? "\u672A\u914D\u7F6E\u7F16\u961F\u9884\u8BBE\uFF0C\u5C06\u4F7F\u7528 YAML \u7684\u8230\u961F\u7F16\u53F7\u548C\u6E38\u620F\u5F53\u524D\u7F16\u6210" : "\u672A\u914D\u7F6E\u7F16\u961F\u9884\u8BBE";
      list.append(empty);
    } else {
      const selectable = fleetSelectionEnabled;
      plan.fleets.forEach((fleet, index) => {
        const card = document.createElement(selectable ? "button" : "div");
        if (card instanceof HTMLButtonElement)
          card.type = "button";
        card.className = "fleet-team-loader-item battle-plan-preview-fleet-card";
        card.classList.toggle("selectable", selectable);
        card.classList.toggle("active", selectable && selectedFleetIndex === index);
        (0, TeamPlanListUi_1.appendTeamPlanCardContent)(card, {
          name: fleet.name,
          source: fleet.source,
          primaryCount: fleet.primaryCount,
          backupCount: fleet.backupCount
        });
        if (selectable) {
          const state = document.createElement("span");
          state.className = "battle-plan-fleet-selection-state";
          state.textContent = selectedFleetIndex === index ? "\u5DF2\u9009\u62E9" : "\u70B9\u51FB\u9009\u62E9";
          card.append(state);
          card.setAttribute("aria-pressed", String(selectedFleetIndex === index));
          card.addEventListener("click", () => this.callbacks?.onSelectFleet(index));
        }
        list.append(card);
      });
    }
    section.append(heading, list);
    return section;
  }
  createStopPreview(plan, hasDetails) {
    const field = document.createElement("section");
    field.className = "battle-plan-preview-section wide";
    const heading = document.createElement("div");
    heading.className = "battle-plan-preview-section-heading";
    const title = document.createElement("span");
    title.textContent = "\u505C\u6B62\u68C0\u6D4B";
    heading.append(title);
    const values = document.createElement("div");
    values.className = "battle-plan-preview-stop-values";
    const loot = document.createElement("div");
    const lootLabel = document.createElement("span");
    lootLabel.textContent = "\u6218\u5229\u54C1\u68C0\u6D4B";
    const lootValue = document.createElement("strong");
    lootValue.textContent = hasDetails ? this.stopCountLabel(plan.lootCountGe) : "\u91CD\u542F\u540E\u663E\u793A";
    loot.append(lootLabel, lootValue);
    const ship = document.createElement("div");
    const shipLabel = document.createElement("span");
    shipLabel.textContent = "\u6389\u843D\u68C0\u6D4B";
    const shipValue = document.createElement("strong");
    shipValue.textContent = hasDetails ? this.stopCountLabel(plan.shipCountGe) : "\u91CD\u542F\u540E\u663E\u793A";
    ship.append(shipLabel, shipValue);
    values.append(loot, ship);
    field.append(heading, values);
    return field;
  }
  stopCountLabel(value) {
    return value >= 0 ? String(value) : "\u672A\u5F00\u542F";
  }
  clearSelection(purpose, lootPlans, confirmEnabled) {
    const title = document.getElementById("battle-plan-loader-preview-title");
    const badge = document.getElementById("battle-plan-loader-preview-source");
    const body = document.getElementById("battle-plan-loader-preview-body");
    const confirmButton = document.getElementById("btn-confirm-battle-plan-loader");
    if (title)
      title.textContent = "\u914D\u7F6E\u9884\u89C8\uFF1A\u672A\u9009\u62E9";
    if (badge)
      badge.hidden = true;
    if (body) {
      if (purpose === "loot-automation") {
        body.replaceChildren(this.createLootPlanListPreview("\u672A\u9009\u62E9", lootPlans));
      } else {
        const empty = document.createElement("div");
        empty.className = "fleet-team-loader-preview-empty";
        empty.textContent = "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u4E00\u4E2A\u51FA\u5F81\u914D\u7F6E\u67E5\u770B\u6458\u8981";
        body.replaceChildren(empty);
      }
    }
    if (confirmButton) {
      confirmButton.disabled = !confirmEnabled;
    }
  }
  sameBattlePlan(left, right) {
    return Boolean(left && right && left.file === right.file && left.source === right.source);
  }
  battlePlanMapLabel(plan) {
    if (plan.kind === "preset")
      return this.taskPresetTypeLabel(plan);
    const chapter = String(plan.chapter).trim();
    const map = String(plan.map);
    if (chapter === "?" || map === "?")
      return "\u91CD\u542F\u540E\u663E\u793A";
    const normalizedChapter = chapter.toLocaleUpperCase("en-US");
    const normalizedMap = map.toLocaleUpperCase("en-US");
    if (normalizedChapter === "E" || normalizedChapter === "H") {
      return `${normalizedChapter}${normalizedMap}`;
    }
    if (normalizedChapter === "EX")
      return `EX-${normalizedMap}`;
    return `${chapter}-${map}`;
  }
  taskPresetTypeLabel(plan) {
    const labels = {
      normal_fight: "\u666E\u901A\u51FA\u51FB",
      event_fight: "\u6D3B\u52A8\u51FA\u51FB",
      campaign: "\u6218\u5F79",
      exercise: "\u6F14\u4E60",
      decisive: "\u51B3\u6218"
    };
    return labels[plan.taskType ?? ""] ?? plan.taskType ?? "\u4EFB\u52A1\u9884\u8BBE";
  }
  taskPresetParameterLabel(plan) {
    if (plan.taskType === "campaign") {
      return plan.campaignName || "\u672A\u6307\u5B9A\u6218\u5F79";
    }
    if (plan.taskType === "exercise") {
      return `\u7B2C ${plan.fleetId} \u8230\u961F`;
    }
    if (plan.taskType === "decisive") {
      return `\u7B2C ${plan.chapter} \u7AE0`;
    }
    return "\u5F15\u7528\u53D7\u7BA1\u51FA\u5F81\u8BA1\u5212";
  }
  battlePlanRepairLabel(repairMode) {
    const label = (value) => {
      if (value === 1)
        return "\u4E2D\u7834\u5C31\u4FEE";
      if (value === 2)
        return "\u5927\u7834\u624D\u4FEE";
      return String(value);
    };
    return Array.isArray(repairMode) ? `\u6309\u8230\u4F4D\uFF1A${repairMode.map(label).join(" / ")}` : label(repairMode);
  }
  battlePlanResultLabel(result) {
    if (!result)
      return "\u4E0D\u5224\u65AD";
    return result === "SS" ? result : `${result}\u53CA\u4EE5\u4E0A`;
  }
};
exports.BattlePlanLoaderView = BattlePlanLoaderView;