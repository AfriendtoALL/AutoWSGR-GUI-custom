"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConfigurationIpc = registerConfigurationIpc;
/** 注册配置 getter 和异步配置操作；6.11/R36 起 getter 走 handle（invoke），通道名不变。 */
function registerConfigurationIpc(ipc, dependencies) {
    const configuration = dependencies.configuration;
    ipc.handle('get-app-version-sync', () => dependencies.getAppVersion());
    ipc.handle('get-backend-port-sync', () => dependencies.backendPort);
    ipc.handle('get-gui-log-root-sync', () => configuration.guiLogRoot());
    ipc.handle('get-backend-startup-mode-sync', () => configuration.backendStartupMode());
    ipc.handle('get-backend-repo-path-sync', () => configuration.backendRepoPath());
    ipc.handle('get-ocr-gpu-mode-sync', () => configuration.ocrGpuMode());
    ipc.handle('get-cuda-path-sync', () => configuration.cudaPath());
    ipc.handle('get-save-backend-screenshots-sync', () => configuration.saveBackendScreenshots());
    ipc.handle('get-window-preferences-sync', () => dependencies.windows.getPreferences());
    ipc.handle('set-window-preferences', (_event, preferences) => {
        return dependencies.windows.setPreferences(preferences);
    });
    ipc.handle('get-gui-automation-settings', () => {
        return configuration.automation();
    });
    ipc.handle('set-gui-automation-settings', (_event, settings) => {
        return configuration.setAutomation(settings);
    });
    ipc.handle('commit-gui-settings', (_event, settings) => (dependencies.settingsCommit.commitAtomic(settings)));
    ipc.handle('migrate-legacy-decisive-automation', (_event, settings) => {
        return configuration.migrateLegacyDecisiveAutomation(settings);
    });
    ipc.handle('get-decisive-plan-settings', () => {
        return configuration.decisivePlan();
    });
    ipc.handle('set-decisive-plan-settings', (_event, settings) => {
        return configuration.setDecisivePlan(settings);
    });
    ipc.handle('set-backend-port', (_event, port) => {
        configuration.setBackendPort(port);
    });
    ipc.handle('set-backend-startup-mode', (_event, mode) => {
        configuration.setBackendStartupMode(mode);
    });
    ipc.handle('set-backend-repo-path', (_event, repoPath) => {
        configuration.setBackendRepoPath(repoPath);
    });
    ipc.handle('set-ocr-gpu-mode', (_event, mode) => {
        configuration.setOcrGpuMode(mode);
    });
    ipc.handle('set-cuda-path', (_event, cudaPath) => {
        configuration.setCudaPath(cudaPath);
    });
    ipc.handle('validate-cuda-path', async (_event, cudaPath) => {
        return dependencies.cudaEnvironment.detect(cudaPath);
    });
    ipc.handle('set-save-backend-screenshots', (_event, enabled) => {
        configuration.setSaveBackendScreenshots(enabled);
    });
    ipc.handle('get-python-path-sync', () => configuration.configuredPythonPath());
    ipc.handle('get-update-mode-sync', () => configuration.updateMode());
    ipc.handle('get-backend-update-mode-sync', () => configuration.backendUpdateMode());
    ipc.handle('set-last-active-page', (_event, pageId) => {
        dependencies.windows.rememberActivePage(pageId);
    });
    ipc.handle('get-allow-test-updates-sync', () => configuration.allowTestUpdates());
    ipc.handle('set-update-mode', (_event, mode) => {
        configuration.setUpdateMode(mode);
    });
    ipc.handle('set-python-path', (_event, pythonPath) => {
        configuration.setPythonPath(pythonPath);
    });
    ipc.handle('validate-python', async (_event, pythonPath) => {
        return dependencies.pythonEnvironment.validate(pythonPath);
    });
}
