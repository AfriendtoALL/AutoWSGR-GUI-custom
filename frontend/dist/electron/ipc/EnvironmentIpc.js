"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEnvironmentIpc = registerEnvironmentIpc;
/** 注册 Python 环境检查和安装 IPC。 */
function registerEnvironmentIpc(ipc, pythonEnvironment) {
    ipc.handle('check-environment', async () => {
        return await pythonEnvironment.check();
    });
    ipc.handle('install-deps', async () => {
        return pythonEnvironment.installDependencies();
    });
    ipc.handle('cancel-install-deps', async () => {
        return pythonEnvironment.cancelInstallDependencies();
    });
    ipc.handle('install-deps-offline', async (_event, directory) => {
        return pythonEnvironment.installDependenciesFromDirectory(directory);
    });
    ipc.handle('install-portable-python', async () => {
        return pythonEnvironment.installPortablePython();
    });
}
