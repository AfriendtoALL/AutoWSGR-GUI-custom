"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetRuleView = void 0;
var FleetRuleView = class {
  constructor(host) {
    this.host = host;
    this.levelEnabled = document.getElementById("fleet-level-enabled");
    this.levelFields = document.getElementById("fleet-level-fields");
    this.minLevel = document.getElementById("fleet-min-level");
    this.maxLevel = document.getElementById("fleet-max-level");
    this.relaxedEnabled = document.getElementById("fleet-relaxed-enabled");
    this.backupLevelEnabled = document.getElementById("fleet-backup-level-enabled");
    this.backupLevelFields = document.getElementById("fleet-backup-level-fields");
    this.backupMinLevel = document.getElementById("fleet-backup-min-level");
    this.backupMaxLevel = document.getElementById("fleet-backup-max-level");
    this.backupRelaxedEnabled = document.getElementById("fleet-backup-relaxed-enabled");
    this.bindActions();
  }
  render() {
    const primary = this.host.primaryRule();
    const hasPrimary = primary.primary !== null;
    this.levelEnabled.checked = primary.levelEnabled;
    this.levelEnabled.disabled = !hasPrimary;
    this.levelFields.hidden = !hasPrimary || !primary.levelEnabled;
    this.minLevel.disabled = !hasPrimary;
    this.maxLevel.disabled = !hasPrimary;
    this.minLevel.value = primary.minLevel === null ? "" : String(primary.minLevel);
    this.maxLevel.value = primary.maxLevel === null ? "" : String(primary.maxLevel);
    this.relaxedEnabled.checked = hasPrimary && primary.relaxed;
    this.relaxedEnabled.disabled = !hasPrimary;
    this.updateLevelValidity(primary, this.minLevel, this.maxLevel);
    const backup = this.host.backupRule();
    const hasBackup = backup.ship !== null;
    this.backupLevelEnabled.checked = hasBackup && backup.levelEnabled;
    this.backupLevelEnabled.disabled = !hasBackup;
    this.backupLevelFields.hidden = !hasBackup || !backup.levelEnabled;
    this.backupMinLevel.disabled = !hasBackup;
    this.backupMaxLevel.disabled = !hasBackup;
    this.backupMinLevel.value = backup.minLevel === null ? "" : String(backup.minLevel);
    this.backupMaxLevel.value = backup.maxLevel === null ? "" : String(backup.maxLevel);
    this.backupRelaxedEnabled.checked = hasBackup && backup.relaxed;
    this.backupRelaxedEnabled.disabled = !hasBackup;
    this.updateLevelValidity(backup, this.backupMinLevel, this.backupMaxLevel);
  }
  bindActions() {
    this.levelEnabled.addEventListener("change", () => {
      this.host.updatePrimaryRule({
        levelEnabled: this.levelEnabled.checked
      });
      this.levelFields.hidden = !this.levelEnabled.checked;
    });
    this.minLevel.addEventListener("input", () => {
      this.host.updatePrimaryRule({
        minLevel: this.readLevel(this.minLevel)
      });
      this.updateLevelValidity(this.host.primaryRule(), this.minLevel, this.maxLevel);
    });
    this.maxLevel.addEventListener("input", () => {
      this.host.updatePrimaryRule({
        maxLevel: this.readLevel(this.maxLevel)
      });
      this.updateLevelValidity(this.host.primaryRule(), this.minLevel, this.maxLevel);
    });
    this.relaxedEnabled.addEventListener("change", () => {
      this.host.updatePrimaryRule({
        relaxed: this.relaxedEnabled.checked
      });
    });
    this.backupLevelEnabled.addEventListener("change", () => {
      const rule = this.host.backupRule();
      const levelEnabled = rule.ship !== null && this.backupLevelEnabled.checked;
      this.host.updateBackupRule({ levelEnabled });
      this.backupLevelEnabled.checked = levelEnabled;
      this.backupLevelFields.hidden = !levelEnabled;
    });
    this.backupMinLevel.addEventListener("input", () => {
      this.host.updateBackupRule({
        minLevel: this.readLevel(this.backupMinLevel)
      });
      this.updateLevelValidity(this.host.backupRule(), this.backupMinLevel, this.backupMaxLevel);
    });
    this.backupMaxLevel.addEventListener("input", () => {
      this.host.updateBackupRule({
        maxLevel: this.readLevel(this.backupMaxLevel)
      });
      this.updateLevelValidity(this.host.backupRule(), this.backupMinLevel, this.backupMaxLevel);
    });
    this.backupRelaxedEnabled.addEventListener("change", () => {
      this.host.updateBackupRule({
        relaxed: this.backupRelaxedEnabled.checked
      });
    });
  }
  readLevel(input) {
    if (!input.value.trim())
      return null;
    return Number(input.value);
  }
  updateLevelValidity(rule, minInput, maxInput) {
    const minInvalid = minInput.value !== "" && (!Number.isInteger(Number(minInput.value)) || Number(minInput.value) < 1);
    const maxInvalid = maxInput.value !== "" && (!Number.isInteger(Number(maxInput.value)) || Number(maxInput.value) < 1);
    const rangeInvalid = rule.minLevel !== null && rule.maxLevel !== null && rule.maxLevel < rule.minLevel;
    minInput.setCustomValidity(minInvalid ? "\u6700\u5C0F\u7B49\u7EA7\u5FC5\u987B\u662F\u5927\u4E8E\u6216\u7B49\u4E8E 1 \u7684\u6574\u6570" : "");
    maxInput.setCustomValidity(maxInvalid ? "\u6700\u5927\u7B49\u7EA7\u5FC5\u987B\u662F\u5927\u4E8E\u6216\u7B49\u4E8E 1 \u7684\u6574\u6570" : rangeInvalid ? "\u6700\u5927\u7B49\u7EA7\u5FC5\u987B\u5927\u4E8E\u6216\u7B49\u4E8E\u6700\u5C0F\u7B49\u7EA7" : "");
  }
};
exports.FleetRuleView = FleetRuleView;