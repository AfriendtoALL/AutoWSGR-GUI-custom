"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketTransport = void 0;
exports.createHttpTransport = createHttpTransport;
exports.readApiToken = readApiToken;
function formatDetailMessage(detail) {
  if (typeof detail === "string")
    return detail.trim();
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (!item || typeof item !== "object")
        return String(item);
      const loc = Array.isArray(item.loc) ? item.loc.map(String).join(".") : "request";
      const msg = typeof item.msg === "string" ? item.msg : "\u53C2\u6570\u6821\u9A8C\u5931\u8D25";
      return `${loc}: ${msg}`;
    }).filter(Boolean).join("; ");
  }
  if (detail && typeof detail === "object") {
    for (const key of ["message", "error", "detail"]) {
      const value = detail[key];
      if (typeof value === "string" && value.trim())
        return value.trim();
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return "";
}
function normalizeHttpFailure(payload, status) {
  const body = payload && typeof payload === "object" ? payload : {};
  const detail = body.detail ?? body;
  let errorCode = body.error_code;
  if (!errorCode && detail && typeof detail === "object")
    errorCode = detail.error_code;
  return {
    success: false,
    data: body.data ?? null,
    message: body.message ?? null,
    error: typeof body.error === "string" && body.error.trim() ? body.error.trim() : formatDetailMessage(detail) || `HTTP ${status}`,
    error_code: errorCode || `http_${status}`,
    status,
    detail
  };
}
var apiTokenPromise = null;
/** 6.1/R17：从 preload 读取后端 token，只解析一次；失败降级为空串。 */
function readApiToken() {
  if (!apiTokenPromise) {
    const bridge = typeof window === "undefined" ? void 0 : window.electronBridge;
    apiTokenPromise = Promise.resolve(bridge?.getApiToken?.()).then((token) => typeof token === "string" ? token : "").catch(() => "");
  }
  return apiTokenPromise;
}
function createHttpTransport(baseUrl) {
  return {
    async request(method, path, body, timeoutMs) {
      const token = await readApiToken();
      const headers = {};
      if (body !== void 0)
        headers["Content-Type"] = "application/json";
      if (token)
        headers.Authorization = `Bearer ${token}`;
      const init = {
        method,
        headers,
        body: body === void 0 ? void 0 : JSON.stringify(body)
      };
      let timeoutTimer = null;
      if (timeoutMs) {
        const controller = new AbortController();
        init.signal = controller.signal;
        timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);
      }
      try {
        const response = await fetch(`${baseUrl}${path}`, init);
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!response.ok) {
          return normalizeHttpFailure(payload, response.status);
        }
        return payload;
      } finally {
        // 6.10/R33：成功 / 失败 / 超时 abort 三条路径都要清定时器，
        // 否则挂机时每发一个请求就留下一个未触发的定时器句柄。
        if (timeoutTimer !== null) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      }
    }
  };
}
exports.webSocketTransport = {
  connect(url, handlers) {
    const socket = new WebSocket(url);
    socket.onmessage = (event) => handlers.onMessage(String(event.data));
    socket.onopen = () => handlers.onOpen?.();
    socket.onclose = () => handlers.onClose?.();
    socket.onerror = () => handlers.onError?.();
    return socket;
  }
};