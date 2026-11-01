"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 通过 contextBridge 向渲染进程安全暴露 IPC 方法。
 */
const electron_1 = require("electron");
/**
 * 6.4/R34：订阅型通道统一返回退订函数；调用方在重新初始化前必须释放
 * 旧订阅，否则同一个事件会被注册多份，日志面板就会重复打印。
 */
function subscribe(channel, callback) {
    const listener = (_event, payload) => callback(payload);
    electron_1.ipcRenderer.on(channel, listener);
    return () => {
        electron_1.ipcRenderer.removeListener(channel, listener);
    };
}
/**
 * 6.11b/R36：主进程在弹迁移询问前会要求先摘掉骨架。
 * preload 直接操作 DOM，避免等待 renderer bundle 完成初始化。
 */
electron_1.ipcRenderer.on('app:hide-boot-skeleton', () => {
    document.getElementById('boot-skeleton')?.remove();
});
const electronBridge = {
    /** 6.11b/R36：等主进程完成旧数据/计划迁移后再读运行时配置。 */
    waitStartupReady: () => {
        return electron_1.ipcRenderer.invoke('wait-startup-ready');
    },
    /** 6.1/R17：渲染层用它在 /api/* 与 WebSocket 上带 API token。 */
    getApiToken: () => {
        return electron_1.ipcRenderer.invoke('get-api-token');
    },
    getAppVersion: () => {
        return electron_1.ipcRenderer.invoke('get-app-version-sync');
    },
    getBackendPort: () => {
        return electron_1.ipcRenderer.invoke('get-backend-port-sync');
    },
    getGuiLogRoot: () => {
        return electron_1.ipcRenderer.invoke('get-gui-log-root-sync');
    },
    getBackendStartupMode: () => {
        return electron_1.ipcRenderer.invoke('get-backend-startup-mode-sync');
    },
    getBackendRepoPath: () => {
        return electron_1.ipcRenderer.invoke('get-backend-repo-path-sync');
    },
    getOcrGpuMode: () => {
        return electron_1.ipcRenderer.invoke('get-ocr-gpu-mode-sync');
    },
    getCudaPath: () => {
        return electron_1.ipcRenderer.invoke('get-cuda-path-sync');
    },
    getSaveBackendScreenshots: () => {
        return electron_1.ipcRenderer.invoke('get-save-backend-screenshots-sync');
    },
    getWindowPreferences: () => {
        return electron_1.ipcRenderer.invoke('get-window-preferences-sync');
    },
    rememberActivePage: (pageId) => {
        return electron_1.ipcRenderer.invoke('set-last-active-page', pageId);
    },
    getGuiAutomationSettings: () => {
        return electron_1.ipcRenderer.invoke('get-gui-automation-settings');
    },
    setGuiAutomationSettings: (settings) => {
        return electron_1.ipcRenderer.invoke('set-gui-automation-settings', settings);
    },
    commitGuiSettings: (settings) => {
        return electron_1.ipcRenderer.invoke('commit-gui-settings', settings);
    },
    migrateLegacyDecisiveAutomation: (settings) => {
        return electron_1.ipcRenderer.invoke('migrate-legacy-decisive-automation', settings);
    },
    getDecisivePlanSettings: () => {
        return electron_1.ipcRenderer.invoke('get-decisive-plan-settings');
    },
    setBackendRepoPath: (repoPath) => {
        return electron_1.ipcRenderer.invoke('set-backend-repo-path', repoPath);
    },
    setCudaPath: (cudaPath) => {
        return electron_1.ipcRenderer.invoke('set-cuda-path', cudaPath);
    },
    validateCudaPath: (cudaPath) => {
        return electron_1.ipcRenderer.invoke('validate-cuda-path', cudaPath);
    },
    getUpdateMode: () => {
        return electron_1.ipcRenderer.invoke('get-update-mode-sync');
    },
    getBackendUpdateMode: () => {
        return electron_1.ipcRenderer.invoke('get-backend-update-mode-sync');
    },
    getAllowTestUpdates: () => {
        return electron_1.ipcRenderer.invoke('get-allow-test-updates-sync');
    },
    getShipLibraryStatus: () => {
        return electron_1.ipcRenderer.invoke('get-ship-library-status');
    },
    getShipLibraryManifest: () => {
        return electron_1.ipcRenderer.invoke('get-ship-library-manifest');
    },
    updateShipLibrary: (target = 'wiki') => {
        return electron_1.ipcRenderer.invoke('update-ship-library', target);
    },
    onShipLibraryUpdateProgress: (callback) => {
        return subscribe('ship-library-update-progress', progress => callback(progress));
    },
    saveUserTeamPlan: (plan, overwrite = false, currentFile, source = 'user') => {
        return electron_1.ipcRenderer.invoke('save-user-team-plan', plan, overwrite, currentFile, source);
    },
    listTeamPlans: () => {
        return electron_1.ipcRenderer.invoke('list-team-plans');
    },
    getPlanManagement: () => {
        return electron_1.ipcRenderer.invoke('get-plan-management');
    },
    listDailyPlans: () => {
        return electron_1.ipcRenderer.invoke('list-daily-plans');
    },
    readDailyPlan: (source, file) => {
        return electron_1.ipcRenderer.invoke('read-daily-plan', source, file);
    },
    getDailyDecisivePlan: (chapter) => {
        return electron_1.ipcRenderer.invoke('get-daily-decisive-plan', chapter);
    },
    getSystemDailyDecisivePlan: (chapter) => {
        return electron_1.ipcRenderer.invoke('get-system-daily-decisive-plan', chapter);
    },
    saveDailyDecisivePlan: (settings) => {
        return electron_1.ipcRenderer.invoke('save-daily-decisive-plan', settings);
    },
    getMigrationConflicts: () => {
        return electron_1.ipcRenderer.invoke('get-migration-conflicts');
    },
    resolveMigrationConflicts: (keepIds) => {
        return electron_1.ipcRenderer.invoke('resolve-migration-conflicts', keepIds);
    },
    exportUserPlans: (selections) => {
        return electron_1.ipcRenderer.invoke('export-user-plans', selections);
    },
    exportLegacy143Plans: (selections) => electron_1.ipcRenderer.invoke('export-legacy-143-plans', selections),
    importLocalCombatPlan: () => {
        return electron_1.ipcRenderer.invoke('import-local-combat-plan');
    },
    setPlanUnlinkedIgnored: (kind, source, file, ignored) => {
        return electron_1.ipcRenderer.invoke('set-plan-unlinked-ignored', kind, source, file, ignored);
    },
    readManagedCombatPlan: (source, file) => {
        return electron_1.ipcRenderer.invoke('read-managed-combat-plan', source, file);
    },
    readCombatPlanFile: (filePath) => {
        return electron_1.ipcRenderer.invoke('read-combat-plan-file', filePath);
    },
    saveManagedCombatPlan: (name, content, overwrite = false, currentFile) => {
        return electron_1.ipcRenderer.invoke('save-managed-combat-plan', name, content, overwrite, currentFile);
    },
    renameUserCombatPlan: (file, newName) => {
        return electron_1.ipcRenderer.invoke('rename-user-combat-plan', file, newName);
    },
    deleteUserCombatPlan: (file) => {
        return electron_1.ipcRenderer.invoke('delete-user-combat-plan', file);
    },
    deleteUserTeamPlan: (file) => {
        return electron_1.ipcRenderer.invoke('delete-user-team-plan', file);
    },
    openDirectoryDialog: (title) => {
        return electron_1.ipcRenderer.invoke('open-directory-dialog', title);
    },
    openFileDialog: (filters, defaultDir) => {
        return electron_1.ipcRenderer.invoke('open-file-dialog', filters, defaultDir);
    },
    saveFile: (filePath, content) => {
        return electron_1.ipcRenderer.invoke('save-file', filePath, content);
    },
    readFile: (filePath) => {
        return electron_1.ipcRenderer.invoke('read-file', filePath);
    },
    appendFile: (filePath, content) => {
        return electron_1.ipcRenderer.invoke('append-file', filePath, content);
    },
    appendGuiLog: (content) => {
        return electron_1.ipcRenderer.invoke('append-gui-log', content);
    },
    detectEmulator: () => {
        return electron_1.ipcRenderer.invoke('detect-emulator');
    },
    checkAdbDevices: () => {
        return electron_1.ipcRenderer.invoke('check-adb-devices');
    },
    connectAdbDevice: (serial) => {
        return electron_1.ipcRenderer.invoke('connect-adb-device', serial);
    },
    disconnectAdbDevice: (serial) => {
        return electron_1.ipcRenderer.invoke('disconnect-adb-device', serial);
    },
    getAppRoot: () => {
        return electron_1.ipcRenderer.invoke('get-app-root');
    },
    getPlansDir: () => {
        return electron_1.ipcRenderer.invoke('get-plans-dir');
    },
    listPlanFiles: () => {
        return electron_1.ipcRenderer.invoke('list-plan-files');
    },
    getConfigDir: () => {
        return electron_1.ipcRenderer.invoke('get-config-dir');
    },
    openFolder: (folderPath) => {
        return electron_1.ipcRenderer.invoke('open-folder', folderPath);
    },
    checkEnvironment: () => {
        return electron_1.ipcRenderer.invoke('check-environment');
    },
    installDeps: () => {
        return electron_1.ipcRenderer.invoke('install-deps');
    },
    cancelInstallDeps: () => {
        return electron_1.ipcRenderer.invoke('cancel-install-deps');
    },
    installDepsOffline: (directory) => {
        return electron_1.ipcRenderer.invoke('install-deps-offline', directory);
    },
    onInstallDepsProgress: (callback) => {
        return subscribe('install-deps-progress', progress => callback(progress));
    },
    startBackend: () => {
        return electron_1.ipcRenderer.invoke('start-backend');
    },
    runSetup: () => {
        return electron_1.ipcRenderer.invoke('run-setup');
    },
    installPortablePython: () => {
        return electron_1.ipcRenderer.invoke('install-portable-python');
    },
    // Python 路径配置
    getPythonPath: () => {
        return electron_1.ipcRenderer.invoke('get-python-path-sync');
    },
    setPythonPath: (pythonPath) => {
        return electron_1.ipcRenderer.invoke('set-python-path', pythonPath);
    },
    validatePython: (pythonPath) => {
        return electron_1.ipcRenderer.invoke('validate-python', pythonPath);
    },
    // GUI 自动更新
    checkGuiUpdates: () => {
        return electron_1.ipcRenderer.invoke('check-gui-updates');
    },
    onUpdateStatus: (callback) => {
        return subscribe('update-status', status => callback(status));
    },
    // 后端独立更新
    checkBackendUpdates: () => {
        return electron_1.ipcRenderer.invoke('check-backend-updates');
    },
    autoCheckBackendUpdates: () => {
        return electron_1.ipcRenderer.invoke('auto-check-backend-updates');
    },
    prepareBackendUpdate: (commit) => {
        return electron_1.ipcRenderer.invoke('prepare-backend-update', commit);
    },
    onBackendUpdateStatus: (callback) => {
        return subscribe('backend-update-status', status => callback(status));
    },
    onBackendLog: (callback) => {
        return subscribe('backend-log', line => callback(line));
    },
    onSetupLog: (callback) => {
        return subscribe('setup-log', text => callback(text));
    },
    onFlushRequest: (callback) => {
        return subscribe('app:flush-request', requestId => callback(requestId));
    },
    notifyFlushDone: (requestId) => {
        electron_1.ipcRenderer.send('app:flush-done', requestId);
    },
};
/** 设置/运行环境域：窗口偏好、后端参数、Python/CUDA、更新与设备。 */
const SETTINGS_METHODS = [
    'getApiToken',
    'waitStartupReady',
    'getAppVersion',
    'getBackendPort',
    'getGuiLogRoot',
    'getBackendStartupMode',
    'getBackendRepoPath',
    'getOcrGpuMode',
    'getCudaPath',
    'getSaveBackendScreenshots',
    'getWindowPreferences',
    'rememberActivePage',
    'getGuiAutomationSettings',
    'setGuiAutomationSettings',
    'commitGuiSettings',
    'migrateLegacyDecisiveAutomation',
    'getDecisivePlanSettings',
    'setBackendRepoPath',
    'setCudaPath',
    'validateCudaPath',
    'getUpdateMode',
    'getBackendUpdateMode',
    'getAllowTestUpdates',
    'getShipLibraryStatus',
    'getShipLibraryManifest',
    'updateShipLibrary',
    'onShipLibraryUpdateProgress',
    'openDirectoryDialog',
    'openFileDialog',
    'getAppRoot',
    'getPlansDir',
    'getConfigDir',
    'openFolder',
    'checkEnvironment',
    'installDeps',
    'cancelInstallDeps',
    'installDepsOffline',
    'onInstallDepsProgress',
    'startBackend',
    'runSetup',
    'installPortablePython',
    'getPythonPath',
    'setPythonPath',
    'validatePython',
    'checkGuiUpdates',
    'onUpdateStatus',
    'checkBackendUpdates',
    'autoCheckBackendUpdates',
    'prepareBackendUpdate',
    'onBackendUpdateStatus',
    'onBackendLog',
    'onSetupLog',
    'onFlushRequest',
    'notifyFlushDone',
    'readManagedCombatPlan',
    'readFile',
    'saveFile',
    'appendFile',
    'appendGuiLog',
    'detectEmulator',
    'checkAdbDevices',
    'connectAdbDevice',
    'disconnectAdbDevice',
];
/** 方案域：作战/编队/任务组方案、日常计划、导入导出与文件读写。 */
const PLANS_METHODS = [
    'getApiToken',
    'getAppVersion',
    'getBackendPort',
    'saveUserTeamPlan',
    'listTeamPlans',
    'getPlanManagement',
    'listDailyPlans',
    'readDailyPlan',
    'getDailyDecisivePlan',
    'getSystemDailyDecisivePlan',
    'saveDailyDecisivePlan',
    'getMigrationConflicts',
    'resolveMigrationConflicts',
    'exportUserPlans',
    'exportLegacy143Plans',
    'importLocalCombatPlan',
    'setPlanUnlinkedIgnored',
    'readManagedCombatPlan',
    'readCombatPlanFile',
    'saveManagedCombatPlan',
    'renameUserCombatPlan',
    'deleteUserCombatPlan',
    'deleteUserTeamPlan',
    'openDirectoryDialog',
    'openFileDialog',
    'saveFile',
    'readFile',
    'appendFile',
    'getAppRoot',
    'getPlansDir',
    'getConfigDir',
    'listPlanFiles',
    'getShipLibraryManifest',
    'getDecisivePlanSettings',
];
function pickMethods(methods) {
    const view = {};
    for (const name of methods) {
        if (typeof electronBridge[name] === 'function')
            view[name] = electronBridge[name];
    }
    return view;
}
electronBridge.settings = pickMethods(SETTINGS_METHODS);
electronBridge.plans = pickMethods(PLANS_METHODS);
electron_1.contextBridge.exposeInMainWorld('electronBridge', electronBridge);
