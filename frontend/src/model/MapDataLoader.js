"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMapData = loadMapData;
exports.loadEventMapCatalog = loadEventMapCatalog;
exports.loadEventMapData = loadEventMapData;
exports.getNodeType = getNodeType;
exports.isDetourNode = isDetourNode;
exports.isNightNode = isNightNode;
exports.isTerminalNode = isTerminalNode;
var index_js_1 = require_adapter();
var mapCache = /* @__PURE__ */ new Map();
var eventCatalogPromise = null;
var eventMapFiles = /* @__PURE__ */ new Map();
function eventMapKey(eventName, chapter, map) {
  return `${eventName}:${chapter}:${map}`;
}
function isSafeMapFileName(value) {
  return typeof value === "string" && /^[^/\\]+\.json$/i.test(value) && value !== ".json" && !value.includes("..");
}
async function readMap(filePath) {
  try {
    const content = await index_js_1.mapDataRepository.read(filePath);
    return index_js_1.jsonCodec.parse(content);
  } catch {
    return null;
  }
}
async function loadMapData(chapter, map) {
  const key = `${chapter}-${map}`;
  if (mapCache.has(key))
    return mapCache.get(key);
  const data = await readMap(`resource/maps/normal/${key}.json`);
  if (data)
    mapCache.set(key, data);
  return data;
}
function normalizeEventNodeType(raw) {
  switch (String(raw).toUpperCase()) {
    case "NULL":
      return "Start";
    case "FIGTH":
    case "FIGHT":
      return "Normal";
    case "BOSS":
    case "SPECIAL_BOSS":
    case "LITTLE_BOSS":
      return "Boss";
    default:
      return "Normal";
  }
}
function loadEventMapCatalog() {
  if (eventCatalogPromise)
    return eventCatalogPromise;
  eventCatalogPromise = index_js_1.mapDataRepository.read("resource/maps/event/index.json").then((content) => {
    const catalog = index_js_1.jsonCodec.parse(content);
    if (catalog.schema_version !== 2 || !Array.isArray(catalog.events)) {
      return [];
    }
    eventMapFiles.clear();
    return catalog.events.flatMap((entry) => {
      if (!entry || typeof entry.event !== "string" || !/^\d{8}$/.test(entry.event)) {
        return [];
      }
      const chapters = { E: [], H: [] };
      const files = {
        E: {},
        H: {}
      };
      const eventChapters = ["E", "H"];
      for (const chapter of eventChapters) {
        const maps = entry.chapters?.[chapter];
        if (!Array.isArray(maps))
          continue;
        chapters[chapter] = maps.map(String).filter((map) => /^\d+(?:[ab])?$/.test(map));
        const chapterFiles = entry.files?.[chapter];
        if (!chapterFiles || typeof chapterFiles !== "object")
          continue;
        for (const map of chapters[chapter]) {
          const file = chapterFiles[map];
          if (!isSafeMapFileName(file))
            continue;
          files[chapter][map] = file;
          eventMapFiles.set(eventMapKey(entry.event, chapter, map), file);
        }
      }
      const normalized = {
        event: entry.event,
        chapters
      };
      if (Object.keys(files.E).length > 0 || Object.keys(files.H).length > 0) {
        normalized.files = files;
      }
      return [normalized];
    });
  }).catch(() => []);
  return eventCatalogPromise;
}
function normalizeEventNodeId(nodeId) {
  return nodeId === "\u03B1" || nodeId === "\u03B2" ? "0" : nodeId;
}
async function loadEventMapData(eventName, chapter, map) {
  const match = String(map).trim().match(/^(\d+)([ab])?$/i);
  const rawDifficulty = String(chapter).trim().toUpperCase();
  const normalizedEvent = String(eventName).trim();
  if (!/^\d{8}$/.test(normalizedEvent) || !match || !["E", "H"].includes(rawDifficulty)) {
    return null;
  }
  const difficulty = rawDifficulty === "E" ? "E" : "H";
  const stage = match[1];
  const entrance = match[2]?.toLowerCase() ?? "";
  const mapCode = `${stage}${entrance}`;
  const key = `event-${normalizedEvent}-${difficulty}-${mapCode}`;
  if (mapCache.has(key))
    return mapCache.get(key);
  await loadEventMapCatalog();
  const canonicalFile = eventMapFiles.get(eventMapKey(normalizedEvent, difficulty, mapCode));
  if (!canonicalFile)
    return null;
  const raw = await readMap(`resource/maps/event/${normalizedEvent}/${canonicalFile}`);
  if (!raw)
    return null;
  const data = {};
  for (const [id, point] of Object.entries(raw)) {
    const normalizedId = normalizeEventNodeId(id);
    const position = Array.isArray(point.position) && point.position.length === 2 ? [Number(point.position[0]), Number(point.position[1])] : [0, 0];
    data[normalizedId] = {
      type: normalizeEventNodeType(point.type),
      detour: !!point.detour,
      night: !!point.night,
      position,
      next: Array.isArray(point.next) ? point.next.map((node) => normalizeEventNodeId(String(node))) : []
    };
  }
  mapCache.set(key, data);
  return data;
}
function getNodeType(mapData, nodeId) {
  return mapData[nodeId]?.type ?? "Normal";
}
function isDetourNode(mapData, nodeId) {
  return mapData[nodeId]?.detour ?? false;
}
function isNightNode(mapData, nodeId) {
  return mapData[nodeId]?.night ?? false;
}
function isTerminalNode(mapData, nodeId) {
  const next = mapData[nodeId]?.next;
  return !next || next.length === 0;
}