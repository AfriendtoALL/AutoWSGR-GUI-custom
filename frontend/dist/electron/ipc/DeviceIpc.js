"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDeviceIpc = registerDeviceIpc;
/** 注册模拟器检测和 ADB 设备操作 IPC。 */
function registerDeviceIpc(ipc, dependencies) {
    ipc.handle('detect-emulator', async () => {
        return dependencies.detectEmulator();
    });
    ipc.handle('check-adb-devices', async () => {
        try {
            return await dependencies.adb.listDevices();
        }
        catch (error) {
            console.warn('[ADB] 设备查询失败:', error);
            return [];
        }
    });
    ipc.handle('connect-adb-device', async (_event, serial) => {
        return dependencies.adb.runDeviceCommand('connect', serial);
    });
    ipc.handle('disconnect-adb-device', async (_event, serial) => {
        return dependencies.adb.runDeviceCommand('disconnect', serial);
    });
}
