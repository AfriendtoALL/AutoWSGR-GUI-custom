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
exports.BACKEND_DISTRIBUTIONS = void 0;
exports.resolveBackendDistribution = resolveBackendDistribution;
exports.buildManagedAutowsgrRequirement = buildManagedAutowsgrRequirement;
/**
 * GUI 管理模式使用的 Stable/Alpha AutoWSGR 后端来源。
 *
 * 打包版本从 resources/backend-distribution.json 读取不可变发行清单。
 * 开发环境使用与发行包相同的双通道固定提交。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DEFAULT_DISTRIBUTIONS = {
    stable: {
        id: 'stable',
        repository: 'OpenWSGR/AutoWSGR',
        ref: 'main',
        commit: 'a5effbfc606794ec30fa8bfd2f8edd2cc15d3852',
        forceUpdateOnInstall: true,
    },
    alpha: {
        id: 'alpha',
        repository: 'ShiinaKuroko/AutoWSGR',
        ref: 'ShiinaKuroko',
        commit: '77f34b7b30d18f7b86cf736bdd5cf17ae35d5f78',
        forceUpdateOnInstall: true,
    },
};
/** 校验单个后端发行项，拒绝浮动或不完整来源。 */
function isBackendDistribution(value, id) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const raw = value;
    return (raw.id === id
        && typeof raw.repository === 'string'
        && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw.repository)
        && typeof raw.ref === 'string'
        && /^[A-Za-z0-9._/-]+$/.test(raw.ref)
        && typeof raw.commit === 'string'
        && /^[0-9a-f]{40}$/.test(raw.commit)
        && typeof raw.forceUpdateOnInstall === 'boolean');
}
/** 校验打包器写入的双通道清单，损坏时回退到开发默认值。 */
function readBackendDistributions() {
    const resourcesPath = process.resourcesPath;
    if (!resourcesPath)
        return DEFAULT_DISTRIBUTIONS;
    const manifestPath = path.join(resourcesPath, 'backend-distribution.json');
    try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (isBackendDistribution(raw.stable, 'stable')
            && isBackendDistribution(raw.alpha, 'alpha')) {
            return raw;
        }
    }
    catch {
        // 开发模式和旧包没有发行清单，继续使用已验证默认值。
    }
    return DEFAULT_DISTRIBUTIONS;
}
exports.BACKEND_DISTRIBUTIONS = readBackendDistributions();
/** 使用与 GUI 更新通道相同的设置选择受管后端。 */
function resolveBackendDistribution(allowTestUpdates) {
    return allowTestUpdates
        ? exports.BACKEND_DISTRIBUTIONS.alpha
        : exports.BACKEND_DISTRIBUTIONS.stable;
}
/** 生成固定提交归档地址，禁止运行时跟随浮动分支。 */
function buildManagedAutowsgrRequirement(distribution) {
    return (`https://github.com/${distribution.repository}/archive/`
        + `${distribution.commit}.zip`);
}
