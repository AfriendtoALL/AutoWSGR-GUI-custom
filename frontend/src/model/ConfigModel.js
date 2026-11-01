"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigModel = void 0;
var index_js_1 = require_adapter();
var lootPlans_js_1 = require_lootPlans();
var decisiveAutomation_js_1 = require_decisiveAutomation();
var campaign_js_1 = require_campaign();
var NormalFightDailyQuota_js_1 = require_NormalFightDailyQuota();
var Logger_1 = require_Logger();
var DEFAULT_SETTINGS = {
  emulator: {
    type: "\u96F7\u7535"
  },
  account: {
    game_app: "\u5B98\u670D"
  },
  ocr: {
    gpu: false,
    mirror: "modelscope",
    enhanced_ship_ocr: false,
    ship_name_match_confidence: 0.65,
    ship_name_corrections: {},
    ship_name_aliases: {}
  },
  log: {
    level: "INFO",
    root: "logs"
  },
  daily_automation: {
    auto_expedition: false,
    auto_gain_bonus: false,
    auto_set_support: false,
    auto_battle: false,
    battle_type: "\u56F0\u96BE\u6F5C\u8247",
    auto_exercise: false,
    exercise_fleet_id: null,
    auto_normal_fight: false,
    normal_fight_tasks: [],
    quick_repair_limit: null,
    stop_max_ship: false,
    stop_max_loot: false
  },
  theme_mode: "light",
  accent_color: "#0f7dff",
  operation_delay_min: 0,
  operation_delay_max: 0,
  dock_full_destroy: false,
  repair_manually: false,
  destroy_ship_work_mode: 0,
  destroy_ship_types: [],
  remove_equipment_mode: true
};
var DEFAULT_GUI_AUTOMATION = {
  expeditionInterval: 15,
  battleTimes: campaign_js_1.DAILY_CAMPAIGN_TIMES,
  autoDecisive: false,
  decisiveTemplateId: decisiveAutomation_js_1.SYSTEM_DECISIVE_PRESET_ID,
  autoLoot: false,
  lootPlanSource: "system",
  lootPlanId: lootPlans_js_1.DEFAULT_LOOT_PLAN_ID,
  lootPlans: lootPlans_js_1.DEFAULT_LOOT_PLANS.map((plan) => ({ ...plan })),
  lootStopCount: 50
};
var LEGACY_DAILY_KEYS = [
  "expedition_interval",
  "battle_times",
  "auto_loot",
  "loot_plan_id",
  "loot_plan_index",
  "loot_stop_count"
];
var ConfigModel = class {
  constructor() {
    this.legacyGuiAutomation = {};
    this.legacyDecisiveAutomation = {};
    this.invalidLegacyDecisiveFields = [];
    this.rawRoot = {};
    this.yamlThemePresent = false;
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.guiAutomation = structuredClone(DEFAULT_GUI_AUTOMATION);
  }
  /** 当前配置 (只读引用) */
  get current() {
    return this.settings;
  }
  /** GUI 自身定时调度配置，不参与 usersettings.yaml 序列化。 */
  get currentGuiAutomation() {
    return this.guiAutomation;
  }
  /** 旧版 usersettings.yaml 中可迁移的 GUI 私有字段。 */
  get migratedGuiAutomation() {
    return structuredClone(this.legacyGuiAutomation);
  }
  /** 等待迁入 gui_settings.json 的旧版决战自动化原值。 */
  get migratedLegacyDecisiveAutomation() {
    return structuredClone(this.legacyDecisiveAutomation);
  }
  /** 格式无法识别且必须继续留在 YAML 中的旧版决战字段。 */
  get unmigratedLegacyDecisiveFields() {
    return [...this.invalidLegacyDecisiveFields];
  }
  /** 7.6/R35: whether the loaded YAML explicitly provided a theme. */
  get hasYamlTheme() {
    return this.yamlThemePresent;
  }
  /** 从 YAML 字符串加载配置，缺失字段保留默认值 */
  loadFromYaml(yamlStr) {
    const parsed = index_js_1.yamlCodec.parse(yamlStr);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      Logger_1.Logger.debug("\u914D\u7F6E YAML \u89E3\u6790\u7ED3\u679C\u4E3A\u7A7A\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C");
      return;
    }
    this.rawRoot = structuredClone(parsed);
    const base = structuredClone(DEFAULT_SETTINGS);
    this.yamlThemePresent = parsed.theme_mode === "light" || parsed.theme_mode === "dark" || parsed.theme_mode === "system";
    if (this.yamlThemePresent)
      base.theme_mode = parsed.theme_mode;
    if (typeof parsed.accent_color === "string" && /^#[0-9a-f]{6}$/i.test(parsed.accent_color))
      base.accent_color = parsed.accent_color;
    const emulator = this.asRecord(parsed.emulator);
    if (emulator) {
      if (typeof emulator.type === "string")
        base.emulator.type = emulator.type;
      if (typeof emulator.path === "string")
        base.emulator.path = emulator.path;
      if (typeof emulator.serial === "string")
        base.emulator.serial = emulator.serial;
      if (typeof emulator.process_name === "string") {
        base.emulator.process_name = emulator.process_name;
      }
    }
    const account = this.asRecord(parsed.account);
    if (account && typeof account.game_app === "string") {
      base.account.game_app = account.game_app;
    }
    const ocr = this.asRecord(parsed.ocr);
    if (ocr) {
      if (typeof ocr.gpu === "boolean")
        base.ocr.gpu = ocr.gpu;
      if (["origin", "github", "tencent", "modelscope"].includes(String(ocr.mirror))) {
        base.ocr.mirror = String(ocr.mirror);
      }
      if (typeof ocr.enhanced_ship_ocr === "boolean") {
        base.ocr.enhanced_ship_ocr = ocr.enhanced_ship_ocr;
      }
      base.ocr.ship_name_match_confidence = this.clampNumber(ocr.ship_name_match_confidence, 0, 1, base.ocr.ship_name_match_confidence);
      base.ocr.ship_name_corrections = this.stringMap(ocr.ship_name_corrections);
      base.ocr.ship_name_aliases = this.stringMap(ocr.ship_name_aliases);
    }
    const log = this.asRecord(parsed.log);
    if (log) {
      const levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
      if (levels.includes(String(log.level))) {
        base.log.level = String(log.level);
      }
      if (typeof log.root === "string")
        base.log.root = log.root;
      if (typeof log.dir === "string" || log.dir === null)
        base.log.dir = log.dir;
      for (const key of [
        "show_decisive_battle_info",
        "show_emulator_debug",
        "show_ui_debug",
        "show_vision_debug",
        "show_ops_debug",
        "show_combat_state_debug",
        "show_combat_recognition_debug"
      ]) {
        if (typeof log[key] === "boolean")
          base.log[key] = log[key];
      }
      if (this.asRecord(log.channels)) {
        base.log.channels = this.stringMap(log.channels);
      }
    }
    const daily = this.asRecord(parsed.daily_automation);
    if (daily) {
      for (const key of [
        "auto_expedition",
        "auto_gain_bonus",
        "auto_set_support",
        "auto_battle",
        "auto_exercise",
        "auto_normal_fight",
        "stop_max_ship",
        "stop_max_loot"
      ]) {
        if (typeof daily[key] === "boolean")
          base.daily_automation[key] = daily[key];
      }
      if (typeof daily.battle_type === "string") {
        base.daily_automation.battle_type = daily.battle_type;
      }
      if (daily.exercise_fleet_id === null || Number.isFinite(Number(daily.exercise_fleet_id))) {
        base.daily_automation.exercise_fleet_id = daily.exercise_fleet_id === null ? null : Math.max(1, Math.trunc(Number(daily.exercise_fleet_id)));
      }
      base.daily_automation.normal_fight_tasks = this.normalFightTasks(daily.normal_fight_tasks);
      if (daily.quick_repair_limit === null || Number.isFinite(Number(daily.quick_repair_limit))) {
        base.daily_automation.quick_repair_limit = daily.quick_repair_limit === null ? null : Math.max(0, Math.trunc(Number(daily.quick_repair_limit)));
      }
      this.legacyGuiAutomation = this.readLegacyGuiAutomation(daily);
      this.legacyDecisiveAutomation = this.readLegacyDecisiveAutomation(daily);
    } else {
      this.legacyGuiAutomation = {};
      this.legacyDecisiveAutomation = {};
      this.invalidLegacyDecisiveFields = [];
    }
    base.operation_delay_min = this.clampNumber(parsed.operation_delay_min, 0, 10, 0);
    base.operation_delay_max = this.clampNumber(parsed.operation_delay_max, 0, 10, 0);
    if (typeof parsed.dock_full_destroy === "boolean") {
      base.dock_full_destroy = parsed.dock_full_destroy;
    }
    if (typeof parsed.repair_manually === "boolean") {
      base.repair_manually = parsed.repair_manually;
    }
    base.destroy_ship_work_mode = this.destroyMode(parsed.destroy_ship_work_mode);
    base.destroy_ship_types = this.stringList(parsed.destroy_ship_types);
    if (typeof parsed.remove_equipment_mode === "boolean") {
      base.remove_equipment_mode = parsed.remove_equipment_mode;
    }
    if (typeof parsed.plan_root === "string" && parsed.plan_root.trim()) {
      base.plan_root = parsed.plan_root;
    }
    this.settings = base;
  }
  /** 导出当前配置为 YAML 字符串 */
  toYaml() {
    const output = structuredClone(this.rawRoot);
    output.emulator = this.mergeSection(this.rawRoot.emulator, this.settings.emulator);
    output.account = this.mergeSection(this.rawRoot.account, this.settings.account);
    output.ocr = this.mergeSection(this.rawRoot.ocr, this.settings.ocr, ["ship_name_corrections", "ship_name_aliases"]);
    output.log = this.mergeSection(this.rawRoot.log, this.settings.log, ["channels"]);
    const daily = this.mergeSection(this.rawRoot.daily_automation, this.settings.daily_automation);
    delete daily.auto_bath_repair;
    delete daily.bath_repair_blacklist;
    if (daily.exercise_fleet_id === null)
      delete daily.exercise_fleet_id;
    if (daily.quick_repair_limit === null)
      delete daily.quick_repair_limit;
    output.daily_automation = daily;
    delete output.bathroom_count;
    output.theme_mode = this.settings.theme_mode;
    output.accent_color = this.settings.accent_color;
    output.operation_delay_min = this.settings.operation_delay_min;
    output.operation_delay_max = this.settings.operation_delay_max;
    output.dock_full_destroy = this.settings.dock_full_destroy;
    output.repair_manually = this.settings.repair_manually;
    output.destroy_ship_work_mode = this.settings.destroy_ship_work_mode;
    output.destroy_ship_types = [...this.settings.destroy_ship_types];
    output.remove_equipment_mode = this.settings.remove_equipment_mode;
    if (this.settings.plan_root)
      output.plan_root = this.settings.plan_root;
    else
      delete output.plan_root;
    return index_js_1.yamlCodec.stringify(output, { lineWidth: -1, noRefs: true });
  }
  /** 局部更新配置 (深合并) */
  update(partial) {
    if (partial.emulator) {
      Object.assign(this.settings.emulator, partial.emulator);
    }
    if (partial.account) {
      Object.assign(this.settings.account, partial.account);
    }
    if (partial.ocr) {
      Object.assign(this.settings.ocr, partial.ocr);
    }
    if (partial.log) {
      Object.assign(this.settings.log, partial.log);
    }
    if (partial.daily_automation) {
      Object.assign(this.settings.daily_automation, partial.daily_automation);
    }
    for (const key of [
      "theme_mode",
      "accent_color",
      "operation_delay_min",
      "operation_delay_max",
      "dock_full_destroy",
      "repair_manually",
      "destroy_ship_work_mode",
      "destroy_ship_types",
      "remove_equipment_mode",
      "plan_root"
    ]) {
      if (key in partial) {
        this.settings[key] = structuredClone(partial[key]);
      }
    }
  }
  updateGuiAutomation(partial) {
    Object.assign(this.guiAutomation, partial);
    const lootPlans = (0, lootPlans_js_1.normalizeLootAutomationPlans)(this.guiAutomation.lootPlans);
    const selectedLootPlan = (0, lootPlans_js_1.findLootAutomationPlan)(lootPlans, this.guiAutomation.lootPlanSource, this.guiAutomation.lootPlanId);
    const fallbackLootPlan = lootPlans[0] ?? lootPlans_js_1.DEFAULT_LOOT_PLANS[0];
    this.guiAutomation.expeditionInterval = Math.max(1, Math.min(120, Math.trunc(this.guiAutomation.expeditionInterval || 15)));
    this.guiAutomation.battleTimes = campaign_js_1.DAILY_CAMPAIGN_TIMES;
    this.guiAutomation.autoDecisive = this.guiAutomation.autoDecisive === true;
    this.guiAutomation.decisiveTemplateId = (0, decisiveAutomation_js_1.normalizeDecisiveAutomationSource)(this.guiAutomation.decisiveTemplateId);
    this.guiAutomation.lootPlans = lootPlans;
    this.guiAutomation.lootPlanSource = selectedLootPlan?.source ?? fallbackLootPlan?.source ?? "system";
    this.guiAutomation.lootPlanId = selectedLootPlan?.file ?? fallbackLootPlan?.file ?? lootPlans_js_1.DEFAULT_LOOT_PLAN_ID;
    if (!selectedLootPlan)
      this.guiAutomation.autoLoot = false;
    this.guiAutomation.lootStopCount = Math.max(1, Math.min(50, Math.trunc(this.guiAutomation.lootStopCount || 50)));
  }
  /** 用默认值重置后再应用迁移结果，避免上一次加载状态参与字段优先级。 */
  replaceGuiAutomation(partial) {
    this.guiAutomation = structuredClone(DEFAULT_GUI_AUTOMATION);
    this.updateGuiAutomation(partial);
  }
  /** 仅在完整 GUI 自动化配置持久化成功后清理旧 YAML 字段。 */
  markLegacyGuiAutomationMigrated() {
    const daily = this.asRecord(this.rawRoot.daily_automation);
    if (!daily)
      return;
    for (const key of LEGACY_DAILY_KEYS)
      delete daily[key];
    this.legacyGuiAutomation = this.readLegacyGuiAutomation(daily);
  }
  /**
   * 仅清理已经由主进程写入并回读确认的旧版决战字段。
   * 未迁移或格式异常的字段继续由 rawRoot 原样写回 YAML。
   */
  markLegacyDecisiveAutomationMigrated(settings) {
    const daily = this.asRecord(this.rawRoot.daily_automation);
    if (!daily)
      return;
    if (Object.prototype.hasOwnProperty.call(settings, "autoDecisive")) {
      delete daily.auto_decisive;
    }
    if (Object.prototype.hasOwnProperty.call(settings, "ticketReserve")) {
      delete daily.decisive_ticket_reserve;
    }
    if (Object.prototype.hasOwnProperty.call(settings, "templateId")) {
      delete daily.decisive_template_id;
    }
    this.legacyDecisiveAutomation = this.readLegacyDecisiveAutomation(daily);
  }
  asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  mergeSection(raw, values, stringMapKeys = []) {
    const output = structuredClone(this.asRecord(raw) ?? {});
    for (const [key, value] of Object.entries(values)) {
      if (value === void 0) {
        delete output[key];
      } else if (stringMapKeys.includes(key)) {
        output[key] = this.mergeStringMap(output[key], value);
      } else {
        const nested = this.asRecord(value);
        output[key] = nested ? this.mergeSection(output[key], nested) : structuredClone(value);
      }
    }
    return output;
  }
  /** 合并动态字符串映射，同时保留 GUI 无法识别的扩展值。 */
  mergeStringMap(raw, value) {
    const rawEntries = this.asRecord(raw) ?? {};
    const current = this.asRecord(value) ?? {};
    const output = structuredClone(rawEntries);
    for (const [key, rawValue] of Object.entries(rawEntries)) {
      if (typeof rawValue === "string" && !Object.prototype.hasOwnProperty.call(current, key)) {
        delete output[key];
      }
    }
    for (const [key, currentValue] of Object.entries(current)) {
      if (currentValue === void 0) {
        delete output[key];
      } else {
        output[key] = structuredClone(currentValue);
      }
    }
    return output;
  }
  clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number))
      return fallback;
    return Math.max(min, Math.min(max, number));
  }
  stringList(value) {
    if (!Array.isArray(value))
      return [];
    return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  stringMap(value) {
    const record = this.asRecord(value);
    if (!record)
      return {};
    const output = {};
    for (const [key, item] of Object.entries(record)) {
      if (typeof item === "string" && key.trim() && item.trim()) {
        output[key.trim()] = item.trim();
      }
    }
    return output;
  }
  normalFightTasks(value) {
    if (!Array.isArray(value))
      return [];
    const output = [];
    for (const item of value) {
      if (typeof item === "string" && item.trim()) {
        output.push({ name: item.trim() });
        continue;
      }
      if (Array.isArray(item) && item.length > 0) {
        const name = String(item[0] ?? "").trim();
        if (!name)
          continue;
        const task2 = { name };
        if (item[1] != null && Number.isFinite(Number(item[1]))) {
          task2.fleet_id = Math.max(1, Math.trunc(Number(item[1])));
        }
        if (item[2] != null && Number.isFinite(Number(item[2]))) {
          task2.times = (0, NormalFightDailyQuota_js_1.normalFightDailyLimit)(item[2]);
        }
        output.push(task2);
        continue;
      }
      const record = this.asRecord(item);
      if (!record || typeof record.name !== "string" || !record.name.trim())
        continue;
      const task = { name: record.name.trim() };
      if (record.source === "system" || record.source === "user") {
        task.source = record.source;
      }
      if (record.fleet_id != null && Number.isFinite(Number(record.fleet_id))) {
        task.fleet_id = Math.max(1, Math.trunc(Number(record.fleet_id)));
      }
      if (record.fleet_preset_index != null && Number.isFinite(Number(record.fleet_preset_index))) {
        task.fleet_preset_index = Math.max(0, Math.trunc(Number(record.fleet_preset_index)));
      }
      if (record.times != null && Number.isFinite(Number(record.times))) {
        task.times = (0, NormalFightDailyQuota_js_1.normalFightDailyLimit)(record.times);
      }
      output.push(task);
    }
    return output;
  }
  readLegacyGuiAutomation(daily) {
    const output = {};
    if (Number.isFinite(Number(daily.expedition_interval))) {
      output.expeditionInterval = Number(daily.expedition_interval);
    }
    if (Number.isFinite(Number(daily.battle_times))) {
      output.battleTimes = Number(daily.battle_times);
    }
    if (typeof daily.auto_loot === "boolean")
      output.autoLoot = daily.auto_loot;
    if (typeof daily.loot_plan_id === "string") {
      const migrated = (0, lootPlans_js_1.migrateLootPlanId)(daily.loot_plan_id);
      if (migrated) {
        output.lootPlanSource = "system";
        output.lootPlanId = migrated;
      } else {
        output.autoLoot = false;
      }
    } else if (Object.prototype.hasOwnProperty.call(daily, "loot_plan_index")) {
      const resolved = (0, lootPlans_js_1.lootPlanIdFromIndex)(daily.loot_plan_index, lootPlans_js_1.LEGACY_LOOT_PLAN_IDS);
      if (resolved) {
        output.lootPlanSource = "system";
        output.lootPlanId = resolved;
      } else
        output.autoLoot = false;
    }
    if (output.autoLoot === true && !output.lootPlanId) {
      output.autoLoot = false;
    }
    if (Number.isFinite(Number(daily.loot_stop_count))) {
      output.lootStopCount = Number(daily.loot_stop_count);
    }
    return output;
  }
  /** 读取可安全迁移的旧决战值，并记录必须原样保留的异常字段。 */
  readLegacyDecisiveAutomation(daily) {
    const output = {};
    const invalid = [];
    if (Object.prototype.hasOwnProperty.call(daily, "auto_decisive")) {
      if (typeof daily.auto_decisive === "boolean") {
        output.autoDecisive = daily.auto_decisive;
      } else {
        invalid.push("auto_decisive");
      }
    }
    if (Object.prototype.hasOwnProperty.call(daily, "decisive_ticket_reserve")) {
      const raw = daily.decisive_ticket_reserve;
      const numericString = typeof raw === "string" && raw.trim();
      if (typeof raw === "number" && Number.isFinite(raw) || numericString && Number.isFinite(Number(raw))) {
        output.ticketReserve = Number(raw);
      } else {
        invalid.push("decisive_ticket_reserve");
      }
    }
    if (Object.prototype.hasOwnProperty.call(daily, "decisive_template_id")) {
      if (typeof daily.decisive_template_id === "string" && daily.decisive_template_id.length > 0) {
        output.templateId = daily.decisive_template_id;
      } else {
        invalid.push("decisive_template_id");
      }
    }
    this.invalidLegacyDecisiveFields = invalid;
    return output;
  }
  destroyMode(value) {
    const aliases = {
      "\u4E0D\u542F\u7528": 0,
      disable: 0,
      "\u9ED1\u540D\u5355": 1,
      include: 1,
      "\u767D\u540D\u5355": 2,
      exclude: 2
    };
    if (typeof value === "string" && value.trim() in aliases) {
      return aliases[value.trim()];
    }
    const number = Math.trunc(Number(value));
    return [0, 1, 2].includes(number) ? number : 0;
  }
};
exports.ConfigModel = ConfigModel;