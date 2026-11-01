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
exports.buildLegacyMigrationNotice = buildLegacyMigrationNotice;
/**
 * 构造旧版数据迁移完成后的用户提示。
 */
const path = __importStar(require("path"));
/** 本次没有实际迁移项时不重复打扰用户。 */
function buildLegacyMigrationNotice(summary) {
    if (!summary.detected || summary.total === 0)
        return null;
    const failedNames = summary.failedFiles
        .slice(0, 10)
        .map(file => path.basename(file));
    const hiddenFailureCount = Math.max(0, summary.failedFiles.length - failedNames.length);
    const failureDetail = failedNames.length > 0
        ? [
            '',
            '失败文件：',
            ...failedNames.map(file => `- ${file}`),
            ...(hiddenFailureCount > 0
                ? [`- 另有 ${hiddenFailureCount} 个文件`]
                : []),
        ]
        : [];
    return {
        type: summary.failed > 0 ? 'warning' : 'info',
        title: '旧版数据迁移完成',
        message: [
            `当前已迁移旧版数据：${summary.total} 项`,
            `成功：${summary.succeeded} 项`,
            `失败：${summary.failed} 项`,
        ].join('\n'),
        detail: [
            '旧版原始文件均已保留。',
            '迁移失败的文件仍位于旧版本原始目录，下次启动时会继续尝试。',
            ...failureDetail,
        ].join('\n'),
        buttons: ['确定'],
    };
}
