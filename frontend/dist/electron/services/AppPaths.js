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
exports.AppPaths = void 0;
/**
 * 集中提供应用、资源和用户数据目录。
 */
const path = __importStar(require("path"));
/** 集中计算主进程使用的应用、资源和用户数据路径。 */
class AppPaths {
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    /** 是否处于打包后的生产模式。 */
    isPackaged() {
        return this.dependencies.isPackaged();
    }
    /** 返回开发项目根目录或打包后的可执行文件目录。 */
    appRoot() {
        if (this.isPackaged()) {
            return path.dirname(this.dependencies.getPath('exe'));
        }
        return path.join(this.dependencies.moduleDirectory, '..', '..');
    }
    /** extraResources 根目录。 */
    resourceRoot() {
        if (this.isPackaged()) {
            return this.dependencies.getResourcesPath();
        }
        return path.join(this.dependencies.moduleDirectory, '..', '..');
    }

    /**
     * Install-layout data root (``resources/resource``).
     * 7b added this method for AUTOWSGR_* env injection; the packaged asar was
     * still carrying the old AppPaths.js, so every backend start failed with
     * ``appPaths.resourceDataRoot is not a function`` during 4.5 real-machine
     * acceptance. Kept here verbatim with the other path helpers.
     */
    resourceDataRoot() {
        return path.join(this.resourceRoot(), 'resource');
    }
    /** Electron 管理的用户数据根目录。 */
    userDataRoot() {
        return this.dependencies.getPath('userData');
    }
    /** 内置只读作战计划目录。 */
    systemBattlePlansDir() {
        return path.join(this.resourceRoot(), 'resource', 'system_battle_plans');
    }
    /** GUI 管理的用户作战计划目录。 */
    userBattlePlansDir() {
        return path.join(this.userDataRoot(), 'user_battle_plans');
    }
    /** 内置只读日常任务计划目录。 */
    systemDailyPlansDir() {
        return path.join(this.resourceRoot(), 'resource', 'system_daily_plans');
    }
    /** GUI 管理的用户日常任务计划目录。 */
    userDailyPlansDir() {
        return path.join(this.userDataRoot(), 'user_daily_plans');
    }
    /** 内置只读编队计划目录。 */
    systemTeamPlansDir() {
        return path.join(this.resourceRoot(), 'resource', 'system_team_plans');
    }
    /** GUI 管理的用户编队计划目录。 */
    userTeamPlansDir() {
        return path.join(this.userDataRoot(), 'user_team_plans');
    }
}
exports.AppPaths = AppPaths;
