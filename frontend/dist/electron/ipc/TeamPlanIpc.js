"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTeamPlanIpc = registerTeamPlanIpc;
/** 注册编队保存、选择和列表 IPC。 */
function registerTeamPlanIpc(ipc, dependencies) {
    ipc.handle('save-user-team-plan', (_event, rawPlan, overwrite, currentFile, rawSource) => {
        return dependencies.service.save(rawPlan, overwrite, currentFile, rawSource);
    });
    ipc.handle('pick-user-team-plan', async () => {
        const directory = dependencies.repository.directory('user');
        const result = await dependencies.dialog.showOpenDialog({
            title: '加载编队预设',
            defaultPath: directory,
            properties: ['openFile'],
            filters: [{
                    name: '编队 YAML',
                    extensions: ['yaml', 'yml'],
                }],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }
        return dependencies.service.loadSelected(result.filePaths[0]);
    });
    ipc.handle('list-team-plans', () => {
        return dependencies.service.list();
    });
}
