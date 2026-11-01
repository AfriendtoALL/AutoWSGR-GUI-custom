"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadItemMetas = loadItemMetas;
var managedPlanReader_1 = require_managedPlanReader();
var adapter_1 = require_adapter();
var IpcAdapter_1 = require_IpcAdapter();
var REPAIR = { 1: "\u4E2D\u7834\u5C31\u4FEE", 2: "\u5927\u7834\u624D\u4FEE" };
var TYPE_LABELS = {
  normal_fight: "\u666E\u901A\u51FA\u51FB",
  event_fight: "\u6D3B\u52A8\u51FA\u51FB",
  exercise: "\u6F14\u4E60",
  campaign: "\u6218\u5F79",
  decisive: "\u51B3\u6218"
};
async function loadItemMetas(items, templateModel, repository = (0, IpcAdapter_1.getPlansGateway)()) {
  if (!repository)
    return items.map(() => null);
  return Promise.all(items.map(async (item) => {
    try {
      if (item.kind === "template") {
        const tpl = templateModel.get(item.templateId ?? "");
        if (!tpl)
          return { typeLabel: "\u6A21\u677F\u5DF2\u5220\u9664" };
        const meta2 = { typeLabel: TYPE_LABELS[tpl.type] ?? tpl.type };
        if (tpl.fleet_id)
          meta2.fleetId = tpl.fleet_id;
        if (item.fleet_id)
          meta2.fleetId = item.fleet_id;
        if (tpl.fleet?.length)
          meta2.fleet = tpl.fleet.filter(Boolean);
        if (item.campaignName)
          meta2.mapName = item.campaignName;
        else if (tpl.campaign_name)
          meta2.mapName = tpl.campaign_name;
        if (item.chapter)
          meta2.mapName = `\u51B3\u6218\u7B2C${item.chapter}\u7AE0`;
        else if (tpl.chapter)
          meta2.mapName = `\u51B3\u6218\u7B2C${tpl.chapter}\u7AE0`;
        return meta2;
      }
      const { content } = await (0, managedPlanReader_1.readTaskGroupItemFile)(item, repository);
      const parsed = adapter_1.yamlCodec.parse(content);
      if (!parsed || typeof parsed !== "object")
        return null;
      const meta = {};
      if ("chapter" in parsed && "map" in parsed) {
        const ch = String(parsed.chapter);
        const mp = String(parsed.map);
        if ("event" in parsed || /^[EH]$/i.test(ch)) {
          const chapter = ch.toUpperCase();
          meta.mapName = chapter === "EX" ? `EX-${mp.toUpperCase()}` : `${chapter}${mp.toUpperCase()}`;
          meta.typeLabel = "\u6D3B\u52A8\u51FA\u51FB";
        } else {
          const chapterNumber = Number(ch);
          meta.mapName = chapterNumber === 99 ? `Ex-${Number(mp)}` : `${chapterNumber}-${Number(mp)}`;
        }
      }
      if ("fleet_id" in parsed)
        meta.fleetId = Number(parsed.fleet_id) || void 0;
      if ("repair_mode" in parsed) {
        const rm = parsed.repair_mode;
        if (typeof rm === "number")
          meta.repairMode = REPAIR[rm] ?? `\u4FEE\u7406${rm}`;
        else if (Array.isArray(rm))
          meta.repairMode = REPAIR[rm[0]] ?? `\u4FEE\u7406${rm[0]}`;
      }
      if ("task_type" in parsed && !("map" in parsed)) {
        meta.typeLabel = TYPE_LABELS[String(parsed.task_type)] ?? String(parsed.task_type);
      }
      if ("fleet" in parsed && Array.isArray(parsed.fleet)) {
        meta.fleet = parsed.fleet.map((s) => String(s || "")).filter(Boolean);
      }
      if ("fleet_presets" in parsed && Array.isArray(parsed.fleet_presets)) {
        const presetIndex = item.fleetPresetIndex ?? 0;
        const preset = parsed.fleet_presets[presetIndex];
        if (preset && typeof preset === "object" && "name" in preset) {
          meta.fleetPresetName = String(preset.name || "").trim() || void 0;
        }
      }
      return meta;
    } catch {
      return null;
    }
  }));
}