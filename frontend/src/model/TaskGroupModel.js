"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskGroupModel = void 0;
var Logger_1 = require_Logger();
var index_js_1 = require_adapter();
var STORAGE_FILE = "task_groups.json";
var TASK_GROUPS_VERSION = 4;
var LEGACY_SYSTEM_PLAN_FILES = {
  "\u5468\u5E382\u7AE0-2-1.yaml": "bettle-\u5468\u5E38-2-1.yaml",
  "\u5468\u5E383\u7AE0-3-1.yaml": "bettle-\u5468\u5E38-3-1.yaml",
  "\u5468\u5E384\u7AE0-4-1.yaml": "bettle-\u5468\u5E38-4-1.yaml",
  "\u5468\u5E385\u7AE0-5-5.yaml": "bettle-\u5468\u5E38-5-5.yaml",
  "\u5468\u5E386\u7AE0-6-4.yaml": "bettle-\u5468\u5E38-6-4.yaml",
  "\u5468\u5E387\u7AE0-7-4.yaml": "bettle-\u5468\u5E38-7-4.yaml",
  "\u5468\u5E388\u7AE0-8-2.yaml": "bettle-\u5468\u5E38-8-2.yaml",
  "\u5468\u5E389\u7AE0-9-2.yaml": "bettle-\u5468\u5E38-9-2.yaml",
  "\u5468\u5E3810\u7AE0-10-1.yaml": "bettle-\u5468\u5E38-10-1.yaml"
};
var TaskGroupModel = class {
  constructor() {
    this.data = { version: TASK_GROUPS_VERSION, activeGroup: "", groups: [] };
  }
  get groups() {
    return this.data.groups;
  }
  get activeGroupName() {
    return this.data.activeGroup;
  }
  /** 获取当前选中的组，若不存在返回 null */
  getActiveGroup() {
    return this.data.groups.find((g) => g.name === this.data.activeGroup) ?? null;
  }
  /** 切换选中组 */
  setActiveGroup(name) {
    this.data.activeGroup = name;
  }
  /** 获取指定名称的组 */
  getGroup(name) {
    return this.data.groups.find((g) => g.name === name) ?? null;
  }
  /** 创建或更新 (同名覆盖) 一个组，返回该组 */
  upsertGroup(name, items) {
    const existing = this.data.groups.find((g) => g.name === name);
    if (existing) {
      if (items)
        existing.items = items;
      return existing;
    }
    const group = { name, items: items ?? [] };
    this.data.groups.push(group);
    if (!this.data.activeGroup)
      this.data.activeGroup = name;
    return group;
  }
  /** 重命名组 */
  renameGroup(oldName, newName) {
    if (oldName === newName)
      return true;
    if (this.data.groups.some((g) => g.name === newName))
      return false;
    const group = this.data.groups.find((g) => g.name === oldName);
    if (!group)
      return false;
    group.name = newName;
    if (this.data.activeGroup === oldName)
      this.data.activeGroup = newName;
    return true;
  }
  /** 删除组 */
  deleteGroup(name) {
    const idx = this.data.groups.findIndex((g) => g.name === name);
    if (idx === -1)
      return false;
    this.data.groups.splice(idx, 1);
    if (this.data.activeGroup === name) {
      this.data.activeGroup = this.data.groups[0]?.name ?? "";
    }
    return true;
  }
  /** 向指定组追加条目 */
  addItem(groupName, item) {
    const group = this.data.groups.find((g) => g.name === groupName);
    if (!group)
      return false;
    group.items.push(item);
    return true;
  }
  /** 移除指定组的指定位置条目 */
  removeItem(groupName, index) {
    const group = this.data.groups.find((g) => g.name === groupName);
    if (!group || index < 0 || index >= group.items.length)
      return false;
    group.items.splice(index, 1);
    return true;
  }
  /** 移动条目 (拖拽排序) */
  moveItem(groupName, fromIndex, toIndex) {
    const group = this.data.groups.find((g) => g.name === groupName);
    if (!group)
      return false;
    if (fromIndex < 0 || fromIndex >= group.items.length)
      return false;
    if (toIndex < 0 || toIndex >= group.items.length)
      return false;
    const [item] = group.items.splice(fromIndex, 1);
    group.items.splice(toIndex, 0, item);
    return true;
  }
  /** 更新条目的次数 */
  updateItemTimes(groupName, index, times) {
    const group = this.data.groups.find((g) => g.name === groupName);
    if (!group || index < 0 || index >= group.items.length)
      return false;
    group.items[index].times = Math.max(1, times);
    return true;
  }
  // ── 持久化 ──
  /** 从文件加载 */
  async load() {
    try {
      const content = await index_js_1.rendererFileRepository.readFile(STORAGE_FILE);
      const parsed = index_js_1.jsonCodec.parse(content);
      if (parsed && Array.isArray(parsed.groups)) {
        const needsMigration = parsed.version !== TASK_GROUPS_VERSION;
        this.data = this.migrate({ ...parsed, groups: parsed.groups });
        if (needsMigration)
          await this.save();
        Logger_1.Logger.debug(`\u4EFB\u52A1\u7EC4\u5DF2\u52A0\u8F7D: ${this.data.groups.length} \u4E2A\u7EC4 (v${this.data.version})`);
      }
    } catch {
    }
  }
  migrate(raw) {
    const groups = raw.groups.flatMap((group) => {
      if (!group || typeof group !== "object" || Array.isArray(group))
        return [];
      const source = group;
      const name = typeof source.name === "string" && source.name.trim() ? source.name : "\u9ED8\u8BA4";
      const items = Array.isArray(source.items) ? source.items.flatMap((item) => this.migrateItem(item)) : [];
      return [{ ...source, name, items }];
    });
    const activeGroup = typeof raw.activeGroup === "string" && groups.some((group) => group.name === raw.activeGroup) ? raw.activeGroup : groups[0]?.name ?? "";
    return {
      ...raw,
      version: TASK_GROUPS_VERSION,
      activeGroup,
      groups
    };
  }
  migrateItem(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return [];
    const source = { ...raw };
    const kind = source.kind === "preset" || source.kind === "template" || source.kind === "daily" ? source.kind : "plan";
    const pathValue = typeof source.path === "string" && source.path.trim() ? source.path : void 0;
    const managedFile = typeof source.managedFile === "string" && source.managedFile.trim() ? source.managedFile : void 0;
    const managedSource = source.managedSource === "system" || source.managedSource === "user" ? source.managedSource : this.inferManagedSource(pathValue);
    const dailySource = source.dailySource === "system" || source.dailySource === "user" ? source.dailySource : void 0;
    const dailyFile = typeof source.dailyFile === "string" && source.dailyFile.trim() ? source.dailyFile : void 0;
    const inferredFile = managedFile ?? this.inferManagedFile(pathValue);
    const migratedFile = managedSource === "system" && inferredFile ? LEGACY_SYSTEM_PLAN_FILES[inferredFile] ?? inferredFile : inferredFile;
    const label = typeof source.label === "string" && source.label.trim() ? source.label : (migratedFile ?? pathValue ?? "\u4EFB\u52A1").split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, "") ?? "\u4EFB\u52A1";
    return [{
      ...source,
      kind,
      path: pathValue,
      managedSource,
      managedFile: migratedFile,
      dailySource,
      dailyFile,
      times: typeof source.times === "number" && source.times > 0 ? source.times : 1,
      label
    }];
  }
  inferManagedSource(value) {
    if (!value)
      return void 0;
    if (/system_battle_plans|builtin_plans|system[\\/]/i.test(value))
      return "system";
    if (/user_battle_plans|plans[\\/]|user[\\/]/i.test(value))
      return "user";
    return void 0;
  }
  inferManagedFile(value) {
    if (!value || !/\.ya?ml$/i.test(value))
      return void 0;
    const source = this.inferManagedSource(value);
    if (!source)
      return void 0;
    const file = value.split(/[\\/]/).pop();
    return file && file.trim() ? file : void 0;
  }
  /** 保存到文件 */
  async save() {
    try {
      await index_js_1.rendererFileRepository.saveFile(STORAGE_FILE, index_js_1.jsonCodec.stringify(this.data));
      Logger_1.Logger.debug(`\u4EFB\u52A1\u7EC4\u5DF2\u4FDD\u5B58: ${this.data.groups.length} \u4E2A\u7EC4`);
      return true;
    } catch (e) {
      Logger_1.Logger.error(`\u4FDD\u5B58\u4EFB\u52A1\u7EC4\u5931\u8D25: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
};
exports.TaskGroupModel = TaskGroupModel;