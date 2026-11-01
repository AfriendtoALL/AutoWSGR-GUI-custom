"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
var DEFAULT_BASE_URL = "http://localhost:8438";
var WS_RECONNECT_DELAY = 3e3;
var Logger_1 = require_Logger();
var index_js_1 = require_adapter();
var ApiClient = class _ApiClient {
  constructor(baseUrl = DEFAULT_BASE_URL, http = (0, index_js_1.createHttpTransport)(baseUrl), ws = index_js_1.webSocketTransport) {
    this.wsLog = null;
    this.wsTask = null;
    this.shouldReconnectWebSockets = false;
    this.callbacks = {};
    this.reconnectTimers = {};
    this.baseUrl = baseUrl;
    this.http = http;
    this.ws = ws;
  }
  setCallbacks(cb) {
    this.callbacks = cb;
  }
  // ── HTTP 方法 ──
  async request(method, path, body, timeoutMs) {
    Logger_1.Logger.debug(`HTTP ${method} ${path}${body ? " body=" + index_js_1.jsonCodec.stringify(body) : ""}`, "api");
    const payload = await this.http.request(method, path, body, timeoutMs);
    const legacyProbe = path === "/api/task/start" && _ApiClient.shouldRetryTaskStartWithLegacyPayload(payload);
    if (payload && payload.success === false && Number(payload.status) >= 400 && !legacyProbe) {
      Logger_1.Logger.error(
        `[API] ${method} ${path} \u5931\u8D25 (${payload.status}) [${payload.error_code ?? "unknown"}]\uFF1A${payload.error ?? "\u672A\u77E5\u9519\u8BEF"}`,
        "api"
      );
    }
    return payload;
  }
  // ── 系统管理 ──
  async systemStart(configPath, timeoutMs) {
    return this.request("POST", "/api/system/start", {
      config_path: configPath ?? null
    }, timeoutMs);
  }
  async systemStop() {
    return this.request("POST", "/api/system/stop");
  }
  async systemStatus() {
    return this.request("GET", "/api/system/status");
  }
  /** 当前没有生产调用方引用，保留给模拟器设备选择功能。 */
  async emulatorDevices() {
    return this.request("GET", "/api/system/emulator/devices", void 0, 15e3);
  }
  // ── 任务执行 ──
  static formatValidationDetail(detail) {
    if (typeof detail === "string" && detail.trim())
      return detail.trim();
    if (!Array.isArray(detail))
      return "\u4EFB\u52A1\u542F\u52A8\u5931\u8D25";
    const parts = detail.map((item) => {
      const row = item;
      const loc = Array.isArray(row.loc) ? row.loc.map(String).join(".") : "request";
      const msg = typeof row.msg === "string" ? row.msg : "\u53C2\u6570\u6821\u9A8C\u5931\u8D25";
      return `${loc}: ${msg}`;
    }).filter(Boolean);
    return parts.length > 0 ? parts.join("; ") : "\u4EFB\u52A1\u542F\u52A8\u5931\u8D25";
  }
  static shouldRetryTaskStartWithLegacyPayload(payload) {
    const p = payload;
    if (!Array.isArray(p?.detail))
      return false;
    return p.detail.some((item) => {
      const row = item;
      if (row.type !== "extra_forbidden")
        return false;
      const loc = Array.isArray(row.loc) ? row.loc.map(String).join(".") : "";
      return loc.includes("fleet_rules") || loc.includes("long_missile_support");
    });
  }
  static makeLegacyTaskRequest(req) {
    const cloned = index_js_1.jsonCodec.parse(index_js_1.jsonCodec.stringify(req));
    const plan = cloned.plan;
    if (!plan)
      return cloned;
    delete plan.fleet_rules;
    if (plan.node_defaults) {
      delete plan.node_defaults.long_missile_support;
    }
    if (plan.node_args) {
      for (const nodeArg of Object.values(plan.node_args)) {
        if (!nodeArg)
          continue;
        delete nodeArg.long_missile_support;
      }
    }
    return cloned;
  }
  static normalizeTaskStartRequest(req) {
    const cloned = index_js_1.jsonCodec.parse(index_js_1.jsonCodec.stringify(req));
    if (!("plan" in cloned) || !cloned.plan)
      return cloned;
    const nodes = [
      cloned.plan.node_defaults,
      ...Object.values(cloned.plan.node_args ?? {})
    ];
    for (const node of nodes) {
      if (!node)
        continue;
      for (const rules of [node.enemy_rules, node.enemy_formation_rules]) {
        if (!Array.isArray(rules))
          continue;
        for (const rule of rules)
          rule[0] = rule[0].toUpperCase();
      }
    }
    return cloned;
  }
  static normalizeTaskStartResponse(payload) {
    const p = payload;
    if (typeof p?.success === "boolean")
      return p;
    return {
      success: false,
      error: _ApiClient.formatValidationDetail(p?.detail)
    };
  }
  async taskStart(req) {
    const normalizedReq = _ApiClient.normalizeTaskStartRequest(req);
    const first = await this.request("POST", "/api/task/start", normalizedReq);
    const firstNormalized = _ApiClient.normalizeTaskStartResponse(first);
    if (firstNormalized.success)
      return firstNormalized;
    if (!_ApiClient.shouldRetryTaskStartWithLegacyPayload(first)) {
      return firstNormalized;
    }
    const legacyReq = _ApiClient.makeLegacyTaskRequest(normalizedReq);
    Logger_1.Logger.warn("\u68C0\u6D4B\u5230\u540E\u7AEF schema \u4E0D\u652F\u6301\u65B0\u5B57\u6BB5\uFF0C\u672C\u6B21\u8BF7\u6C42\u56DE\u9000\u4E3A\u517C\u5BB9\u8D1F\u8F7D\u91CD\u8BD5\u4E00\u6B21", "api");
    const retried = await this.request("POST", "/api/task/start", legacyReq);
    return _ApiClient.normalizeTaskStartResponse(retried);
  }
  async taskStop() {
    return this.request("POST", "/api/task/stop");
  }
  async taskStatus() {
    return this.request("GET", "/api/task/status");
  }
  // ── 远征收取 ──
  async expeditionCheck() {
    return this.request("POST", "/api/expedition/check");
  }
  async expeditionAutoCheck() {
    return this.request("POST", "/api/expedition/auto_check");
  }
  // ── 游戏状态查询 ──
  async gameContext() {
    return this.request("GET", "/api/game/context");
  }
  async gameAcquisition() {
    return this.request("GET", "/api/game/acquisition");
  }
  // ── 操作端点 ──
  async buildCollect() {
    return this.request("POST", "/api/build/collect");
  }
  /** 当前没有生产调用方引用，保留给建造启动功能。 */
  async buildStart(fuel = 30, ammo = 30, steel = 30, bauxite = 30) {
    return this.request("POST", "/api/build/start", { fuel, ammo, steel, bauxite });
  }
  async rewardCollect() {
    return this.request("POST", "/api/reward/collect");
  }
  async cook(position = 1) {
    return this.request("POST", "/api/cook", { position });
  }
  /** 当前没有生产调用方引用，保留给批量解体功能。 */
  async destroy(shipTypes, removeEquipment = true) {
    return this.request("POST", "/api/destroy", { ship_types: shipTypes ?? null, remove_equipment: removeEquipment });
  }
  // ── 健康检查 ──
  async health() {
    return this.request("GET", "/api/health");
  }
  // ── WebSocket ──
  connectWebSockets() {
    this.shouldReconnectWebSockets = true;
    this.connectLogWs();
    this.connectTaskWs();
  }
  disconnectWebSockets() {
    this.shouldReconnectWebSockets = false;
    clearTimeout(this.reconnectTimers.log);
    clearTimeout(this.reconnectTimers.task);
    this.reconnectTimers = {};
    this.wsLog?.close();
    this.wsTask?.close();
    this.wsLog = null;
    this.wsTask = null;
  }
  wsBaseUrl() {
    return this.baseUrl.replace(/^http/, "ws");
  }
  /** 6.1/R17：WebSocket 不能自定义请求头，token 走 ?token=。 */
  wsUrl(path, token) {
    return `${this.wsBaseUrl()}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  }
  async connectLogWs() {
    if (!this.shouldReconnectWebSockets)
      return;
    if (this.wsLog && (this.wsLog.readyState === WebSocket.OPEN || this.wsLog.readyState === WebSocket.CONNECTING))
      return;
    try {
      const token = await (0, index_js_1.readApiToken)();
      if (!this.shouldReconnectWebSockets)
        return;
      if (this.wsLog && (this.wsLog.readyState === WebSocket.OPEN || this.wsLog.readyState === WebSocket.CONNECTING))
        return;
      this.wsLog = this.ws.connect(this.wsUrl("/ws/logs", token), {
        onMessage: (data) => {
          try {
            const msg = index_js_1.jsonCodec.parse(data);
            if (msg.type === "log" && this.callbacks.onLog)
              this.callbacks.onLog(msg);
          } catch {
            Logger_1.Logger.debug("WS /logs: malformed message", "api");
          }
        },
        onOpen: () => {
          Logger_1.Logger.debug("WS /logs connected", "api");
          this.callbacks.onWsStatusChange?.(true);
        },
        onClose: () => {
          this.callbacks.onWsStatusChange?.(false);
          if (!this.shouldReconnectWebSockets)
            return;
          Logger_1.Logger.debug("WS /logs disconnected, reconnect in 3s", "api");
          this.reconnectTimers.log = setTimeout(() => this.connectLogWs(), WS_RECONNECT_DELAY);
        },
        onError: () => this.wsLog?.close()
      });
    } catch {
      if (this.shouldReconnectWebSockets) {
        this.reconnectTimers.log = setTimeout(() => this.connectLogWs(), WS_RECONNECT_DELAY);
      }
    }
  }
  async connectTaskWs() {
    if (!this.shouldReconnectWebSockets)
      return;
    if (this.wsTask && (this.wsTask.readyState === WebSocket.OPEN || this.wsTask.readyState === WebSocket.CONNECTING))
      return;
    try {
      const token = await (0, index_js_1.readApiToken)();
      if (!this.shouldReconnectWebSockets)
        return;
      if (this.wsTask && (this.wsTask.readyState === WebSocket.OPEN || this.wsTask.readyState === WebSocket.CONNECTING))
        return;
      this.wsTask = this.ws.connect(this.wsUrl("/ws/task", token), {
        onMessage: (data) => {
          try {
            const msg = index_js_1.jsonCodec.parse(data);
            if (msg.type === "task_update" && this.callbacks.onTaskUpdate)
              this.callbacks.onTaskUpdate(msg);
            else if (msg.type === "task_completed" && this.callbacks.onTaskCompleted)
              this.callbacks.onTaskCompleted(msg);
            else if (msg.type === "loot_update" && this.callbacks.onLootUpdate)
              this.callbacks.onLootUpdate(msg);
            else if (msg.type === "ui_state_update" && this.callbacks.onUiStateUpdate)
              this.callbacks.onUiStateUpdate(msg);
          } catch {
            Logger_1.Logger.debug("WS /task: malformed message", "api");
          }
        },
        onClose: () => {
          if (!this.shouldReconnectWebSockets)
            return;
          Logger_1.Logger.debug("WS /task disconnected, reconnect in 3s", "api");
          this.reconnectTimers.task = setTimeout(() => this.connectTaskWs(), WS_RECONNECT_DELAY);
        },
        onError: () => this.wsTask?.close()
      });
    } catch {
      if (this.shouldReconnectWebSockets) {
        this.reconnectTimers.task = setTimeout(() => this.connectTaskWs(), WS_RECONNECT_DELAY);
      }
    }
  }
};
exports.ApiClient = ApiClient;