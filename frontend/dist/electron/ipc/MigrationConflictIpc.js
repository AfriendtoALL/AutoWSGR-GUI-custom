"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMigrationConflictIpc = registerMigrationConflictIpc;
/** 注册迁移冲突读取和确认处理 IPC。 */
function registerMigrationConflictIpc(ipc, conflicts) {
    ipc.handle('get-migration-conflicts', () => conflicts.pending());
    ipc.handle('resolve-migration-conflicts', (_event, keepIds) => conflicts.resolve(keepIds));
}
