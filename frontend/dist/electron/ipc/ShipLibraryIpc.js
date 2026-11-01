"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShipLibraryIpc = registerShipLibraryIpc;
/** 注册舰船资料库读取和更新 IPC。 */
function registerShipLibraryIpc(ipc, dependencies) {
    ipc.handle('get-ship-library-status', async () => {
        if (dependencies.getStatus)
            return await dependencies.getStatus();
        return dependencies.library.getStatus();
    });
    ipc.handle('get-ship-library-manifest', () => {
        return dependencies.library.getManifest();
    });
    ipc.handle('update-ship-library', async (_event, target) => {
        if (target === 'backend') {
            return await dependencies.updater.syncBackend();
        }
        return await dependencies.updater.update();
    });
}
