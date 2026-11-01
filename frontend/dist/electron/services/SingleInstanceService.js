"use strict";
/**
 * 管理 Electron 单实例锁和重复启动时的窗口聚焦。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SingleInstanceService = void 0;
/** 保证迁移、环境安装和窗口生命周期只由一个进程执行。 */
class SingleInstanceService {
    constructor(application) {
        this.application = application;
        this.primary = false;
        this.mainWindowProvider = () => null;
        this.duplicateLaunchHandler = () => false;
    }
    /** 尝试获取系统单实例锁；次实例直接退出。 */
    acquire() {
        if (this.primary)
            return true;
        if (!this.application.requestSingleInstanceLock()) {
            this.application.exit(0);
            return false;
        }
        this.primary = true;
        this.application.on('second-instance', () => {
            if (this.duplicateLaunchHandler())
                return;
            this.focusMainWindow();
        });
        return true;
    }
    setMainWindowProvider(provider) {
        this.mainWindowProvider = provider;
    }
    /** 安装期间可拦截重复启动，并由主实例显示更新提示。 */
    setDuplicateLaunchHandler(handler) {
        this.duplicateLaunchHandler = handler;
    }
    focusMainWindow() {
        const window = this.mainWindowProvider();
        if (!window || window.isDestroyed())
            return;
        if (window.isMinimized())
            window.restore();
        window.show();
        window.focus();
    }
}
exports.SingleInstanceService = SingleInstanceService;
