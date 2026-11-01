"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseYaml = parseYaml;
exports.serializeYaml = serializeYaml;
exports.serializePlanYaml = serializePlanYaml;
exports.serializeTeamYaml = serializeTeamYaml;
/**
 * GUI 所有 YAML 文档的统一编解码入口。
 *
 * 解析统一交给 js-yaml，避免各业务模块直接依赖底层库。
 * 序列化分为通用、出征计划和舰队预设三种公开方法。
 * 通用方法交给 js-yaml，统一关闭引用并保留字段顺序。
 * 出征计划和舰队预设共用同一套可读性排版算法。
 * 简单的一维列表使用 `[A, B, C]`，减少无意义换行。
 * 二维规则列表保留外层分行，单条规则使用 `[条件, 结果]`。
 * `node_defaults` 和简单节点参数允许使用行内对象。
 * 舰队主选仍按字段分行，便于查看每个位置的完整要求。
 * `candidates` 中的单艘候选舰使用行内对象，避免文件过长。
 * 包含嵌套对象的数据继续使用块状语法，保证层级清楚。
 * 所有标量和值的引号均由 js-yaml 处理，避免手工转义错误。
 * 未知业务字段按原有顺序保留，不由格式化层擅自删除。
 * 所有专用文档都以换行符结尾，便于编辑器和版本管理。
 * 业务 Codec 只负责校验和字段取舍，不再自行拼接 YAML。
 */
const yaml = __importStar(require("js-yaml"));
const DEFAULT_DUMP_OPTIONS = {
    lineWidth: -1,
    noCompatMode: true,
    noRefs: true,
    sortKeys: false,
};
/** 通过统一入口解析 YAML 文档。 */
function parseYaml(content) {
    return yaml.load(content);
}
/** 使用全局默认选项序列化普通 YAML 数据。 */
function serializeYaml(value, options = {}) {
    return yaml.dump(value, {
        ...DEFAULT_DUMP_OPTIONS,
        ...options,
    });
}
function isYamlMapping(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isYamlScalar(value) {
    return value === null
        || ['string', 'number', 'boolean'].includes(typeof value);
}
/** 使用 YAML 流式语法输出单个值，不改变值本身。 */
function dumpFlowYaml(value) {
    return serializeYaml(value, { flowLevel: 0 }).trimEnd();
}
function isShallowYamlMapping(value) {
    return Object.values(value).every(item => (isYamlScalar(item)
        || (Array.isArray(item)
            && item.every(isYamlScalar))));
}
function shouldInlineMapping(value, path) {
    if (!isShallowYamlMapping(value))
        return false;
    return ((path.length === 1 && path[0] === 'node_defaults')
        || (path.length === 2 && path[0] === 'node_args'));
}
function canInlineValue(value, path) {
    if (isYamlScalar(value))
        return true;
    if (Array.isArray(value)) {
        return value.length === 0 || value.every(isYamlScalar);
    }
    return isYamlMapping(value) && (Object.keys(value).length === 0
        || shouldInlineMapping(value, path));
}
function serializeYamlSequence(values, indent, path) {
    const padding = ' '.repeat(indent);
    const lines = [];
    const inlineMappings = path[path.length - 1] === 'candidates';
    for (const value of values) {
        if (isYamlScalar(value)
            || (Array.isArray(value) && value.every(isYamlScalar))
            || (inlineMappings
                && isYamlMapping(value)
                && isShallowYamlMapping(value))) {
            lines.push(`${padding}- ${dumpFlowYaml(value)}`);
            continue;
        }
        if (Array.isArray(value)) {
            lines.push(`${padding}-`);
            lines.push(...serializeYamlSequence(value, indent + 2, [...path, '[]']));
            continue;
        }
        if (isYamlMapping(value)) {
            const itemLines = serializeYamlMapping(value, indent + 2, [...path, '[]']);
            if (itemLines.length === 0) {
                lines.push(`${padding}- {}`);
                continue;
            }
            const itemPadding = ' '.repeat(indent + 2);
            lines.push(`${padding}- ${itemLines[0].slice(itemPadding.length)}`);
            lines.push(...itemLines.slice(1));
            continue;
        }
        lines.push(`${padding}- ${dumpFlowYaml(value)}`);
    }
    return lines;
}
function serializeYamlMapping(value, indent, path) {
    const padding = ' '.repeat(indent);
    const lines = [];
    for (const [key, item] of Object.entries(value)) {
        if (item === undefined)
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
        }
        else if (isYamlMapping(item)) {
            lines.push(...serializeYamlMapping(item, indent + 2, itemPath));
        }
        else {
            lines.push(`${' '.repeat(indent + 2)}${dumpFlowYaml(item)}`);
        }
    }
    return lines;
}
function serializeReadableYaml(value) {
    return `${serializeYamlMapping(value, 0, []).join('\n')}\n`;
}
/** 序列化出征计划，并保证文件以换行符结束。 */
function serializePlanYaml(value) {
    return serializeReadableYaml(value);
}
/** 序列化舰队预设，并保证候选舰使用紧凑的行内对象。 */
function serializeTeamYaml(value) {
    return serializeReadableYaml(value);
}
