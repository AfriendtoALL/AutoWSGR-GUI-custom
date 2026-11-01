"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeEditorView = void 0;
var MapView_1 = require_MapView();
var NodeEditorView = class {
  constructor() {
    this.currentNodeId = null;
    this.currentNodeIsTerminal = false;
    this.disabledDrafts = /* @__PURE__ */ new Map();
    this.resizeAnimation = null;
    this.editorEl = document.getElementById("node-editor");
    this.editorIdEl = document.getElementById("node-editor-id");
    this.placeholderEl = document.getElementById("node-editor-placeholder");
    this.drawerEl = document.getElementById("plan-node-info-drawer");
    this.enabledInput = document.getElementById("node-edit-enabled");
    this.enabledInput.addEventListener("change", () => {
      if (!this.enabledInput.checked) {
        this.rememberDisabledDraft();
      }
      this.updateEnabledVisibility(true);
    });
    document.getElementById("node-edit-endpoint").addEventListener("change", () => this.updateEndpointControls());
    document.getElementById("btn-node-editor-close")?.addEventListener("click", () => this.onClose?.());
    document.getElementById("btn-node-edit-save")?.addEventListener("click", () => this.onSave?.());
  }
  show(nodeId, nodeType, args, mapNight = false) {
    this.cancelResizeAnimation();
    this.rememberDisabledDraft();
    this.currentNodeId = nodeId;
    this.currentNodeIsTerminal = args.isTerminal;
    const isCombatNode = !MapView_1.NON_COMBAT_TYPES.has(nodeType);
    const draft = this.disabledDrafts.get(nodeId);
    const isNightBattle = mapNight && nodeType === "Normal";
    const icon = isNightBattle ? MapView_1.NODE_TYPE_ICON_NIGHT : MapView_1.NODE_TYPE_ICON[nodeType] || "";
    const typeName = isNightBattle ? "\u591C\u6218\u70B9" : MapView_1.NODE_TYPE_NAME[nodeType];
    const typeCls = isNightBattle ? "node-type-night" : `node-type-${nodeType.toLowerCase()}`;
    const headerEl = this.editorEl.querySelector(".node-editor-header");
    const badgeEl = headerEl.querySelector(".node-info-badge");
    const typeSpan = headerEl.querySelector(".node-editor-type");
    if (badgeEl) {
      badgeEl.className = `node-info-badge ${typeCls}`;
      badgeEl.innerHTML = icon;
    }
    if (typeSpan) {
      typeSpan.textContent = typeName;
    }
    this.editorIdEl.textContent = nodeId;
    this.enabledInput.checked = args.enabled;
    const endpointInput = document.getElementById("node-edit-endpoint");
    endpointInput.checked = draft?.isEndpoint ?? args.isEndpoint;
    const result = draft ? draft.result : args.result;
    const resultInput = this.editorEl.querySelector(`input[name="node-edit-result"][value="${result ?? ""}"]`) ?? this.editorEl.querySelector('input[name="node-edit-result"][value=""]');
    if (resultInput)
      resultInput.checked = true;
    const detourGroup = document.getElementById("node-edit-detour-group");
    const detourHelp = document.getElementById("node-edit-detour-help");
    const detourInput = document.getElementById("node-edit-detour");
    if (args.canDetour) {
      detourGroup.style.display = "";
      detourHelp.style.display = "none";
      detourHelp.textContent = "";
      detourInput.checked = draft?.detour ?? args.detour;
      document.getElementById("node-edit-sl-when-detour-fails").checked = draft?.slWhenDetourFails ?? args.slWhenDetourFails;
    } else {
      detourGroup.style.display = "none";
      detourHelp.style.display = "";
      detourHelp.textContent = "\u5F53\u524D\u8282\u70B9\u4E0D\u662F\u8FC2\u56DE\u70B9\uFF0C\u7D22\u654C\u89C4\u5219\u4E2D detour \u4E0D\u751F\u6548\u3002";
      detourInput.checked = false;
      document.getElementById("node-edit-sl-when-detour-fails").checked = false;
    }
    const combatFields = document.getElementById("node-editor-combat-fields");
    const nonCombatHint = document.getElementById("node-editor-non-combat-note");
    combatFields.style.display = isCombatNode ? "" : "none";
    nonCombatHint.style.display = isCombatNode ? "none" : "";
    const formationInput = this.editorEl.querySelector(`input[name="node-edit-formation"][value="${draft?.formation ?? args.formation}"]`) ?? this.editorEl.querySelector('input[name="node-edit-formation"][value="2"]');
    if (formationInput)
      formationInput.checked = true;
    const nightCheckbox = document.getElementById("node-edit-night");
    if (mapNight && nodeType === "Normal") {
      nightCheckbox.checked = true;
      nightCheckbox.disabled = true;
    } else {
      nightCheckbox.checked = draft?.night ?? args.night;
      nightCheckbox.disabled = false;
    }
    document.getElementById("node-edit-long-missile-support").checked = draft?.longMissileSupport ?? args.longMissileSupport;
    document.getElementById("node-edit-proceed").checked = draft?.proceed ?? args.proceed;
    document.getElementById("node-edit-rules").value = draft?.rulesText ?? args.enemyRules;
    this.placeholderEl.style.display = "none";
    this.editorEl.style.display = "";
    this.updateEnabledVisibility();
    this.updateEndpointControls();
    this.openDrawer();
  }
  hide() {
    this.cancelResizeAnimation();
    this.rememberDisabledDraft();
    this.currentNodeId = null;
    this.currentNodeIsTerminal = false;
    this.drawerEl.classList.remove("is-open");
    this.drawerEl.setAttribute("aria-hidden", "true");
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && this.drawerEl.contains(activeElement)) {
      activeElement.blur();
    }
    const detourHelp = document.getElementById("node-edit-detour-help");
    if (detourHelp) {
      detourHelp.style.display = "none";
      detourHelp.textContent = "";
    }
  }
  resetDrafts() {
    this.disabledDrafts.clear();
    this.currentNodeId = null;
    this.currentNodeIsTerminal = false;
  }
  collectValues() {
    const values = this.readValues();
    if (this.currentNodeId) {
      if (values.enabled) {
        this.disabledDrafts.delete(this.currentNodeId);
      } else {
        this.disabledDrafts.set(this.currentNodeId, values);
      }
    }
    return values;
  }
  readValues() {
    const formationInput = this.editorEl.querySelector('input[name="node-edit-formation"]:checked');
    const resultInput = this.editorEl.querySelector('input[name="node-edit-result"]:checked');
    const isEndpoint = document.getElementById("node-edit-endpoint").checked;
    return {
      enabled: this.enabledInput.checked,
      isEndpoint,
      result: resultInput?.value || void 0,
      formation: Number.parseInt(formationInput?.value ?? "2", 10),
      night: document.getElementById("node-edit-night").checked,
      longMissileSupport: document.getElementById("node-edit-long-missile-support").checked,
      proceed: !isEndpoint && !this.currentNodeIsTerminal && document.getElementById("node-edit-proceed").checked,
      detour: document.getElementById("node-edit-detour").checked,
      slWhenDetourFails: document.getElementById("node-edit-sl-when-detour-fails").checked,
      rulesText: document.getElementById("node-edit-rules").value
    };
  }
  rememberDisabledDraft() {
    if (!this.currentNodeId || this.enabledInput.checked)
      return;
    this.disabledDrafts.set(this.currentNodeId, this.readValues());
  }
  updateEnabledVisibility(animate = false) {
    const update = () => {
      const hidden = !this.enabledInput.checked;
      this.editorEl.querySelectorAll(".node-enable-dependent").forEach((element) => {
        element.hidden = hidden;
      });
      this.updateEndpointControls();
    };
    if (!animate || !this.drawerEl.classList.contains("is-open") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }
    const before = this.drawerEl.getBoundingClientRect();
    this.resizeAnimation?.cancel();
    update();
    const after = this.drawerEl.getBoundingClientRect();
    if (Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1) {
      return;
    }
    this.drawerEl.style.overflow = "hidden";
    const animation = this.drawerEl.animate([
      {
        width: `${before.width}px`,
        height: `${before.height}px`
      },
      {
        width: `${after.width}px`,
        height: `${after.height}px`
      }
    ], {
      duration: 160,
      easing: "cubic-bezier(0.2, 0.72, 0.2, 1)"
    });
    this.resizeAnimation = animation;
    void animation.finished.catch(() => void 0).then(() => {
      if (this.resizeAnimation !== animation)
        return;
      this.resizeAnimation = null;
      this.drawerEl.style.removeProperty("overflow");
    });
  }
  updateEndpointControls() {
    const endpointInput = document.getElementById("node-edit-endpoint");
    const resultGroup = document.getElementById("node-edit-result-group");
    resultGroup.hidden = !this.enabledInput.checked || !endpointInput.checked;
    const proceedInput = document.getElementById("node-edit-proceed");
    const proceedLabel = document.getElementById("node-edit-proceed-label");
    const proceedUnavailable = endpointInput.checked || this.currentNodeIsTerminal;
    if (proceedUnavailable) {
      proceedInput.checked = false;
    }
    proceedInput.disabled = proceedUnavailable;
    proceedLabel.style.display = this.currentNodeIsTerminal ? "none" : "";
    proceedLabel.title = endpointInput.checked ? "\u7EC8\u70B9\u8282\u70B9\u4E0D\u80FD\u7EE7\u7EED\u524D\u8FDB" : "";
  }
  cancelResizeAnimation() {
    this.resizeAnimation?.cancel();
    this.resizeAnimation = null;
    this.drawerEl.style.removeProperty("overflow");
  }
  openDrawer() {
    this.drawerEl.setAttribute("aria-hidden", "false");
    this.drawerEl.classList.add("is-open");
  }
};
exports.NodeEditorView = NodeEditorView;