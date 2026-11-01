"use strict";
/**
 * 保存由 main.ts 注入的 Python 环境上下文和路径缓存。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPythonEnv = initPythonEnv;
exports.getCtx = getCtx;
exports.clearPythonCache = clearPythonCache;
exports.getCachedPythonCmd = getCachedPythonCmd;
exports.setCachedPythonCmd = setCachedPythonCmd;
let ctx;
function initPythonEnv(context) {
    ctx = context;
}
/** 获取已注入的 Python 环境上下文。 */
function getCtx() {
    return ctx;
}
// Python 路径缓存
/** 缓存的 Python 路径，undefined 表示尚未查找。 */
let cachedPythonCmd;
/** 清除 Python 路径缓存。 */
function clearPythonCache() {
    cachedPythonCmd = undefined;
}
function getCachedPythonCmd() {
    return cachedPythonCmd;
}
function setCachedPythonCmd(value) {
    cachedPythonCmd = value;
}
