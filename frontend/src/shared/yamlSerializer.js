"use strict";
var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
  if (k2 === void 0) k2 = k;
  o[k2] = m[k];
}));
var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
  o["default"] = v;
});
var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
  var ownKeys = function(o) {
    ownKeys = Object.getOwnPropertyNames || function(o2) {
      var ar = [];
      for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
      return ar;
    };
    return ownKeys(o);
  };
  return function(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) {
      for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
    }
    __setModuleDefault(result, mod);
    return result;
  };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseYaml = parseYaml;
exports.serializeYaml = serializeYaml;
exports.serializePlanYaml = serializePlanYaml;
exports.serializeTeamYaml = serializeTeamYaml;
var yaml = __importStar(require_js_yaml());
var DEFAULT_DUMP_OPTIONS = {
  lineWidth: -1,
  noCompatMode: true,
  noRefs: true,
  sortKeys: false
};
function parseYaml(content) {
  return yaml.load(content);
}
function serializeYaml(value, options = {}) {
  return yaml.dump(value, {
    ...DEFAULT_DUMP_OPTIONS,
    ...options
  });
}
function isYamlMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isYamlScalar(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}
function dumpFlowYaml(value) {
  return serializeYaml(value, { flowLevel: 0 }).trimEnd();
}
function isShallowYamlMapping(value) {
  return Object.values(value).every((item) => isYamlScalar(item) || Array.isArray(item) && item.every(isYamlScalar));
}
function shouldInlineMapping(value, path) {
  if (!isShallowYamlMapping(value))
    return false;
  return path.length === 1 && path[0] === "node_defaults" || path.length === 2 && path[0] === "node_args";
}
function canInlineValue(value, path) {
  if (isYamlScalar(value))
    return true;
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isYamlScalar);
  }
  return isYamlMapping(value) && (Object.keys(value).length === 0 || shouldInlineMapping(value, path));
}
function serializeYamlSequence(values, indent, path) {
  const padding = " ".repeat(indent);
  const lines = [];
  const inlineMappings = path[path.length - 1] === "candidates";
  for (const value of values) {
    if (isYamlScalar(value) || Array.isArray(value) && value.every(isYamlScalar) || inlineMappings && isYamlMapping(value) && isShallowYamlMapping(value)) {
      lines.push(`${padding}- ${dumpFlowYaml(value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${padding}-`);
      lines.push(...serializeYamlSequence(value, indent + 2, [...path, "[]"]));
      continue;
    }
    if (isYamlMapping(value)) {
      const itemLines = serializeYamlMapping(value, indent + 2, [...path, "[]"]);
      if (itemLines.length === 0) {
        lines.push(`${padding}- {}`);
        continue;
      }
      const itemPadding = " ".repeat(indent + 2);
      lines.push(`${padding}- ${itemLines[0].slice(itemPadding.length)}`);
      lines.push(...itemLines.slice(1));
      continue;
    }
    lines.push(`${padding}- ${dumpFlowYaml(value)}`);
  }
  return lines;
}
function serializeYamlMapping(value, indent, path) {
  const padding = " ".repeat(indent);
  const lines = [];
  for (const [key, item] of Object.entries(value)) {
    if (item === void 0)
      continue;
    const itemPath = [...path, key];
    const yamlKey = dumpFlowYaml(key);
    if (canInlineValue(item, itemPath)) {
      lines.push(`${padding}${yamlKey}: ${dumpFlowYaml(item)}`);
      continue;
    }
    lines.push(`${padding}${yamlKey}:`);
    if (Array.isArray(item)) {
      lines.push(...serializeYamlSequence(item, indent + 2, itemPath));
    } else if (isYamlMapping(item)) {
      lines.push(...serializeYamlMapping(item, indent + 2, itemPath));
    } else {
      lines.push(`${" ".repeat(indent + 2)}${dumpFlowYaml(item)}`);
    }
  }
  return lines;
}
function serializeReadableYaml(value) {
  return `${serializeYamlMapping(value, 0, []).join("\n")}
`;
}
function serializePlanYaml(value) {
  return serializeReadableYaml(value);
}
function serializeTeamYaml(value) {
  return serializeReadableYaml(value);
}