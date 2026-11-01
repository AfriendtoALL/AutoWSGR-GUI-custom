"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yamlCodec = void 0;
exports.parseYamlRecord = parseYamlRecord;
exports.formatStringMap = formatStringMap;
exports.parseStringMap = parseStringMap;
var yamlSerializer_1 = require_yamlSerializer();
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
exports.yamlCodec = {
  parse(content) {
    return (0, yamlSerializer_1.parseYaml)(content);
  },
  stringify(value, options) {
    return (0, yamlSerializer_1.serializeYaml)(value, options);
  }
};
function parseYamlRecord(content, label = "YAML \u6587\u6863") {
  const parsed = exports.yamlCodec.parse(content);
  if (!isRecord(parsed)) {
    throw new Error(`${label}\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61`);
  }
  return parsed;
}
function formatStringMap(value) {
  if (Object.keys(value).length === 0)
    return "";
  return exports.yamlCodec.stringify(value, { lineWidth: -1, noRefs: true }).trim();
}
function parseStringMap(source, label) {
  if (!source.trim())
    return {};
  let parsed;
  try {
    parsed = exports.yamlCodec.parse(source);
  } catch (error) {
    return parseLineStringMap(source, label, error);
  }
  if (!isRecord(parsed)) {
    return parseLineStringMap(source, label);
  }
  const output = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.trim() || typeof value !== "string" || !value.trim()) {
      throw new Error(`${label}\u4E2D\u7684\u952E\u548C\u503C\u90FD\u5FC5\u987B\u662F\u975E\u7A7A\u6587\u5B57`);
    }
    output[key.trim()] = value.trim();
  }
  return output;
}
function parseLineStringMap(source, label, yamlError) {
  const output = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#"))
      continue;
    const separator = line.indexOf(":");
    const key = separator >= 0 ? line.slice(0, separator).trim() : "";
    const value = separator >= 0 ? line.slice(separator + 1).trim() : "";
    if (!key || !value) {
      const detail = yamlError instanceof Error ? `\uFF1A${yamlError.message}` : "";
      throw new Error(`${label}\u5FC5\u987B\u6BCF\u884C\u4F7F\u7528\u201C\u8BC6\u522B\u540D\u79F0:\u6807\u51C6\u540D\u79F0\u201D\u7684\u683C\u5F0F\uFF0C\u5192\u53F7\u4E24\u4FA7\u7A7A\u683C\u53EF\u7701\u7565${detail}`);
    }
    output[key] = value;
  }
  return output;
}