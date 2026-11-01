"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateWizardView = void 0;
var SelectorDialog_1 = require_SelectorDialog();
var ShipAutocomplete_1 = require_ShipAutocomplete();
var TemplateWizardView = class {
  constructor() {
    this.currentStep = 1;
    this.wizardOverlay = document.getElementById("template-wizard");
    this.wizardTitle = document.getElementById("wizard-title");
    new ShipAutocomplete_1.ShipAutocomplete(document, ".fleet-ship");
    document.getElementById("btn-wizard-prev")?.addEventListener("click", () => this.onPrevious?.());
    document.getElementById("btn-wizard-next")?.addEventListener("click", () => this.onNext?.());
    document.getElementById("btn-wizard-cancel")?.addEventListener("click", () => this.onCancel?.());
    document.querySelectorAll('input[name="tpl-type"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        this.onTypeChange?.(this.getSelectedType());
      });
    });
    document.getElementById("btn-tpl-browse-plan")?.addEventListener("click", () => this.onBrowsePlan?.());
    document.getElementById("btn-tpl-scan-plans")?.addEventListener("click", () => this.onScanPlans?.());
    document.getElementById("tpl-plan-list")?.addEventListener("click", (event) => {
      const button = event.target.closest(".btn-remove-plan");
      if (!button)
        return;
      const index = parseInt(button.dataset.idx ?? "-1", 10);
      if (index >= 0)
        this.onRemovePlan?.(index);
    });
    for (const suffix of ["nf", "ex", "cp"]) {
      const checkbox = document.getElementById(`tpl-fleet-enable-${suffix}`);
      checkbox?.addEventListener("change", () => {
        const grid = document.getElementById(`tpl-fleet-grid-${suffix}`);
        if (grid)
          grid.style.display = checkbox.checked ? "" : "none";
      });
    }
  }
  // ════════════════════════════════════════
  // 向导 生命周期
  // ════════════════════════════════════════
  show(title = "\u521B\u5EFA\u6A21\u677F") {
    this.currentStep = 1;
    document.querySelector('input[name="tpl-type"][value="normal_fight"]').checked = true;
    document.getElementById("tpl-plan-path").value = "";
    document.getElementById("tpl-name").value = "";
    document.getElementById("tpl-default-times").value = "1";
    document.getElementById("tpl-stop-loot").value = "-1";
    document.getElementById("tpl-stop-ship").value = "-1";
    this.renderPlanList([]);
    for (const suffix of ["nf", "ex", "cp"]) {
      const cb = document.getElementById(`tpl-fleet-enable-${suffix}`);
      const grid = document.getElementById(`tpl-fleet-grid-${suffix}`);
      if (cb)
        cb.checked = false;
      if (grid) {
        grid.style.display = "none";
        grid.querySelectorAll(".fleet-ship").forEach((inp) => inp.value = "");
      }
    }
    this.wizardTitle.textContent = title;
    this.setConfigPanel(this.getSelectedType());
    this.updateStepUI();
    this.wizardOverlay.style.display = "flex";
  }
  hide() {
    this.wizardOverlay.style.display = "none";
  }
  setTitle(title) {
    this.wizardTitle.textContent = title;
  }
  // ════════════════════════════════════════
  // 步骤导航 UI  
  // ════════════════════════════════════════
  getStep() {
    return this.currentStep;
  }
  setStep(step) {
    this.currentStep = step;
    this.updateStepUI();
  }
  updateStepUI() {
    const step = this.currentStep;
    for (let i = 1; i <= 3; i++) {
      const page = document.getElementById(`wizard-step-${i}`);
      if (page)
        page.style.display = i === step ? "" : "none";
    }
    document.querySelectorAll(".wizard-step").forEach((el) => {
      const s = parseInt(el.getAttribute("data-step") ?? "0");
      el.classList.toggle("active", s === step);
      el.classList.toggle("done", s < step);
    });
    document.getElementById("btn-wizard-prev").style.display = step > 1 ? "" : "none";
    const nextBtn = document.getElementById("btn-wizard-next");
    nextBtn.textContent = step === 3 ? "\u4FDD\u5B58" : "\u4E0B\u4E00\u6B65";
  }
  // ════════════════════════════════════════
  // 配置面板
  // ════════════════════════════════════════
  /** 根据模板类型显示对应的配置面板 */
  setConfigPanel(type) {
    const panelType = type === "event_fight" ? "normal_fight" : type;
    const panels = ["normal_fight", "exercise", "campaign", "decisive"];
    for (const p of panels) {
      const el = document.getElementById(`wizard-cfg-${p}`);
      if (el)
        el.style.display = p === panelType ? "" : "none";
    }
    // 等级停止条件只对能拿到战后舰队等级的路线生效（演习/决战无 fleet）。
    const levelSupported = type !== "decisive" && type !== "exercise";
    const levelRow = document.getElementById("tpl-stop-level-row");
    const levelHint = document.getElementById("tpl-stop-level-hint");
    if (levelRow)
      levelRow.style.display = levelSupported ? "" : "none";
    if (levelHint)
      levelHint.style.display = levelSupported ? "block" : "none";
  }
  /** 读取当前选中的模板类型 */
  getSelectedType() {
    return document.querySelector('input[name="tpl-type"]:checked')?.value ?? "normal_fight";
  }
  // ════════════════════════════════════════
  // 方案列表
  // ════════════════════════════════════════
  renderPlanList(paths) {
    const container = document.getElementById("tpl-plan-list");
    if (!container)
      return;
    // 6.2/R18：文件名是不可信输入，只用 textContent 渲染，禁止拼进 innerHTML。
    container.replaceChildren();
    if (paths.length === 0) {
      const empty = document.createElement("p");
      empty.style.color = "var(--text-muted)";
      empty.style.fontSize = "12px";
      empty.style.margin = "0";
      empty.textContent = "尚未添加方案文件";
      container.appendChild(empty);
      return;
    }
    paths.forEach((p, i) => {
      const name = p.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? p;
      const entry = document.createElement("div");
      entry.className = "tpl-plan-entry";
      const nameEl = document.createElement("span");
      nameEl.className = "plan-name";
      nameEl.title = p;
      nameEl.textContent = name;
      const removeEl = document.createElement("span");
      removeEl.className = "btn-remove-plan";
      removeEl.dataset.idx = String(i);
      removeEl.title = "移除";
      removeEl.textContent = "\u2715";
      entry.appendChild(nameEl);
      entry.appendChild(removeEl);
      container.appendChild(entry);
    });
  }
  // ════════════════════════════════════════
  // 编队网格
  // ════════════════════════════════════════
  fillFleetGrid(suffix, ships) {
    const cb = document.getElementById(`tpl-fleet-enable-${suffix}`);
    const grid = document.getElementById(`tpl-fleet-grid-${suffix}`);
    if (!cb || !grid)
      return;
    if (ships.some((s) => s)) {
      cb.checked = true;
      grid.style.display = "";
      const inputs = grid.querySelectorAll(".fleet-ship");
      ships.forEach((name, i) => {
        if (inputs[i])
          inputs[i].value = name;
      });
    }
  }
  readFleetGrid(suffix) {
    const cb = document.getElementById(`tpl-fleet-enable-${suffix}`);
    if (!cb?.checked)
      return void 0;
    const grid = document.getElementById(`tpl-fleet-grid-${suffix}`);
    if (!grid)
      return void 0;
    const ships = Array.from(grid.querySelectorAll(".fleet-ship")).map((inp) => inp.value.trim());
    return ships.some((s) => s) ? ships : void 0;
  }
  // ════════════════════════════════════════
  // 预填 (编辑/导入)
  // ════════════════════════════════════════
  prefill(data) {
    if (data.type) {
      const radio = document.querySelector(`input[name="tpl-type"][value="${data.type}"]`);
      if (radio)
        radio.checked = true;
      this.setConfigPanel(data.type);
    }
    switch (data.type) {
      case "normal_fight":
      case "event_fight": {
        if (data.fleet_id)
          document.getElementById("tpl-fleet").value = String(data.fleet_id);
        if (data.fleet?.length)
          this.fillFleetGrid("nf", data.fleet);
        break;
      }
      case "exercise": {
        if (data.fleet_id)
          document.getElementById("tpl-exercise-fleet").value = String(data.fleet_id);
        if (data.fleet?.length)
          this.fillFleetGrid("ex", data.fleet);
        break;
      }
      case "campaign": {
        if (data.campaign_name)
          document.getElementById("tpl-campaign-type").value = data.campaign_name;
        if (data.fleet?.length)
          this.fillFleetGrid("cp", data.fleet);
        break;
      }
      case "decisive": {
        if (data.chapter)
          document.getElementById("tpl-decisive-chapter").value = String(data.chapter);
        if (data.level1?.length)
          document.getElementById("tpl-decisive-level1").value = data.level1.join("\n");
        if (data.level2?.length)
          document.getElementById("tpl-decisive-level2").value = data.level2.join("\n");
        if (data.flagship_priority?.length)
          document.getElementById("tpl-decisive-flagship").value = data.flagship_priority.join("\n");
        document.getElementById("tpl-decisive-quick-repair").checked = data.use_quick_repair !== false;
        break;
      }
    }
    if (data.name)
      document.getElementById("tpl-name").value = data.name;
    if (data.defaultTimes)
      document.getElementById("tpl-default-times").value = String(data.defaultTimes);
    if (data.defaultStopCondition?.loot_count_ge != null && data.defaultStopCondition.loot_count_ge > 0) {
      document.getElementById("tpl-stop-loot").value = String(data.defaultStopCondition.loot_count_ge);
    }
    if (data.defaultStopCondition?.ship_count_ge != null && data.defaultStopCondition.ship_count_ge > 0) {
      document.getElementById("tpl-stop-ship").value = String(data.defaultStopCondition.ship_count_ge);
    }
    if (data.defaultStopCondition?.level_ge != null && data.defaultStopCondition.level_ge > 0) {
      document.getElementById("tpl-stop-level").value = String(data.defaultStopCondition.level_ge);
      document.getElementById("tpl-stop-level-slot").value = String(data.defaultStopCondition.level_slot ?? 0);
    }
  }
  /** 设置向导中的 plan 路径输入框 */
  setPlanPathInput(path) {
    document.getElementById("tpl-plan-path").value = path;
  }
  /** 设置 fleet ID 下拉 */
  setFleetId(id) {
    document.getElementById("tpl-fleet").value = String(id);
  }
  /** 设置模板名称 */
  setName(name) {
    document.getElementById("tpl-name").value = name;
  }
  /** 设置默认次数 */
  setDefaultTimes(times) {
    document.getElementById("tpl-default-times").value = String(times);
  }
  /** 设置停止条件 */
  setStopConditions(loot, ship, level) {
    if (loot != null)
      document.getElementById("tpl-stop-loot").value = String(loot);
    if (ship != null)
      document.getElementById("tpl-stop-ship").value = String(ship);
    if (level != null && level.ge > 0) {
      document.getElementById("tpl-stop-level").value = String(level.ge);
      document.getElementById("tpl-stop-level-slot").value = String(level.slot ?? 0);
    }
  }
  // ════════════════════════════════════════
  // 表单收集
  // ════════════════════════════════════════
  collectForm() {
    const type = this.getSelectedType();
    const name = document.getElementById("tpl-name").value.trim();
    const defaultTimes = parseInt(document.getElementById("tpl-default-times").value) || 1;
    const stopLoot = parseInt(document.getElementById("tpl-stop-loot").value) || 0;
    const stopShip = parseInt(document.getElementById("tpl-stop-ship").value) || 0;
    const stopLevelGe = parseInt(document.getElementById("tpl-stop-level").value) || 0;
    const stopLevelSlot = parseInt(document.getElementById("tpl-stop-level-slot").value) || 0;
    const data = { type, name, defaultTimes, stopLoot, stopShip, stopLevelGe, stopLevelSlot };
    switch (type) {
      case "normal_fight":
      case "event_fight":
        data.planPath = document.getElementById("tpl-plan-path").value;
        data.fleetId = parseInt(document.getElementById("tpl-fleet").value);
        data.fleetNf = this.readFleetGrid("nf");
        break;
      case "exercise":
        data.exerciseFleetId = parseInt(document.getElementById("tpl-exercise-fleet").value);
        data.fleetEx = this.readFleetGrid("ex");
        break;
      case "campaign":
        data.campaignName = document.getElementById("tpl-campaign-type").value;
        data.fleetCp = this.readFleetGrid("cp");
        break;
      case "decisive":
        data.chapter = parseInt(document.getElementById("tpl-decisive-chapter").value);
        data.level1 = this.parseLines("tpl-decisive-level1");
        data.level2 = this.parseLines("tpl-decisive-level2");
        data.flagshipPriority = this.parseLines("tpl-decisive-flagship");
        data.useQuickRepair = document.getElementById("tpl-decisive-quick-repair").checked;
        break;
    }
    return data;
  }
  /** 聚焦名称输入框 */
  focusName() {
    document.getElementById("tpl-name").focus();
  }
  parseLines(id) {
    return document.getElementById(id).value.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  // ════════════════════════════════════════
  // 通用选择器弹窗
  // ════════════════════════════════════════
  /** 单选选择器：委托到独立模块 */
  showSelector(title, options, showTimes = false, defaultTimes = 1) {
    return (0, SelectorDialog_1.showSelector)(title, options, showTimes, defaultTimes);
  }
  /** 多选选择器：委托到独立模块 */
  showMultiSelector(title, options) {
    return (0, SelectorDialog_1.showMultiSelector)(title, options);
  }
};
exports.TemplateWizardView = TemplateWizardView;