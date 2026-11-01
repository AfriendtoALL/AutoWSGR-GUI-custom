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
exports.registerFileIpc = registerFileIpc;
/**
 * 连接文件、路径和目录 IPC 与安全文件服务。
 */
const fs = __importStar(require("fs"));
/** 注册文件、路径和目录相关 IPC。 */
function registerFileIpc(ipc, dependencies) {
    ipc.handle('open-directory-dialog', async (_event, title) => {
        const result = await dependencies.dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: title || '选择文件夹',
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return result.filePaths[0];
    });
    ipc.handle('open-file-dialog', async (_event, filters, defaultDir) => {
        const result = await dependencies.dialog.showOpenDialog({
            properties: ['openFile'],
            defaultPath: defaultDir || undefined,
            filters,
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        const filePath = result.filePaths[0];
        const content = dependencies.secureFiles.readSelectedFile(filePath);
        return { path: filePath, content };
    });
    ipc.handle('save-file', async (_event, filePath, content) => {
        dependencies.secureFiles.save(filePath, content);
    });
    ipc.handle('save-file-dialog', async (_event, defaultName, content, filters) => {
        const result = await dependencies.dialog.showSaveDialog({
            defaultPath: defaultName,
            filters,
        });
        if (result.canceled || !result.filePath)
            return null;
        dependencies.secureFiles.writeSelectedFile(result.filePath, content);
        return result.filePath;
    });
    ipc.handle('read-file', async (_event, filePath) => {
        return dependencies.secureFiles.read(filePath);
    });
    ipc.handle('append-file', async (_event, filePath, content) => {
        dependencies.secureFiles.append(filePath, content);
    });
    ipc.handle('append-gui-log', async (_event, content) => {
        dependencies.guiLogs.append(content);
    });
    ipc.handle('get-app-root', () => dependencies.appRoot());
    ipc.handle('get-plans-dir', () => {
        return dependencies.combatPlans.directory('user');
    });
    ipc.handle('list-plan-files', () => {
        return dependencies.combatPlans.listUserFiles();
    });
    ipc.handle('get-config-dir', () => dependencies.userDataRoot());
    ipc.handle('open-folder', async (_event, folderPath) => {
        const resolved = dependencies.safePaths.resolveWritablePath(folderPath);
        if (fs.existsSync(resolved)) {
            await dependencies.shell.openPath(resolved);
        }
    });
}
