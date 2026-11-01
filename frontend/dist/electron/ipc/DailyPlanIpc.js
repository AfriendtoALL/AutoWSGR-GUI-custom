"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDailyPlanIpc = registerDailyPlanIpc;
/** 注册日常任务列表、读取和按章节保存决战配置的 IPC。 */
function registerDailyPlanIpc(ipc, dependencies) {
    ipc.handle('list-daily-plans', () => {
        return dependencies.dailyPlans.list();
    });
    ipc.handle('read-daily-plan', (_event, source, file) => {
        return dependencies.dailyPlans.read(source, file);
    });
    ipc.handle('get-daily-decisive-plan', (_event, chapter) => {
        return dependencies.dailyPlans.decisivePlan(chapter);
    });
    ipc.handle('get-system-daily-decisive-plan', (_event, chapter) => {
        return dependencies.dailyPlans.systemDecisivePlan(chapter);
    });
    ipc.handle('save-daily-decisive-plan', (_event, settings) => {
        const saved = dependencies.dailyPlans.saveDecisivePlan(settings);
        return dependencies.configuration.setDecisivePlan(saved);
    });
}
