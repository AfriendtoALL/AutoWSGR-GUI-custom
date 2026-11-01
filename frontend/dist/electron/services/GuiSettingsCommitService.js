"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuiSettingsCommitService = void 0;
/** 维护设置页跨文件提交与失败恢复的不变量。 */
class GuiSettingsCommitService {
    constructor(configuration, secureFiles, windows) {
        this.configuration = configuration;
        this.secureFiles = secureFiles;
        this.windows = windows;
    }
    commitAtomic(settings) {
        if (!settings
            || typeof settings !== 'object'
            || typeof settings.usersettingsYaml !== 'string') {
            throw new Error('设置提交内容无效');
        }
        const preparedWindow = this.windows.preparePreferences(settings.windowPreferences);
        const yamlSnapshot = this.secureFiles.snapshot('usersettings.yaml');
        this.secureFiles.save('usersettings.yaml', settings.usersettingsYaml);
        try {
            const automation = this.configuration.commitSettings(settings, preparedWindow.settingsPatch);
            return {
                automation,
                windowPreferences: preparedWindow.preferences,
            };
        }
        catch (error) {
            try {
                this.secureFiles.restore('usersettings.yaml', yamlSnapshot);
            }
            catch (rollbackError) {
                throw new Error(`设置提交失败，且 usersettings.yaml 恢复失败: ${rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError)}；原始错误: ${error instanceof Error ? error.message : String(error)}`);
            }
            throw error;
        }
    }
}
exports.GuiSettingsCommitService = GuiSettingsCommitService;
