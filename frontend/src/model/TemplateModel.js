"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateModel = void 0;
var index_js_1 = require_adapter();
var FILE_PATH = "templates/templates.json";
var BUILTIN_PATH = "resource/builtin_templates.json";
var idCounter = 0;
function generateId() {
  return `tpl_${Date.now()}_${++idCounter}`;
}
function isTemplateType(value) {
  return value === "normal_fight" || value === "event_fight" || value === "exercise" || value === "campaign" || value === "decisive";
}
var TemplateModel = class {
  constructor() {
    this.builtinTemplates = [];
    this.userTemplates = [];
    this.io = null;
  }
  /** 初始化：传入 IPC bridge 并从本地文件加载 */
  async init(io) {
    this.io = io;
    await this.loadBuiltin();
    await this.load();
  }
  /** 所有模板（内置 + 用户） */
  getAll() {
    return [...this.builtinTemplates, ...this.userTemplates];
  }
  /** 查找模板 */
  get(id) {
    return this.builtinTemplates.find((t) => t.id === id) ?? this.userTemplates.find((t) => t.id === id);
  }
  /** 是否为内置模板 */
  isBuiltin(id) {
    return this.builtinTemplates.some((t) => t.id === id);
  }
  /** 添加模板 */
  async add(tpl) {
    const full = {
      ...tpl,
      id: generateId(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.userTemplates.push(full);
    await this.save();
    return full;
  }
  /** 删除模板（内置模板不可删除） */
  async remove(id) {
    if (this.isBuiltin(id))
      return false;
    const idx = this.userTemplates.findIndex((t) => t.id === id);
    if (idx < 0)
      return false;
    this.userTemplates.splice(idx, 1);
    await this.save();
    return true;
  }
  /** 重命名模板（内置模板不可重命名） */
  async rename(id, newName) {
    if (this.isBuiltin(id))
      return;
    const tpl = this.userTemplates.find((t) => t.id === id);
    if (tpl) {
      tpl.name = newName;
      await this.save();
    }
  }
  /** 更新模板字段（内置模板不可更新） */
  async update(id, fields) {
    if (this.isBuiltin(id))
      return false;
    const tpl = this.userTemplates.find((t) => t.id === id);
    if (!tpl)
      return false;
    Object.assign(tpl, fields);
    await this.save();
    return true;
  }
  /** 从 JSON 数组导入模板，自动分配新 id */
  async importFromJson(raw) {
    let count = 0;
    for (const item of raw) {
      if (!item || typeof item !== "object")
        continue;
      const rec = item;
      if (typeof rec.name !== "string" || !isTemplateType(rec.type))
        continue;
      const tpl = {
        ...rec,
        name: rec.name,
        type: rec.type,
        id: generateId(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      delete tpl.builtin;
      this.userTemplates.push(tpl);
      count++;
    }
    if (count > 0)
      await this.save();
    return count;
  }
  /** 持久化用户模板到本地文件 */
  async save() {
    if (!this.io)
      throw new Error("\u6A21\u677F\u5B58\u50A8\u5C1A\u672A\u521D\u59CB\u5316");
    await this.io.saveFile(FILE_PATH, index_js_1.jsonCodec.stringify(this.userTemplates));
  }
  /** 从本地文件加载用户模板 */
  async load() {
    if (!this.io)
      return;
    try {
      const raw = await this.io.readFile(FILE_PATH);
      if (raw) {
        this.userTemplates = index_js_1.jsonCodec.parse(raw);
        return;
      }
    } catch {
    }
    try {
      const raw = await this.io.readFile("templates.json");
      if (raw) {
        this.userTemplates = index_js_1.jsonCodec.parse(raw);
        await this.save();
      }
    } catch {
    }
  }
  /** 从只读资源加载内置模板 */
  async loadBuiltin() {
    if (!this.io)
      return;
    try {
      const raw = await this.io.readFile(BUILTIN_PATH);
      if (raw) {
        const arr = index_js_1.jsonCodec.parse(raw);
        this.builtinTemplates = arr.map((t) => ({ ...t, builtin: true }));
      }
    } catch {
    }
  }
};
exports.TemplateModel = TemplateModel;