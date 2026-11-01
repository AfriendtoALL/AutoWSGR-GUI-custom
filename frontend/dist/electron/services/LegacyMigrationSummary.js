"use strict";
/**
 * 汇总一次旧版数据迁移的执行结果。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyLegacyMigrationSummary = emptyLegacyMigrationSummary;
exports.mergeLegacyMigrationSummaries = mergeLegacyMigrationSummaries;
/** 创建不含迁移项的初始结果。 */
function emptyLegacyMigrationSummary(detected = false) {
    return {
        detected,
        total: 0,
        succeeded: 0,
        failed: 0,
        failedFiles: [],
    };
}
/** 合并设置、任务组和计划等多个迁移阶段的结果。 */
function mergeLegacyMigrationSummaries(...summaries) {
    return summaries.reduce((merged, summary) => ({
        detected: merged.detected || summary.detected,
        total: merged.total + summary.total,
        succeeded: merged.succeeded + summary.succeeded,
        failed: merged.failed + summary.failed,
        failedFiles: [
            ...merged.failedFiles,
            ...summary.failedFiles,
        ],
    }), emptyLegacyMigrationSummary());
}
