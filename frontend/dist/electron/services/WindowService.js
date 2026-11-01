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
exports.WindowService = void 0;
const path = __importStar(require("path"));
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 720;
const MIN_WINDOW_WIDTH = 854;
const MIN_WINDOW_HEIGHT = 480;
const MAIN_PAGE_IDS = ['main', 'plan', 'config'];
/** 归一化最后活动页面，只接受主导航页面。 */
function normalizeLastActivePage(value) {
    return typeof value === 'string' && MAIN_PAGE_IDS.includes(value)
        ? value
        : 'main';
}
/** 创建窗口并管理窗口偏好、引用和边界持久化。 */
class WindowService {
    constructor(settings, dependencies) {
        this.settings = settings;
        this.dependencies = dependencies;
        this.mainWindow = null;
        this.lastWindowBounds = null;
        this.lastActivePage = null;
        this.initialPaintPromise = null;
        this.resolveInitialPaint = null;
        this.appPagePromise = null;
        this.resolveAppPage = null;
        this.appPageReady = false;
    }
    /** 返回当前主窗口；窗口销毁后返回 null。 */
    getMainWindow() {
        return this.mainWindow;
    }
    /** 仅在主窗口及其页面仍可用时向 Renderer 发送消息。 */
    sendToRenderer(channel, ...args) {
        const win = this.mainWindow;
        if (!win
            || win.isDestroyed()
            || win.webContents.isDestroyed()) {
            return false;
        }
        try {
            win.webContents.send(channel, ...args);
            return true;
        }
        catch (error) {
            if (win.isDestroyed()
                || win.webContents.isDestroyed()
                || (error instanceof Error
                    && error.message === 'Object has been destroyed')) {
                return false;
            }
            throw error;
        }
    }
    /** 读取并归一化默认窗口大小、边界记忆开关和最后活动页面。 */
    getPreferences() {
        const settings = this.settings.read();
        return {
            defaultWidth: this.normalizeWindowSize(settings.default_window_width, MIN_WINDOW_WIDTH, DEFAULT_WINDOW_WIDTH),
            defaultHeight: this.normalizeWindowSize(settings.default_window_height, MIN_WINDOW_HEIGHT, DEFAULT_WINDOW_HEIGHT),
            rememberBounds: settings.remember_window_bounds === true,
            lastActivePage: normalizeLastActivePage(settings.last_active_page),
        };
    }
    /** 写入归一化后的窗口偏好，并返回实际持久化结果。 */
    setPreferences(preferences) {
        const prepared = this.preparePreferences(preferences);
        this.settings.write(prepared.settingsPatch);
        return prepared.preferences;
    }
    /** 归一化窗口偏好并生成可参与批量配置提交的存储 patch。 */
    preparePreferences(preferences) {
        const current = this.getPreferences();
        const normalized = {
            defaultWidth: this.normalizeWindowSize(preferences?.defaultWidth, MIN_WINDOW_WIDTH, current.defaultWidth),
            defaultHeight: this.normalizeWindowSize(preferences?.defaultHeight, MIN_WINDOW_HEIGHT, current.defaultHeight),
            rememberBounds: preferences?.rememberBounds === true,
            lastActivePage: normalizeLastActivePage(preferences?.lastActivePage ?? current.lastActivePage),
        };
        return {
            preferences: normalized,
            settingsPatch: {
                default_window_width: normalized.defaultWidth,
                default_window_height: normalized.defaultHeight,
                remember_window_bounds: normalized.rememberBounds,
            },
        };
    }
    /** 记录用户当前所在页面，退出时随窗口状态一起持久化。 */
    rememberActivePage(pageId) {
        this.lastActivePage = normalizeLastActivePage(pageId);
    }
    /** 缓存最后一次正常窗口边界，供窗口销毁后的退出阶段使用。 */
    captureWindowBounds(win = this.mainWindow) {
        if (!win || win.isDestroyed())
            return;
        this.lastWindowBounds = win.getNormalBounds();
    }
    /** 仅在用户启用窗口记忆时写入最后一次正常窗口边界和活动页面。 */
    persistWindowBounds() {
        if (this.getPreferences().rememberBounds && this.lastWindowBounds) {
            this.settings.write({
                window_bounds: this.lastWindowBounds,
                last_active_page: this.lastActivePage
                    ?? this.getPreferences().lastActivePage,
            });
        }
    }
    /** 使用当前偏好创建并持有 Electron 主窗口；shell 模式先显示骨架页。 */
    createWindow(options = {}) {
        const preferences = this.getPreferences();
        const rememberedBounds = preferences.rememberBounds
            ? this.readRememberedWindowBounds()
            : null;
        const initialBounds = rememberedBounds
            && this.isWindowBoundsVisible(rememberedBounds)
            ? rememberedBounds
            : null;
        const win = this.dependencies.createBrowserWindow({
            width: initialBounds?.width ?? preferences.defaultWidth,
            height: initialBounds?.height ?? preferences.defaultHeight,
            x: initialBounds?.x,
            y: initialBounds?.y,
            center: initialBounds === null,
            minWidth: MIN_WINDOW_WIDTH,
            minHeight: MIN_WINDOW_HEIGHT,
            show: false,
            webPreferences: {
                preload: path.join(this.dependencies.moduleDirectory, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
            titleBarStyle: 'hiddenInset',
            backgroundColor: '#1a1a2e',
            icon: path.join(this.dependencies.resourceRoot(), 'resource', 'images', 'logo.png'),
        });
        const htmlPath = path.join(this.dependencies.getAppPath(), 'src', 'view', 'index.html');
        this.initialPaintPromise = new Promise((resolve) => {
            this.resolveInitialPaint = resolve;
        });
        this.appPagePromise = options.initialPage === 'shell'
            ? new Promise((resolve) => {
                this.resolveAppPage = resolve;
            })
            : null;
        this.appPageReady = false;
        win.__autowsgrAppPageReady = false;
        // 根据后端端口动态注入现有 CSP；shell 与主页面共用同一个 session。
        win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' file: data:; connect-src 'self' http://localhost:${this.dependencies.backendPort} ws://localhost:${this.dependencies.backendPort}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
                    ],
                },
            });
        });
        win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            const message = `Page load failed!\nCode: ${errorCode}\nDesc: ${errorDescription}\nURL: ${validatedURL}\nPath: ${htmlPath}`;
            console.error('[Main]', message);
            if (this.dependencies.isPackaged()) {
                this.dependencies.showMessageBox({
                    type: 'error',
                    title: 'Load Error',
                    message,
                });
            }
        });
        win.once('ready-to-show', () => {
            const resolve = this.resolveInitialPaint;
            this.resolveInitialPaint = null;
            resolve?.();
            if (win.isDestroyed())
                return;
            win.show();
            win.focus();
        });
        this.mainWindow = win;
        this.captureWindowBounds(win);
        win.on('move', () => this.captureWindowBounds(win));
        win.on('resize', () => this.captureWindowBounds(win));
        win.on('close', () => {
            this.captureWindowBounds(win);
            this.persistWindowBounds();
        });
        win.on('closed', () => {
            this.mainWindow = null;
            this.appPageReady = false;
            this.resolveInitialPaint = null;
            const resolveAppPage = this.resolveAppPage;
            this.resolveAppPage = null;
            resolveAppPage?.();
        });
        if (options.initialPage === 'shell') {
            void this.loadPage(win, this.shellPath()).catch(() => {
                const resolveAppPage = this.resolveAppPage;
                this.resolveAppPage = null;
                resolveAppPage?.();
            });
        }
        else {
            void this.loadApp();
        }
        return win;
    }
    /** 6.11b：两段式启动的极简骨架页。 */
    shellPath() {
        return path.join(this.dependencies.getAppPath(), 'src', 'view', 'boot.html');
    }
    /** 真实 UI 页面。 */
    appPath() {
        return path.join(this.dependencies.getAppPath(), 'src', 'view', 'index.html');
    }
    /** 加载单个 file:// 页面；失败时保留原错误对话框。 */
    loadPage(win, htmlPath) {
        return win.loadFile(htmlPath).catch((error) => {
            console.error('[Main] loadFile failed:', error);
            if (this.dependencies.isPackaged()) {
                this.dependencies.showMessageBox({
                    type: 'error',
                    title: 'loadFile Error',
                    message: `${error.message}\nPath: ${htmlPath}`,
                });
            }
            throw error;
        });
    }
    /** 把同一窗口导航到真实 UI；成功后才允许关窗前落盘等待。 */
    async loadApp() {
        const win = this.mainWindow;
        if (!win || win.isDestroyed())
            return false;
        this.appPageReady = false;
        win.__autowsgrAppPageReady = false;
        try {
            await this.loadPage(win, this.appPath());
            if (win.isDestroyed())
                return false;
            this.appPageReady = true;
            win.__autowsgrAppPageReady = true;
            return true;
        }
        finally {
            const resolve = this.resolveAppPage;
            this.resolveAppPage = null;
            resolve?.();
        }
    }
    /** 等 shell 的首帧（ready-to-show）；调用方负责超时兜底。 */
    waitForInitialPaint() {
        return this.initialPaintPromise ?? Promise.resolve();
    }
    /** 等 app 页 did-finish-load；调用方负责超时兜底。 */
    waitForAppPage() {
        return this.appPagePromise ?? Promise.resolve();
    }
    /** 当前窗口是否已经加载真实 UI（决定关窗前是否需要等 Renderer 落盘）。 */
    isAppPageReady() {
        return this.appPageReady;
    }
    /** 6.11b：在弹迁移询问等模态前先摘掉骨架。 */
    hideBootSkeleton() {
        const win = this.mainWindow;
        if (!win || win.isDestroyed())
            return false;
        const send = () => {
            if (!win.isDestroyed())
                win.webContents.send('app:hide-boot-skeleton');
        };
        if (win.webContents.isLoading())
            win.webContents.once('did-finish-load', send);
        else
            send();
        return true;
    }
    normalizeWindowSize(value, minimum, fallback) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return fallback;
        }
        return Math.max(minimum, Math.trunc(value));
    }
    readRememberedWindowBounds() {
        const raw = this.settings.read().window_bounds;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return null;
        const bounds = raw;
        if (typeof bounds.x !== 'number'
            || typeof bounds.y !== 'number'
            || !Number.isFinite(bounds.x)
            || !Number.isFinite(bounds.y)) {
            return null;
        }
        return {
            x: Math.trunc(bounds.x),
            y: Math.trunc(bounds.y),
            width: this.normalizeWindowSize(bounds.width, MIN_WINDOW_WIDTH, DEFAULT_WINDOW_WIDTH),
            height: this.normalizeWindowSize(bounds.height, MIN_WINDOW_HEIGHT, DEFAULT_WINDOW_HEIGHT),
        };
    }
    /** 至少保留一块可拖动区域，避免窗口完全落在屏幕外。 */
    isWindowBoundsVisible(bounds) {
        return this.dependencies.getDisplays().some(({ workArea }) => {
            const visibleWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
            const visibleHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
            return visibleWidth >= 160 && visibleHeight >= 80;
        });
    }
}
exports.WindowService = WindowService;
