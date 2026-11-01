"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanModel = void 0;
var index_js_1 = require_adapter();
var nodeDecision_js_1 = require_nodeDecision();
var yamlSerializer_js_1 = require_yamlSerializer();
var BATTLE_RESULT_GRADES = /* @__PURE__ */ new Set(["D", "C", "B", "A", "S", "SS"]);
var PlanModel = class _PlanModel {
  constructor(data, fileName, comment, rawRoot = {}) {
    this.data = data;
    this.fileName = fileName;
    this.comment = comment;
    this.rawRoot = rawRoot;
  }
  /** 从 YAML 字符串 + 文件路径创建 PlanModel */
  static fromYaml(content, path) {
    const comment = _PlanModel.extractComment(content);
    const parsed = index_js_1.yamlCodec.parse(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("\u65E0\u6548\u7684\u65B9\u6848\u6587\u4EF6");
    }
    const chapterRaw = parsed.chapter;
    const mapRaw = parsed.map;
    const chapter = typeof chapterRaw === "string" && /^[EH]$/i.test(chapterRaw.trim()) ? chapterRaw.trim().toUpperCase() : Number(chapterRaw) || 0;
    const map = typeof mapRaw === "string" && /^\d+[ab]$/i.test(mapRaw.trim()) ? mapRaw.trim().toLowerCase() : Number(mapRaw) || 0;
    const chapterCode = String(chapter).toUpperCase();
    if ((chapterCode === "E" || chapterCode === "H") && parsed.event == null) {
      throw new Error("\u6D3B\u52A8\u65B9\u6848\u7F3A\u5C11 event \u5B57\u6BB5");
    }
    const data = {
      chapter,
      map,
      mode: typeof parsed.mode === "string" ? parsed.mode : void 0,
      event: parsed.event != null ? String(parsed.event) : void 0,
      selected_nodes: Array.isArray(parsed.selected_nodes) ? parsed.selected_nodes.map(String) : [],
      endpoint_nodes: Array.isArray(parsed.endpoint_nodes) ? parsed.endpoint_nodes.map(String) : void 0,
      result: typeof parsed.result === "string" && BATTLE_RESULT_GRADES.has(parsed.result.toUpperCase()) ? parsed.result.toUpperCase() : void 0,
      fight_condition: parsed.fight_condition != null ? Number(parsed.fight_condition) : void 0,
      repair_mode: parsed.repair_mode != null ? Array.isArray(parsed.repair_mode) ? parsed.repair_mode.map(Number) : Number(parsed.repair_mode) : void 0,
      fleet_id: parsed.fleet_id != null ? Number(parsed.fleet_id) : void 0,
      node_defaults: _PlanModel.normalizeNodeArgs(parsed.node_defaults),
      node_args: _PlanModel.normalizeNodeArgsMap(parsed.node_args),
      fleet_presets: _PlanModel.parseFleetPresets(parsed.fleet_presets),
      // 任务级字段
      times: parsed.times != null ? Number(parsed.times) : void 0,
      gap: parsed.gap != null ? Number(parsed.gap) : void 0,
      stop_condition: parsed.stop_condition
    };
    return new _PlanModel(data, path, comment, structuredClone(parsed));
  }
  /** 地图名，如 "7-4" 或 "Ex-3" */
  get mapName() {
    if (this.isEvent) {
      const rawMap = String(this.data.map);
      const match = rawMap.match(/^(\d+)([ab])?$/i);
      const stage = match?.[1] ?? rawMap;
      const entranceCode = match?.[2]?.toLowerCase();
      const entrance = entranceCode === "a" ? "-\u03B1" : entranceCode === "b" ? "-\u03B2" : "";
      return `${String(this.data.chapter).toUpperCase()}-Ex-${stage}${entrance}`;
    }
    if (this.data.chapter === 99)
      return `Ex-${this.data.map}`;
    return `${this.data.chapter}-${this.data.map}`;
  }
  /** 是否为活动作战方案。 */
  get isEvent() {
    const chapter = String(this.data.chapter).toUpperCase();
    return !!this.data.event || this.data.mode === "event" || chapter === "E" || chapter === "H";
  }
  /** 修理模式，默认 1。若为数组则返回原始数组 */
  get repairMode() {
    return this.data.repair_mode ?? 1;
  }
  /** 战况条件，默认 1 */
  get fightCondition() {
    return this.data.fight_condition ?? 1;
  }
  /** 获取指定节点的合并参数 (node_defaults + node_args 覆盖) */
  getNodeArgs(nodeId) {
    const defaults = this.data.node_defaults ?? {};
    const overrides = this.data.node_args?.[nodeId] ?? {};
    const args = { ...defaults, ...overrides };
    if (this.data.endpoint_nodes?.includes(nodeId)) {
      args.proceed = false;
    }
    return args;
  }
  /** 获取任务执行用节点覆盖，确保终点节点不会继续前进。 */
  getNodeArgsForExecution() {
    const nodeArgs = structuredClone(this.data.node_args ?? {});
    for (const nodeId of this.data.endpoint_nodes ?? []) {
      nodeArgs[nodeId] = {
        ...nodeArgs[nodeId],
        proceed: false
      };
    }
    return nodeArgs;
  }
  /** 该节点是否有自定义参数 (node_args 中存在条目) */
  hasCustomArgs(nodeId) {
    return this.data.node_args != null && nodeId in this.data.node_args;
  }
  /** 提取 YAML 文件顶部的注释行 */
  static extractComment(content) {
    const lines = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("#")) {
        lines.push(trimmed.slice(1).trim());
      } else if (trimmed === "") {
        continue;
      } else {
        break;
      }
    }
    return lines.join("\n");
  }
  /** 创建空方案 (新建方案用) */
  static create(chapter, map, selectedNodes, event) {
    const data = {
      chapter,
      map,
      event,
      selected_nodes: selectedNodes,
      fight_condition: 1,
      repair_mode: 1,
      fleet_id: 1,
      node_defaults: { formation: 2, night: false, proceed: true },
      node_args: {}
    };
    return new _PlanModel(data, "", "");
  }
  /** 序列化为 YAML 字符串 */
  toYaml() {
    const obj = structuredClone(this.rawRoot);
    const rawFleetPresets = obj.fleet_presets;
    delete obj.fleet_presets;
    delete obj.repair_method;
    obj.chapter = this.data.chapter;
    obj.map = this.data.map;
    obj.selected_nodes = [...this.data.selected_nodes];
    this.setOptionalField(obj, "mode", this.data.mode);
    this.setOptionalField(obj, "event", this.data.event);
    this.setOptionalField(obj, "fleet_id", this.data.fleet_id);
    this.setOptionalField(obj, "endpoint_nodes", this.data.endpoint_nodes?.length ? [...this.data.endpoint_nodes] : void 0);
    this.setOptionalField(obj, "result", this.data.result);
    this.setOptionalField(obj, "fight_condition", this.data.fight_condition);
    this.setOptionalField(obj, "repair_mode", this.data.repair_mode);
    if (this.data.node_defaults) {
      obj.node_defaults = this.mergeNodeArgs(this.rawRoot.node_defaults, this.data.node_defaults);
    } else {
      delete obj.node_defaults;
    }
    const nodeArgs = this.getNodeArgsForExecution();
    if (Object.keys(nodeArgs).length > 0) {
      const rawNodeArgs = this.rawRoot.node_args;
      const rawMap = rawNodeArgs && typeof rawNodeArgs === "object" && !Array.isArray(rawNodeArgs) ? rawNodeArgs : {};
      const cleaned = {};
      for (const [nodeId, args] of Object.entries(nodeArgs)) {
        const merged = this.mergeNodeArgs(rawMap[nodeId], args);
        if (Object.keys(merged).length > 0)
          cleaned[nodeId] = merged;
      }
      if (Object.keys(cleaned).length > 0)
        obj.node_args = cleaned;
      else
        delete obj.node_args;
    } else {
      delete obj.node_args;
    }
    this.setOptionalField(obj, "times", this.data.times);
    this.setOptionalField(obj, "gap", this.data.gap);
    this.setOptionalField(obj, "stop_condition", this.data.stop_condition);
    // 7.4/R28：定时方案已下线，保存时清掉没有任何触发链路的 scheduled_time。
    delete obj.scheduled_time;
    delete obj.collect_result_info;
    if (this.data.fleet_presets !== void 0) {
      if (this.data.fleet_presets.length > 0) {
        obj.fleet_presets = this.mergeFleetPresets(this.data.fleet_presets);
      }
    } else if (rawFleetPresets !== void 0) {
      obj.fleet_presets = rawFleetPresets;
    }
    let result = "";
    if (this.comment) {
      result = this.comment.split("\n").map((l) => `# ${l}`).join("\n") + "\n";
    }
    result += (0, yamlSerializer_js_1.serializePlanYaml)(obj);
    return result;
  }
  /** 写入可选字段；值被清空时同步删除旧 YAML 中的字段 */
  setOptionalField(obj, key, value) {
    if (value == null || value === "")
      delete obj[key];
    else
      obj[key] = structuredClone(value);
  }
  /** 更新 GUI 管理的节点参数，同时保留后端新增的未知参数 */
  mergeNodeArgs(raw, args) {
    const output = raw && typeof raw === "object" && !Array.isArray(raw) ? structuredClone(raw) : {};
    const managedKeys = [
      "formation",
      "night",
      "long_missile_support",
      "proceed",
      "detour",
      "SL_when_detour_fails",
      "sl_when_detour_fails",
      "enemy_rules",
      "proceed_stop"
    ];
    for (const key of managedKeys)
      delete output[key];
    Object.assign(output, this.cleanNodeArgs(args));
    return output;
  }
  /** 更新编队预设，同时保留预设和槽位中 GUI 尚未建模的字段 */
  mergeFleetPresets(presets) {
    const rawPresets = Array.isArray(this.rawRoot.fleet_presets) ? this.rawRoot.fleet_presets : [];
    return presets.map((preset, index) => {
      const rawPreset = rawPresets.find((item) => item && typeof item === "object" && !Array.isArray(item) && item.name === preset.name) ?? rawPresets[index];
      const output = rawPreset && typeof rawPreset === "object" && !Array.isArray(rawPreset) ? structuredClone(rawPreset) : {};
      const rawShips = Array.isArray(output.ships) ? output.ships : [];
      output.name = preset.name;
      output.ships = preset.ships.map((slot, slotIndex) => this.mergeShipSlot(rawShips[slotIndex], slot));
      return output;
    });
  }
  /** 覆盖单个槽位的正式字段，并清理旧版 priority 字段 */
  mergeShipSlot(raw, slot) {
    if (slot === null)
      return null;
    if (typeof slot === "string")
      return slot;
    const output = raw && typeof raw === "object" && !Array.isArray(raw) ? structuredClone(raw) : {};
    const managedKeys = [
      "name",
      "nation",
      "search_name",
      "ship_type",
      "priority",
      "candidates",
      "min_level",
      "max_level",
      "relaxed"
    ];
    for (const key of managedKeys)
      delete output[key];
    Object.assign(output, structuredClone(slot));
    return output;
  }
  /** 清理节点参数：移除 undefined 值 */
  cleanNodeArgs(args) {
    const out = {};
    if (args.formation != null)
      out.formation = args.formation;
    if (args.night != null)
      out.night = args.night;
    if (args.long_missile_support != null)
      out.long_missile_support = args.long_missile_support;
    if (args.proceed != null)
      out.proceed = args.proceed;
    if (args.detour != null)
      out.detour = args.detour;
    if (args.SL_when_detour_fails != null)
      out.SL_when_detour_fails = args.SL_when_detour_fails;
    if (args.enemy_rules && args.enemy_rules.length > 0)
      out.enemy_rules = args.enemy_rules;
    if (args.proceed_stop)
      out.proceed_stop = args.proceed_stop;
    return out;
  }
  /** 解析 fleet_presets 字段 */
  static parseFleetPresets(raw) {
    if (!Array.isArray(raw))
      return void 0;
    const presets = [];
    for (const item of raw) {
      if (!item || typeof item !== "object")
        continue;
      const obj = item;
      if (typeof obj.name !== "string" || !Array.isArray(obj.ships))
        continue;
      presets.push({
        ...obj,
        name: obj.name,
        ships: obj.ships.map(_PlanModel.parseShipSlot)
      });
    }
    return presets.length > 0 ? presets : void 0;
  }
  /** 解析单个舰船槽位: 字符串 → 具体舰船, 对象 → ShipFilter */
  static parseShipSlot(raw) {
    if (raw === null)
      return null;
    if (typeof raw === "string")
      return raw;
    if (raw && typeof raw === "object") {
      const obj = raw;
      const filter = {};
      if (typeof obj.name === "string" || typeof obj.name === "number") {
        const normalizedName = String(obj.name).trim();
        if (normalizedName)
          filter.name = normalizedName;
      }
      if (typeof obj.search_name === "string" && obj.search_name.trim()) {
        filter.search_name = obj.search_name.trim();
      }
      if (typeof obj.nation === "string")
        filter.nation = obj.nation;
      const shipTypes = _PlanModel.parseShipTypes(obj.ship_type);
      if (shipTypes)
        filter.ship_type = shipTypes;
      _PlanModel.assignLevelRange(filter, obj);
      if (typeof obj.relaxed === "boolean")
        filter.relaxed = obj.relaxed;
      const rawCandidates = Array.isArray(obj.candidates) ? obj.candidates : obj.priority;
      if (Array.isArray(rawCandidates)) {
        const candidateOnlyWithLegacyNames = !filter.name && rawCandidates.some((value) => typeof value === "string");
        const candidates = rawCandidates.flatMap((candidate) => {
          if (typeof candidate === "string") {
            const name = candidate.trim();
            if (!name)
              return [];
            const legacyRule = { name };
            if (filter.search_name) {
              legacyRule.search_name = filter.search_name;
            }
            if (filter.ship_type)
              legacyRule.ship_type = [...filter.ship_type];
            if (filter.min_level !== void 0) {
              legacyRule.min_level = filter.min_level;
            }
            if (filter.max_level !== void 0) {
              legacyRule.max_level = filter.max_level;
            }
            return [legacyRule];
          }
          const parsed = _PlanModel.parseShipRule(candidate);
          return parsed ? [parsed] : [];
        });
        if (candidates.length > 0)
          filter.candidates = candidates;
        if (candidateOnlyWithLegacyNames)
          delete filter.search_name;
      }
      return filter;
    }
    return String(raw);
  }
  static parseShipRule(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return null;
    const obj = raw;
    if (typeof obj.name !== "string" || !obj.name.trim())
      return null;
    const rule = {
      name: obj.name.trim()
    };
    if (typeof obj.search_name === "string" && obj.search_name.trim()) {
      rule.search_name = obj.search_name.trim();
    }
    const shipTypes = _PlanModel.parseShipTypes(obj.ship_type);
    if (shipTypes)
      rule.ship_type = shipTypes;
    _PlanModel.assignLevelRange(rule, obj);
    if (typeof obj.relaxed === "boolean")
      rule.relaxed = obj.relaxed;
    return rule;
  }
  static parseShipTypes(raw) {
    const values = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
    const result = Array.from(new Set(values.filter((value) => typeof value === "string").map((value) => String(value).trim().toLowerCase()).filter(Boolean)));
    return result.length > 0 ? result : void 0;
  }
  static assignLevelRange(rule, raw) {
    if (raw.min_level != null && Number.isFinite(Number(raw.min_level))) {
      rule.min_level = Math.max(1, Math.floor(Number(raw.min_level)));
    }
    if (raw.max_level != null && Number.isFinite(Number(raw.max_level))) {
      rule.max_level = Math.max(1, Math.floor(Number(raw.max_level)));
    }
  }
  static normalizeRuleAction(actionRaw) {
    if (typeof actionRaw === "number" && Number.isFinite(actionRaw)) {
      const value = Math.trunc(actionRaw);
      return value >= 1 && value <= 5 ? value : null;
    }
    const raw = String(actionRaw ?? "").trim();
    if (!raw)
      return null;
    const aliases = {
      detour: "detour",
      "\u8FC2\u56DE": "detour",
      retreat: "retreat",
      "\u64A4\u9000": "retreat"
    };
    const lower = raw.toLowerCase();
    const normalized = aliases[lower] ?? aliases[raw] ?? raw;
    if (/^\d+$/.test(normalized)) {
      const value = Number(normalized);
      return value >= 1 && value <= 5 ? value : null;
    }
    return normalized === "retreat" || normalized === "detour" ? normalized : null;
  }
  static normalizeEnemyRules(rules) {
    if (!Array.isArray(rules))
      return void 0;
    const normalized = [];
    for (const item of rules) {
      if (!Array.isArray(item) || item.length < 2)
        continue;
      const expr = String(item[0] ?? "").trim();
      if (!expr)
        continue;
      const action = _PlanModel.normalizeRuleAction(item[1]);
      if (action === null)
        continue;
      normalized.push([expr, action]);
    }
    return normalized.length > 0 ? normalized : void 0;
  }
  static normalizeNodeArgs(args) {
    if (!args)
      return void 0;
    const normalized = (0, nodeDecision_js_1.normalizeLegacyNodeDecisionFields)(args);
    normalized.enemy_rules = _PlanModel.normalizeEnemyRules(args.enemy_rules);
    normalized.enemy_formation_rules = _PlanModel.normalizeEnemyRules(args.enemy_formation_rules);
    return normalized;
  }
  static normalizeNodeArgsMap(nodeArgs) {
    if (!nodeArgs || typeof nodeArgs !== "object")
      return void 0;
    const normalized = {};
    for (const [nodeId, args] of Object.entries(nodeArgs)) {
      const node = _PlanModel.normalizeNodeArgs(args);
      if (node)
        normalized[nodeId] = node;
    }
    return Object.keys(normalized).length > 0 ? normalized : void 0;
  }
};
exports.PlanModel = PlanModel;