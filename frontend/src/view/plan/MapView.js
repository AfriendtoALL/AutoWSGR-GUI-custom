"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapView = exports.NON_COMBAT_TYPES = exports.NODE_TYPE_NAME = exports.NODE_TYPE_ICON = exports.NODE_TYPE_ICON_NIGHT = exports.FORMATION_SHORT = void 0;
exports.escapeHtml = escapeHtml;
var scrollPosition_1 = require_scrollPosition();
exports.FORMATION_SHORT = {
  "\u5355\u7EB5\u9635": "\u5355\u7EB5",
  "\u590D\u7EB5\u9635": "\u590D\u7EB5",
  "\u8F6E\u578B\u9635": "\u8F6E\u578B",
  "\u68AF\u5F62\u9635": "\u68AF\u5F62",
  "\u5355\u6A2A\u9635": "\u5355\u6A2A"
};
exports.NODE_TYPE_ICON_NIGHT = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 1a7 7 0 1 0 5.5 11.3A5.5 5.5 0 0 1 7 1z"/></svg>';
exports.NODE_TYPE_ICON = {
  Start: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 2l8 6-8 6V2z"/></svg>',
  Normal: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  Boss: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 13h12v1.5H2V13z"/><path d="M2 6l2.5 5h7L14 6l-3 3-3-4-3 4-3-3z"/><circle cx="2" cy="5.5" r="1"/><circle cx="8" cy="4.5" r="1"/><circle cx="14" cy="5.5" r="1"/></svg>',
  Resource: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v9H2V4zm1 1v7h10V5H3zm1 1h3v2H4V6zm5 0h3v2H9V6z"/></svg>',
  Penalty: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l6.5 13H1.5L8 1.5zM7 6v4h2V6H7zm0 5v2h2v-2H7z"/></svg>',
  Suppress: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2"/><line x1="8" y1="1" x2="8" y2="5" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="11" x2="8" y2="15" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="8" x2="5" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>',
  Aerial: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="1.5" cy="14.5" r="1.2"/><line x1="2.8" y1="13.2" x2="10" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="3" cy="9" r="1.2"/><line x1="4.3" y1="7.7" x2="12" y2="0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="12" r="1.2"/><line x1="9.3" y1="10.7" x2="15" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  Hard: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.8 3.6L14 5.4l-3 2.9.7 4.1L8 10.5l-3.7 1.9.7-4.1-3-2.9 4.2-.8z"/><circle cx="8" cy="13" r="1.5"/></svg>'
};
exports.NODE_TYPE_NAME = {
  Start: "\u51FA\u51FB\u70B9",
  Normal: "\u666E\u901A\u6218\u6597",
  Boss: "Boss \u70B9",
  Resource: "\u8D44\u6E90\u70B9",
  Penalty: "\u7F5A\u70B9",
  Suppress: "\u538B\u5236\u70B9",
  Aerial: "\u7A7A\u88AD\u70B9",
  Hard: "\u7CBE\u82F1\u70B9"
};
exports.NON_COMBAT_TYPES = /* @__PURE__ */ new Set(["Start", "Resource", "Penalty"]);
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
var MapView = class {
  constructor() {
    this.mapStageEl = null;
    this.mapAspectRatio = 1;
    this.nodeListEl = document.getElementById("node-list");
    this.resizeObserver = new ResizeObserver(() => this.updateMapStageSize());
    this.resizeObserver.observe(this.nodeListEl);
  }
  renderNodes(allNodes, selectedNodes, edges, mapAspectRatio) {
    const scrollPosition = (0, scrollPosition_1.captureScrollPosition)(this.nodeListEl);
    this.nodeListEl.innerHTML = "";
    this.mapStageEl = null;
    if (allNodes && edges) {
      this.nodeListEl.classList.add("map-canvas");
      this.mapAspectRatio = mapAspectRatio && Number.isFinite(mapAspectRatio) && mapAspectRatio > 0 ? mapAspectRatio : 1;
      const stage = document.createElement("div");
      stage.classList.add("map-stage");
      this.mapStageEl = stage;
      this.nodeListEl.appendChild(stage);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("map-edges");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      this.renderEdges(svg, edges);
      stage.appendChild(svg);
      const selectedSet = new Set(selectedNodes.map((n) => n.id));
      for (const node of allNodes) {
        const chip = this.createMapNode(node, selectedSet.has(node.id));
        stage.appendChild(chip);
      }
      this.updateMapStageSize();
    } else {
      this.nodeListEl.classList.remove("map-canvas");
      for (const node of selectedNodes) {
        this.nodeListEl.appendChild(this.createNodeChip(node));
      }
    }
    (0, scrollPosition_1.restoreScrollPosition)(this.nodeListEl, scrollPosition);
  }
  updateMapStageSize() {
    if (!this.mapStageEl)
      return;
    const containerWidth = this.nodeListEl.clientWidth;
    const containerHeight = this.nodeListEl.clientHeight - 10;
    if (containerWidth <= 0 || containerHeight <= 0)
      return;
    let stageWidth = containerWidth;
    let stageHeight = stageWidth / this.mapAspectRatio;
    if (stageHeight > containerHeight) {
      stageHeight = containerHeight;
      stageWidth = stageHeight * this.mapAspectRatio;
    }
    this.mapStageEl.style.width = `${stageWidth}px`;
    this.mapStageEl.style.height = `${stageHeight}px`;
  }
  clearSelection() {
    this.nodeListEl.querySelectorAll(".node-chip,.map-node").forEach((c) => c.classList.remove("selected"));
  }
  renderEdges(svg, edges) {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "4");
    marker.setAttribute("markerHeight", "3");
    marker.setAttribute("refX", "4");
    marker.setAttribute("refY", "1.5");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M0,0 L4,1.5 L0,3 Z");
    arrowPath.setAttribute("fill", "var(--text-muted)");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);
    for (const edge of edges) {
      const [x1, y1] = edge.from;
      const [x2, y2] = edge.to;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1)
        continue;
      const sign = edge.fromId < edge.toId ? 1 : -1;
      const nx = -dy / dist * sign;
      const ny = dx / dist * sign;
      const bulge = dist * 0.1;
      const cx = (x1 + x2) / 2 + nx * bulge;
      const cy = (y1 + y2) / 2 + ny * bulge;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
      path.setAttribute("marker-end", "url(#arrowhead)");
      path.classList.add("map-edge-line");
      svg.appendChild(path);
    }
  }
  createMapNode(node, isSelected) {
    const chip = document.createElement("div");
    const typeCls = `node-type-${node.nodeType.toLowerCase()}`;
    const nightCls = node.mapNight && node.nodeType === "Normal" ? " is-night" : "";
    chip.className = `map-node ${typeCls}${isSelected ? " map-node-selected" : ""}${node.detour ? " is-detour" : ""}${nightCls}`;
    if (node.position) {
      chip.style.left = node.position[0] + "%";
      chip.style.top = node.position[1] + "%";
    }
    chip.dataset["nodeId"] = node.id;
    chip.innerHTML = `<span class="map-node-id">${escapeHtml(node.id)}</span>`;
    chip.title = isSelected ? "\u5DF2\u542F\u7528\u8282\u70B9\uFF0C\u70B9\u51FB\u7F16\u8F91" : "\u672A\u542F\u7528\u8282\u70B9\uFF0C\u70B9\u51FB\u914D\u7F6E\u5E76\u542F\u7528";
    chip.addEventListener("click", () => {
      this.nodeListEl.querySelectorAll(".map-node,.node-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      this.onNodeClick?.(node.id);
    });
    return chip;
  }
  createNodeChip(node) {
    const chip = document.createElement("div");
    const typeCls = `node-type-${node.nodeType.toLowerCase()}`;
    chip.className = `node-chip ${typeCls}${node.hasCustomRules ? " has-custom" : ""}${node.detour ? " is-detour" : ""}`;
    chip.dataset["nodeId"] = node.id;
    const shortFormation = exports.FORMATION_SHORT[node.formation] || node.formation;
    const typeIcon = exports.NODE_TYPE_ICON[node.nodeType];
    const isCombat = !exports.NON_COMBAT_TYPES.has(node.nodeType);
    chip.innerHTML = `<span class="node-id">${escapeHtml(node.id)}</span>` + (typeIcon ? `<span class="node-type-badge">${typeIcon}</span>` : "") + (isCombat ? `<span class="node-detail">${escapeHtml(shortFormation)}</span>` : "") + (node.night ? '<span class="night-icon">\u263E</span>' : "") + (node.detour ? '<span class="detour-icon">\u21A9</span>' : "") + (!node.proceed && isCombat ? '<span class="node-detail stop-icon">\u26D4</span>' : "");
    chip.addEventListener("click", () => {
      this.nodeListEl.querySelectorAll(".node-chip,.map-node").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      this.onNodeClick?.(node.id);
    });
    return chip;
  }
};
exports.MapView = MapView;