"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBackendIpc = registerBackendIpc;
/** 注册后端安装脚本和启动 IPC。 */
function registerBackendIpc(ipc, dependencies) {
    ipc.handle('run-setup', async () => {
        return dependencies.runSetupScript();
    });
    ipc.handle('start-backend', async () => {
        if (dependencies.getBackendProcess()) {
            return { success: true, message: '后端已在运行' };
        }
        try {
            await dependencies.startBackend();
            return { success: true, message: '后端启动中' };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error
                    ? error.message
                    : String(error),
            };
        }
    });
}
