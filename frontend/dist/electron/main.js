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
/**
 * 组装主进程服务、注册 IPC，并管理 Electron 生命周期。
 */
const electron_1 = require("electron");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pythonEnv_1 = require("./pythonEnv");
const emulatorDetect_1 = require("./emulatorDetect");
const BackendService_1 = require("./services/BackendService");
const AppPaths_1 = require("./services/AppPaths");
const AtomicFileStore_1 = require("./services/AtomicFileStore");
const GuiSettingsStore_1 = require("./services/GuiSettingsStore");
const SafePathService_1 = require("./services/SafePathService");
const SecureFileService_1 = require("./services/SecureFileService");
const WindowService_1 = require("./services/WindowService");
const SingleInstanceService_1 = require("./services/SingleInstanceService");
const GuiUpdateStateStore_1 = require("./services/GuiUpdateStateStore");
const GuiUpdatePolicy_1 = require("./services/GuiUpdatePolicy");
const GuiUpdateInstaller_1 = require("./services/GuiUpdateInstaller");
const GuiUpdaterLogger_1 = require("./services/GuiUpdaterLogger");
const UserDataMigrationService_1 = require("./services/UserDataMigrationService");
const LegacyMigrationPrompt_1 = require("./services/LegacyMigrationPrompt");
const MigrationStateStore_1 = require("./services/MigrationStateStore");
const LegacyPlanMigration_1 = require("./services/LegacyPlanMigration");
const MigrationConflictService_1 = require("./services/MigrationConflictService");
const LegacyMigrationSummary_1 = require("./services/LegacyMigrationSummary");
const LegacyMigrationNotice_1 = require("./services/LegacyMigrationNotice");
const TeamPlanCodec_1 = require("./services/TeamPlanCodec");
const TeamPlanRepository_1 = require("./services/TeamPlanRepository");
const TeamPlanService_1 = require("./services/TeamPlanService");
const CombatPlanCodec_1 = require("./services/CombatPlanCodec");
const CombatPlanRepository_1 = require("./services/CombatPlanRepository");
const RuntimePlanService_1 = require("./services/RuntimePlanService");
const PlanManagementService_1 = require("./services/PlanManagementService");
const PlanExportService_1 = require("./services/PlanExportService");
const taskPreset_1 = require("../src/shared/taskPreset");
const DailyPlanService_1 = require("./services/DailyPlanService");
const ShipLibraryService_1 = require("./services/ShipLibraryService");
const ShipLibraryUpdater_1 = require("./services/ShipLibraryUpdater");
const ShipNameSynchronizer_1 = require("./services/ShipNameSynchronizer");
const AdbService_1 = require("./services/AdbService");
const CudaEnvironmentService_1 = require("./services/CudaEnvironmentService");
const GuiConfigurationService_1 = require("./services/GuiConfigurationService");
const BackendUpdateService_1 = require("./services/BackendUpdateService");
const GuiSettingsCommitService_1 = require("./services/GuiSettingsCommitService");
const GuiLogService_1 = require("./services/GuiLogService");
const PythonEnvironmentService_1 = require("./services/PythonEnvironmentService");
const BackendIpc_1 = require("./ipc/BackendIpc");
const CombatPlanIpc_1 = require("./ipc/CombatPlanIpc");
const ConfigurationIpc_1 = require("./ipc/ConfigurationIpc");
const DailyPlanIpc_1 = require("./ipc/DailyPlanIpc");
const DeviceIpc_1 = require("./ipc/DeviceIpc");
const EnvironmentIpc_1 = require("./ipc/EnvironmentIpc");
const FileIpc_1 = require("./ipc/FileIpc");
const MigrationConflictIpc_1 = require("./ipc/MigrationConflictIpc");
const ShipLibraryIpc_1 = require("./ipc/ShipLibraryIpc");
const TeamPlanIpc_1 = require("./ipc/TeamPlanIpc");
const UpdaterIpc_1 = require("./ipc/UpdaterIpc");
/** 启动终端关闭输出管道时，不让 EPIPE 终止 GUI 主进程。 */
function ignoreBrokenPipe(stream) {
    stream.on('error', (error) => {
        if (error.code !== 'EPIPE')
            throw error;
    });
}
ignoreBrokenPipe(process.stdout);
ignoreBrokenPipe(process.stderr);
const singleInstanceService = new SingleInstanceService_1.SingleInstanceService(electron_1.app);
const isPrimaryInstance = singleInstanceService.acquire();
const appPaths = new AppPaths_1.AppPaths({
    moduleDirectory: __dirname,
    isPackaged: () => electron_1.app.isPackaged,
    getPath: name => electron_1.app.getPath(name),
    getResourcesPath: () => process.resourcesPath,
});
/**
 * 6.1/R17：每次启动生成一次性 API token。
 * 后端子进程经 AUTOWSGR_API_TOKEN 继承，渲染层经 get-api-token 通道读取；
 * token 不落盘、不进 URL，进程退出即失效。
 */
const BACKEND_API_TOKEN = crypto.randomBytes(32).toString('base64url');
process.env.AUTOWSGR_API_TOKEN = BACKEND_API_TOKEN;
electron_1.ipcMain.handle('get-api-token', () => BACKEND_API_TOKEN);
/**
 * 6.11b/R36：两段式启动。渲染层在读取 gui_settings / 计划文件前等待这个 Promise，
 * 避免窗口先于旧数据迁移时读到迁移前的旧值。超时/失败也会 resolve，保证界面能起。
 */
let startupReadySettled = false;
let startupReadyState = { ready: true };
let resolveStartupReady;
const startupReadyPromise = new Promise((resolve) => {
    resolveStartupReady = resolve;
});
function settleStartup(state) {
    if (startupReadySettled)
        return;
    startupReadySettled = true;
    startupReadyState = state ?? { ready: true };
    resolveStartupReady(startupReadyState);
}
electron_1.ipcMain.handle('wait-startup-ready', async () => (startupReadySettled ? startupReadyState : startupReadyPromise));
/** 给“等首帧/等页面”加超时兜底，避免 shell 加载失败时永远卡住。 */
function withTimeout(promise, ms, fallback = null) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(fallback), ms);
        timer.unref?.();
        Promise.resolve(promise).then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
const atomicFileStore = new AtomicFileStore_1.AtomicFileStore();
const guiUpdateStateStore = new GuiUpdateStateStore_1.GuiUpdateStateStore(() => path.join(appPaths.userDataRoot(), '.gui-update-state.json'), atomicFileStore);
const guiUpdaterLogger = new GuiUpdaterLogger_1.GuiUpdaterLogger(path.join(appPaths.isPackaged()
    ? appPaths.appRoot()
    : appPaths.userDataRoot(), 'logs', 'updater.log'), path.join(appPaths.userDataRoot(), 'logs', 'updater.log'));
const guiUpdateInstaller = new GuiUpdateInstaller_1.GuiUpdateInstaller(guiUpdateStateStore, guiUpdaterLogger, process.resourcesPath);
const migrationStateStore = new MigrationStateStore_1.MigrationStateStore(() => path.join(appPaths.userDataRoot(), '.migration-state.json'), atomicFileStore);
const userDataMigrationService = new UserDataMigrationService_1.UserDataMigrationService(appPaths, atomicFileStore, migrationStateStore);
const migrationConflictService = new MigrationConflictService_1.MigrationConflictService(appPaths, atomicFileStore);
let legacyUserDataMigration = (0, LegacyMigrationSummary_1.emptyLegacyMigrationSummary)();
const legacyMigrationPrompt = new LegacyMigrationPrompt_1.LegacyMigrationPrompt({
    createWindow: options => new electron_1.BrowserWindow(options),
});
const guiSettingsStore = new GuiSettingsStore_1.GuiSettingsStore(() => path.join(appPaths.userDataRoot(), 'gui_settings.json'), atomicFileStore);
const safePathService = new SafePathService_1.SafePathService(appPaths);
const secureFileService = new SecureFileService_1.SecureFileService(safePathService, atomicFileStore);
const teamPlanCodec = new TeamPlanCodec_1.TeamPlanCodec();
const teamPlanRepository = new TeamPlanRepository_1.TeamPlanRepository(appPaths, atomicFileStore, teamPlanCodec);
const combatPlanRepository = new CombatPlanRepository_1.CombatPlanRepository(appPaths, atomicFileStore);
const combatPlanCodec = new CombatPlanCodec_1.CombatPlanCodec(teamPlanCodec, teamPlanRepository);
const teamPlanService = new TeamPlanService_1.TeamPlanService(teamPlanCodec, teamPlanRepository, combatPlanCodec, combatPlanRepository);
const taskPresetCodec = new taskPreset_1.TaskPresetCodec();
const dailyPlanService = new DailyPlanService_1.DailyPlanService(appPaths, atomicFileStore, combatPlanCodec, taskPresetCodec);
const runtimePlanService = new RuntimePlanService_1.RuntimePlanService(combatPlanCodec, combatPlanRepository, atomicFileStore, {
    getTempDirectory: () => electron_1.app.getPath('temp'),
    processId: process.pid,
});
const planManagementService = new PlanManagementService_1.PlanManagementService(combatPlanCodec, combatPlanRepository, runtimePlanService, teamPlanRepository, guiSettingsStore, taskPresetCodec);
const planExportService = new PlanExportService_1.PlanExportService(combatPlanRepository, teamPlanRepository, atomicFileStore, combatPlanCodec);
const shipLibraryService = new ShipLibraryService_1.ShipLibraryService(appPaths, {
    processId: process.pid,
});
const shipNameSynchronizer = new ShipNameSynchronizer_1.ShipNameSynchronizer(atomicFileStore);
const adbService = new AdbService_1.AdbService(appPaths);
/** 关闭 GUI 管理的后端与内置 ADB server，释放安装目录中的可执行文件。 */
async function stopRuntimeResources() {
    await (0, BackendService_1.stopBackend)();
    try {
        const stopped = await adbService.stopServer();
        console.log(stopped
            ? '[ADB] GUI 内置 server 已停止'
            : '[ADB] 未发现 GUI 内置 server，跳过停止');
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.warn(`[ADB] GUI 内置 server 停止失败，将继续退出: ${message}`);
    }
}
const cudaEnvironmentService = new CudaEnvironmentService_1.CudaEnvironmentService(CudaEnvironmentService_1.CudaEnvironmentService.createDependencies(pythonEnv_1.findPython));
const guiConfigurationService = new GuiConfigurationService_1.GuiConfigurationService(guiSettingsStore, {
    clearPythonCache: pythonEnv_1.clearPythonCache,
    normalizeCudaPath: candidate => (cudaEnvironmentService.normalizePath(candidate)),
    environmentPort: () => process.env.AUTOWSGR_PORT,
});
const guiLogService = new GuiLogService_1.GuiLogService(appPaths, guiConfigurationService);
/**
 * 6.11b：启动阶段打点写入 userData/logs/boot.log（不依赖 gui_settings 里的日志目录，
 * 避免迁移前后路径变化导致首尾两段落在不同文件里）。
 */
const BOOT_STARTED_AT = Date.now();
const bootMarks = [];
function markBoot(name) {
    const at = Date.now() - BOOT_STARTED_AT;
    bootMarks.push({ name, at });
    try {
        const directory = path.join(appPaths.userDataRoot(), 'logs');
        fs.mkdirSync(directory, { recursive: true });
        fs.appendFileSync(path.join(directory, 'boot.log'), `${new Date().toISOString()} [Boot] ${name} @${at}ms\n`, 'utf-8');
    }
    catch {
        // 启动打点失败不应影响启动本身。
    }
}
const BACKEND_PORT = guiConfigurationService.backendPort();
const windowService = new WindowService_1.WindowService(guiSettingsStore, {
    backendPort: BACKEND_PORT,
    moduleDirectory: __dirname,
    createBrowserWindow: options => new electron_1.BrowserWindow(options),
    getDisplays: () => electron_1.screen.getAllDisplays(),
    getAppPath: () => electron_1.app.getAppPath(),
    isPackaged: () => appPaths.isPackaged(),
    resourceRoot: () => appPaths.resourceRoot(),
    showMessageBox: options => {
        void electron_1.dialog.showMessageBox(options);
    },
});
async function chooseRestartTiming(title, message, detail) {
    const options = {
        type: 'question',
        title,
        message,
        detail,
        buttons: ['立即重启', '下次启动'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
    };
    const mainWindow = windowService.getMainWindow();
    const result = mainWindow
        ? await electron_1.dialog.showMessageBox(mainWindow, options)
        : await electron_1.dialog.showMessageBox(options);
    return result.response === 0 ? 'restart' : 'next-launch';
}
const guiSettingsCommitService = new GuiSettingsCommitService_1.GuiSettingsCommitService(guiConfigurationService, secureFileService, windowService);
/** 关窗前等待 Renderer 落盘的最长时间（ms）。 */
const FLUSH_REQUEST_TIMEOUT_MS = 3000;
/** 拦截窗口关闭：先请 Renderer 保存任务组并刷完日志，收到回执或超时后再销毁窗口。 */
function attachRendererFlushOnClose(win) {
    let readyToDestroy = false;
    let waitingForFlush = false;
    win.on('close', (event) => {
        if (readyToDestroy)
            return;
        // 6.11b：shell 阶段还没有需要落盘的 Renderer 状态，直接放行，避免白等 3s。
        if (win.__autowsgrAppPageReady !== true)
            return;
        event.preventDefault();
        if (waitingForFlush)
            return;
        waitingForFlush = true;
        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        let settled = false;
        let timer = null;
        const finish = (reason) => {
            if (settled)
                return;
            settled = true;
            waitingForFlush = false;
            readyToDestroy = true;
            if (timer)
                clearTimeout(timer);
            electron_1.ipcMain.removeListener('app:flush-done', onFlushDone);
            if (reason === 'timeout')
                console.warn('[Main] Renderer 落盘超时，继续关闭窗口');
            else if (reason === 'done')
                console.log('[Main] Renderer 已落盘，关闭窗口');
            if (!win.isDestroyed())
                win.destroy();
        };
        const onFlushDone = (_event, replyId) => {
            if (replyId === requestId)
                finish('done');
        };
        electron_1.ipcMain.on('app:flush-done', onFlushDone);
        timer = setTimeout(() => finish('timeout'), FLUSH_REQUEST_TIMEOUT_MS);
        timer.unref?.();
        if (!windowService.sendToRenderer('app:flush-request', requestId))
            finish('renderer-unavailable');
    });
    return win;
}
const backendUpdateService = new BackendUpdateService_1.BackendUpdateService({
    getStagingRoot: () => path.join(appPaths.userDataRoot(), '.backend-update-staging'),
    getStatePath: () => path.join(appPaths.appRoot(), '.env_ready'),
    getLegacyStatePath: () => path.join((0, pythonEnv_1.localSitePackages)(), '.autowsgr-update-state.json'),
    getInstalledPackageDir: () => path.join((0, pythonEnv_1.localSitePackages)(), 'autowsgr'),
    getAppVersion: () => electron_1.app.getVersion(),
    allowTestUpdates: () => guiConfigurationService.allowTestUpdates(),
    backendStartupMode: () => guiConfigurationService.backendStartupMode(),
    alphaDistribution: () => pythonEnv_1.BACKEND_DISTRIBUTIONS.alpha,
    atomicFiles: atomicFileStore,
    sendStatus: status => {
        windowService.sendToRenderer('backend-update-status', status);
    },
    chooseRestartTiming: commit => chooseRestartTiming('后端更新准备完成', `后端提交 ${commit.slice(0, 7)} 已下载并校验完成`, [
        '“立即重启”会安全停止后端和 ADB，退出前应用后端更新。',
        '“下次启动”会继续当前任务，本次退出时应用更新。',
    ].join('\n')),
    restartApplication: () => {
        electron_1.app.relaunch();
        electron_1.app.quit();
    },
    log: message => {
        console.log(`[BackendUpdate] ${message}`);
        guiUpdaterLogger.info(message);
    },
    runtime: {
        findPython: pythonEnv_1.findPython,
        validateBackend: (pythonCmd) => ((0, pythonEnv_1.verifyBackendRuntimeContract)(pythonCmd, (0, pythonEnv_1.buildAutoUpdateDeps)(message => console.log(`[BackendUpdate] ${message}`)))),
        installArchive: (pythonCmd, zipPath) => ((0, pythonEnv_1.installBackendArchive)(pythonCmd, (0, pythonEnv_1.buildAutoUpdateDeps)(message => console.log(`[BackendUpdate] ${message}`)), zipPath)),
    },
});
const pythonEnvironmentService = new PythonEnvironmentService_1.PythonEnvironmentService(PythonEnvironmentService_1.PythonEnvironmentService.createDependencies({
    isAllowedVersion: pythonEnv_1.isAllowedPythonVersion,
    findPython: pythonEnv_1.findPython,
    checkEnvironment: pythonEnv_1.checkEnvironment,
    installDependencies: pythonEnv_1.installDependencies,
    installDependenciesFromDirectory: pythonEnv_1.installDependenciesFromDirectory,
    cancelInstallDependencies: pythonEnv_1.cancelDependencies,
    installPortablePython: pythonEnv_1.installPortablePython,
    beforeInstall: () => (backendUpdateService.beginManagedBackendInstall()),
    onDependenciesInstalled: () => {
        if (guiConfigurationService.backendStartupMode() === 'managed') {
            backendUpdateService.clearStateAfterManagedInstall();
        }
    },
    afterInstall: () => {
        backendUpdateService.endManagedBackendInstall();
    },
}));
singleInstanceService.setMainWindowProvider(() => windowService.getMainWindow());
let updateInProgressDialogOpen = false;
/** 安装期间的重复启动只显示系统提示，不创建旧版主窗口。 */
async function showUpdateInProgressDialog() {
    if (updateInProgressDialogOpen)
        return;
    updateInProgressDialogOpen = true;
    try {
        await electron_1.app.whenReady();
        await electron_1.dialog.showMessageBox({
            type: 'info',
            title: 'AutoWSGR-GUI 正在更新',
            message: '后台正在更新，请稍后',
            buttons: ['确认'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
        });
    }
    finally {
        updateInProgressDialogOpen = false;
    }
}
singleInstanceService.setDuplicateLaunchHandler(() => {
    const state = guiUpdateStateStore.read();
    if (!state
        || state.sourceVersion !== electron_1.app.getVersion()
        || !guiUpdateStateStore.isInstallationActive(state)) {
        return false;
    }
    void showUpdateInProgressDialog();
    return true;
});
const shipLibraryUpdater = new ShipLibraryUpdater_1.ShipLibraryUpdater(shipLibraryService, {
    findPython: pythonEnv_1.findPython,
    appRoot,
    sendProgress: message => {
        windowService.sendToRenderer('ship-library-update-progress', { message });
    },
    compareShipNames: pythonCmd => {
        return shipNameSynchronizer.compare((0, pythonEnv_1.backendShipNamesPath)(pythonCmd), shipLibraryService.getManifest().ships);
    },
    syncShipNames: pythonCmd => {
        return shipNameSynchronizer.sync((0, pythonEnv_1.backendShipNamesPath)(pythonCmd), shipLibraryService.getManifest().ships);
    },
});
/** 返回开发项目根目录或打包后的 exe 目录。 */
function appRoot() {
    return appPaths.appRoot();
}
/** 返回包含 resource 和 setup.bat 的 extraResources 目录。 */
function resourceRoot() {
    return appPaths.resourceRoot();
}
/** 返回 Electron userData 根目录。 */
function userDataRoot() {
    return appPaths.userDataRoot();
}
// IPC 注册
(0, FileIpc_1.registerFileIpc)(electron_1.ipcMain, {
    dialog: electron_1.dialog,
    shell: electron_1.shell,
    guiLogs: guiLogService,
    secureFiles: secureFileService,
    safePaths: safePathService,
    combatPlans: combatPlanRepository,
    appRoot,
    userDataRoot,
});
(0, DeviceIpc_1.registerDeviceIpc)(electron_1.ipcMain, {
    adb: adbService,
    detectEmulator: emulatorDetect_1.detectEmulator,
});
(0, ConfigurationIpc_1.registerConfigurationIpc)(electron_1.ipcMain, {
    getAppVersion: () => electron_1.app.getVersion(),
    backendPort: BACKEND_PORT,
    configuration: guiConfigurationService,
    settingsCommit: guiSettingsCommitService,
    cudaEnvironment: cudaEnvironmentService,
    pythonEnvironment: pythonEnvironmentService,
    windows: windowService,
});
(0, DailyPlanIpc_1.registerDailyPlanIpc)(electron_1.ipcMain, {
    dailyPlans: dailyPlanService,
    configuration: guiConfigurationService,
});
(0, MigrationConflictIpc_1.registerMigrationConflictIpc)(electron_1.ipcMain, migrationConflictService);
(0, EnvironmentIpc_1.registerEnvironmentIpc)(electron_1.ipcMain, pythonEnvironmentService);
(0, TeamPlanIpc_1.registerTeamPlanIpc)(electron_1.ipcMain, {
    dialog: electron_1.dialog,
    repository: teamPlanRepository,
    service: teamPlanService,
});
(0, CombatPlanIpc_1.registerCombatPlanIpc)(electron_1.ipcMain, {
    dialog: electron_1.dialog,
    safePaths: safePathService,
    plans: planManagementService,
    planExports: planExportService,
});
(0, ShipLibraryIpc_1.registerShipLibraryIpc)(electron_1.ipcMain, {
    library: shipLibraryService,
    updater: shipLibraryUpdater,
    getStatus: async () => {
        const status = shipLibraryService.getStatus();
        if (!status.exists
            || status.error
            || status.shipCount <= 0
            || status.missingAssets > 0) {
            return status;
        }
        try {
            const backend = await shipLibraryUpdater.getBackendSyncStatus();
            return {
                ...status,
                backendSynchronized: backend.synchronized,
                backendMissingRecords: backend.missingRecords,
                backendMissingAliases: backend.missingAliases,
            };
        }
        catch (error) {
            return {
                ...status,
                backendSynchronized: false,
                backendError: error instanceof Error
                    ? error.message
                    : String(error),
            };
        }
    },
});
(0, BackendIpc_1.registerBackendIpc)(electron_1.ipcMain, {
    getBackendProcess: BackendService_1.getBackendProcess,
    startBackend: BackendService_1.startBackend,
    runSetupScript: BackendService_1.runSetupScript,
});
const legacyPlanMigration = new LegacyPlanMigration_1.LegacyPlanMigration(appPaths, atomicFileStore, userDataMigrationService, migrationStateStore, {
    yamlFiles: directory => combatPlanRepository.yamlFiles(directory),
    safePlanBaseName: value => combatPlanCodec.safeBaseName(value),
    normalizeUserTeamPlan: raw => teamPlanCodec.normalizeLegacy(raw),
    teamPlanMatches: (filePath, team) => (teamPlanRepository.matches(filePath, team)),
    teamName: team => team.name,
    renameTeam: (team, name) => ({
        ...structuredClone(team),
        name,
    }),
    normalizeCombatPlanFleetPresets: (root, source, requireEmbeddedShips) => combatPlanCodec.normalizeLegacyFleetPresets(root, source, requireEmbeddedShips),
    buildTeamPlanWrites: (teams, directory) => (teamPlanRepository.buildWrites(teams, directory)),
    serializeCombatPlan: (root, originalContent) => (combatPlanCodec.serialize(root, originalContent)),
    isStandaloneTaskPreset: root => (taskPresetCodec.isStandalone(root)),
    normalizeTaskPreset: root => taskPresetCodec.normalize(root),
});
/** 向渲染进程发送环境检查进度。 */
function sendProgress(msg) {
    windowService.sendToRenderer('backend-log', msg);
}
// 应用生命周期
if (isPrimaryInstance)
    initializeApplicationLifecycle();
function initializeApplicationLifecycle() {
    let runtimeShutdownInProgress = false;
    let runtimeShutdownComplete = false;
    /** 迁移询问是用户决策，不能被 30s 启动兜底超时绕过。 */
    let startupUserDecisionPending = false;
    /** 在任何迁移、后端初始化和主窗口创建前处理待安装更新。 */
    const handleStartupUpdate = async () => {
        const pendingUpdate = guiUpdateStateStore.read();
        if (pendingUpdate) {
            const updatePolicy = (0, GuiUpdatePolicy_1.resolveGuiUpdateSelectionPolicy)(electron_1.app.getVersion(), guiConfigurationService.allowTestUpdates());
            const mismatch = (0, GuiUpdatePolicy_1.validateGuiUpdateCandidate)(updatePolicy, pendingUpdate.targetVersion);
            if (mismatch) {
                guiUpdaterLogger.warn(`Discarded pending GUI update after channel change: ${mismatch}`);
                guiUpdateStateStore.clear();
            }
        }
        const resolution = guiUpdateStateStore.resolveStartup(electron_1.app.getVersion());
        if (resolution.action === 'continue')
            return false;
        if (resolution.action === 'cleanup') {
            const cleanupTimer = setTimeout(() => {
                guiUpdateInstaller.cleanupAppliedUpdate(resolution.state);
            }, 10000);
            cleanupTimer.unref();
            return false;
        }
        if (resolution.action === 'wait') {
            guiUpdaterLogger.info(`Blocked old GUI startup while v`
                + `${resolution.state.targetVersion} is installing`);
            await showUpdateInProgressDialog();
            runtimeShutdownComplete = true;
            electron_1.app.quit();
            return true;
        }
        try {
            await guiUpdateInstaller.launchPendingUpdate();
            runtimeShutdownComplete = true;
            electron_1.app.quit();
            return true;
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            guiUpdaterLogger.error(`Cannot install pending GUI update: ${message}`);
            await electron_1.dialog.showMessageBox({
                type: 'error',
                title: 'GUI 更新失败',
                message: '后台更新无法启动',
                detail: `${message}\n本次将继续打开当前版本。`,
                buttons: ['确认'],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
            });
            return false;
        }
    };
    /**
     * 6.11b：窗口可见后再做旧数据迁移、计划迁移、冲突扫描与后端更新恢复。
     * 渲染层在 wait-startup-ready 之前不会读 gui_settings/计划，因此这里可以安全改文件。
     */
    const runStartupPreparation = async () => {
        let migrationSelection = {
            ...UserDataMigrationService_1.DEFAULT_LEGACY_MIGRATION_SELECTION,
        };
        let legacyMigrationResult = (0, LegacyMigrationSummary_1.emptyLegacyMigrationSummary)();
        markBoot('prep-start');
        (0, UpdaterIpc_1.registerUpdaterIpc)(electron_1.ipcMain, {
            sendToRenderer: (channel, ...args) => (windowService.sendToRenderer(channel, ...args)),
            getAppVersion: () => electron_1.app.getVersion(),
            allowTestUpdates: () => guiConfigurationService.allowTestUpdates(),
            getBackendUpdateMode: () => (guiConfigurationService.backendUpdateMode()),
            logger: guiUpdaterLogger,
            updateStates: guiUpdateStateStore,
            backendUpdates: backendUpdateService,
            chooseDownload: async (version) => {
                const options = {
                    type: 'question',
                    title: '发现 GUI 更新',
                    message: `发现 GUI v${version}，是否现在更新？`,
                    detail: [
                        '“现在更新”只会在后台静默下载和校验，不会关闭 GUI 或中断当前任务。',
                        '“稍后”本次不下载，下次打开 GUI 时仍会提示。',
                    ].join('\n'),
                    buttons: ['现在更新', '稍后'],
                    defaultId: 1,
                    cancelId: 1,
                    noLink: true,
                };
                const mainWindow = windowService.getMainWindow();
                const result = mainWindow
                    ? await electron_1.dialog.showMessageBox(mainWindow, options)
                    : await electron_1.dialog.showMessageBox(options);
                return result.response === 0 ? 'now' : 'later';
            },
            chooseRestartTiming: async (version) => {
                return chooseRestartTiming('GUI 更新准备完成', `GUI v${version} 已下载并校验完成`, [
                    '“立即重启”会安全停止后端和 ADB，静默安装完成后启动新版本。',
                    '“下次启动”会继续当前任务，下次打开 GUI 时先完成更新再显示主窗口。',
                ].join('\n'));
            },
            installDownloadedUpdate: async () => {
                await stopRuntimeResources();
                await guiUpdateInstaller.launchPendingUpdate();
                runtimeShutdownComplete = true;
                electron_1.app.quit();
            },
        });
        try {
            (0, pythonEnv_1.initPythonEnv)({
                appRoot,
                sendProgress,
                sendInstallProgress: payload => windowService.sendToRenderer('install-deps-progress', payload),
                getConfiguredPythonPath: () => (guiConfigurationService.configuredPythonPath()),
                getUpdateMode: () => guiConfigurationService.updateMode(),
                getBackendUpdateMode: () => (guiConfigurationService.backendUpdateMode()),
                allowTestUpdates: () => (guiConfigurationService.allowTestUpdates()),
                getBackendStartupMode: () => (guiConfigurationService.backendStartupMode()),
                getBackendRepoPath: () => (guiConfigurationService.backendRepoPath()),
                getTempDir: () => electron_1.app.getPath('temp'),
                beforeManagedBackendInstall: () => (backendUpdateService.beginManagedBackendInstall()),
                onManagedBackendInstalled: () => {
                    backendUpdateService.clearStateAfterManagedInstall();
                },
                afterManagedBackendInstall: () => {
                    backendUpdateService.endManagedBackendInstall();
                },
            });
            (0, BackendService_1.initBackend)({
                appRoot,
                userDataRoot,
                resourceRoot,
                resourceDataRoot: () => appPaths.resourceDataRoot(),
                BACKEND_PORT,
                sendToRenderer: (channel, ...args) => (windowService.sendToRenderer(channel, ...args)),
            });
            markBoot('python-context-ready');
            await withTimeout(windowService.waitForAppPage(), 15000, 'timeout');
            if (userDataMigrationService.shouldMigrateLegacyInstallation()) {
                windowService.hideBootSkeleton();
                startupUserDecisionPending = true;
                const selected = await legacyMigrationPrompt.show();
                startupUserDecisionPending = false;
                if (!selected) {
                    electron_1.app.quit();
                    return { ready: true, aborted: true };
                }
                migrationSelection = selected;
                legacyUserDataMigration = (userDataMigrationService.migrateLegacyUserDataFiles(migrationSelection));
            }
            combatPlanRepository.initializeUserDirectory();
            shipLibraryService.initialize();
            teamPlanRepository.initializeUserDirectory();
            const presetInventoryResult = (userDataMigrationService.migratePresetInventory());
            const legacyPlanResult = legacyPlanMigration.migrate(migrationSelection);
            legacyMigrationResult = (0, LegacyMigrationSummary_1.mergeLegacyMigrationSummaries)(legacyUserDataMigration, legacyPlanResult, presetInventoryResult);
            userDataMigrationService.writeMigrationReport(legacyMigrationResult);
            if (legacyMigrationResult.failed === 0
                && migrationStateStore.isStageComplete(LegacyPlanMigration_1.LEGACY_PLAN_MIGRATION_STAGE)) {
                userDataMigrationService.completeLegacySourceMigration();
            }
            migrationConflictService.prepareAfterMigration(legacyMigrationResult.total > 0);
            markBoot('migration-done');
            await backendUpdateService.recoverAndApplyOnStartup();
            markBoot('prep-done');
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            console.error('[Boot] 启动准备失败，将继续打开界面:', message);
            markBoot('prep-error');
        }
        const migrationNotice = (0, LegacyMigrationNotice_1.buildLegacyMigrationNotice)(legacyMigrationResult);
        const mainWindow = windowService.getMainWindow();
        if (migrationNotice && mainWindow) {
            try {
                await withTimeout(windowService.waitForAppPage(), 5000, 'timeout');
            }
            catch {
                // 页面加载失败时仍尝试弹提示。
            }
            windowService.hideBootSkeleton();
            void electron_1.dialog.showMessageBox(mainWindow, migrationNotice);
        }
        return { ready: true };
    };
    electron_1.app.whenReady().then(async () => {
        markBoot('when-ready');
        if (await handleStartupUpdate())
            return;
        markBoot('update-checked');
        attachRendererFlushOnClose(windowService.createWindow({ initialPage: 'shell' }));
        markBoot('shell-window-created');
        try {
            await withTimeout(windowService.waitForInitialPaint(), 5000, 'timeout');
        }
        catch (error) {
            console.error('[Boot] 等待 shell 首帧失败:', error);
        }
        markBoot('shell-first-paint');
        // 6.11b：ready-to-show 只代表首帧已就绪；再让 shell 真正提交一帧，
        // 避免紧接着导航时 app 页和 shell 抢同一个合成器首帧。
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 30);
            timer.unref?.();
        });
        try {
            await windowService.loadApp();
            markBoot('app-page-loaded');
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            console.error('[Boot] 主页面加载失败:', message);
        }
        const preparation = runStartupPreparation();
        const timeoutTimer = setTimeout(() => {
            if (startupUserDecisionPending) {
                console.warn('[Boot] 迁移询问仍在等待用户选择，跳过启动兜底超时');
                return;
            }
            console.warn('[Boot] 启动准备超时，先放行界面');
            markBoot('prep-timeout');
            settleStartup({ ready: true, timedOut: true });
        }, 30000);
        timeoutTimer.unref?.();
        try {
            const state = await preparation;
            markBoot('prep-finished');
            settleStartup(state ?? { ready: true });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            console.error('[Boot] 启动准备异常，先放行界面:', message);
            markBoot('prep-failed');
            settleStartup({ ready: true, failed: true });
        }
        finally {
            clearTimeout(timeoutTimer);
        }
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                const initialPage = startupReadySettled ? 'app' : 'shell';
                attachRendererFlushOnClose(windowService.createWindow({ initialPage }));
                if (initialPage === 'shell') {
                    void windowService.waitForInitialPaint()
                        .then(() => windowService.loadApp())
                        .catch(() => { });
                }
            }
        });
    });

    electron_1.app.on('before-quit', (event) => {
        windowService.captureWindowBounds();
        windowService.persistWindowBounds();
        if (runtimeShutdownComplete)
            return;
        event.preventDefault();
        if (runtimeShutdownInProgress)
            return;
        runtimeShutdownInProgress = true;
        void stopRuntimeResources().then(async () => {
            await backendUpdateService.applyBeforeExit();
            runtimeShutdownComplete = true;
            runtimeShutdownInProgress = false;
            electron_1.app.quit();
        }).catch(error => {
            runtimeShutdownInProgress = false;
            const message = error instanceof Error
                ? error.message
                : String(error);
            console.error('[Backend] 无法安全退出:', message);
            electron_1.dialog.showErrorBox('无法安全退出', `后端进程仍在运行，应用没有退出：${message}`);
        });
    });
    electron_1.app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            electron_1.app.quit();
        }
    });
}
