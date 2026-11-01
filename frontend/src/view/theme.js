"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThemeMode = getThemeMode;
exports.getAccentColor = getAccentColor;
exports.setThemeFromYaml = setThemeFromYaml;
exports.previewTheme = previewTheme;
exports.applyTheme = applyTheme;
exports.watchSystemTheme = watchSystemTheme;
var StorageAdapter_1 = require_StorageAdapter();
/** 7.6/R35: theme value loaded from usersettings.yaml; localStorage is first-paint fallback only. */
var yamlThemeMode = null;
var yamlAccentColor = null;
var previewThemeMode = null;
var previewAccentColor = null;
function validThemeMode(mode) {
  return mode === "light" || mode === "dark" || mode === "system";
}
function validAccentColor(color) {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
}
/** YAML 加载/保存后调用；清除设置页未保存的即时预览。 */
function setThemeFromYaml(mode, accent) {
  yamlThemeMode = validThemeMode(mode) ? mode : null;
  yamlAccentColor = validAccentColor(accent) ? accent : null;
  previewThemeMode = null;
  previewAccentColor = null;
}
/** 设置页未保存时的即时预览；保存后由 setThemeFromYaml 清除。 */
function previewTheme(mode, accent) {
  if (validThemeMode(mode))
    previewThemeMode = mode;
  if (validAccentColor(accent))
    previewAccentColor = accent;
}
function getThemeMode() {
  if (previewThemeMode !== null)
    return previewThemeMode;
  if (yamlThemeMode !== null)
    return yamlThemeMode;
  const mode = StorageAdapter_1.browserStorageStore.get("themeMode");
  return mode === "dark" || mode === "system" ? mode : "light";
}
function getAccentColor() {
  if (previewAccentColor !== null)
    return previewAccentColor;
  if (yamlAccentColor !== null)
    return yamlAccentColor;
  const accent = StorageAdapter_1.browserStorageStore.get("accentColor") || "#0f7dff";
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#0f7dff";
}
function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return {
    r: value >> 16,
    g: value >> 8 & 255,
    b: value & 255
  };
}
function tintColor(hex, target, ratio) {
  const rgb = hexToRgb(hex);
  const channel = (value2) => Math.round(value2 + (target - value2) * ratio);
  const value = channel(rgb.r) << 16 | channel(rgb.g) << 8 | channel(rgb.b);
  return `#${value.toString(16).padStart(6, "0")}`;
}
function getAccentForeground({ r, g, b }) {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#172033" : "#ffffff";
}
function applyTheme() {
  const mode = getThemeMode();
  const resolved = mode === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  const accent = getAccentColor();
  const rgb = hexToRgb(accent);
  const hover = tintColor(accent, resolved === "light" ? 0 : 255, resolved === "light" ? 0.14 : 0.16);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-hover", hover);
  document.documentElement.style.setProperty("--accent-foreground", getAccentForeground(rgb));
  document.documentElement.style.setProperty("--accent-glow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${resolved === "light" ? 0.2 : 0.18})`);
  document.documentElement.style.setProperty("--accent-subtle", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${resolved === "light" ? 0.12 : 0.09})`);
}
function watchSystemTheme() {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemeMode() === "system")
      applyTheme();
  });
}