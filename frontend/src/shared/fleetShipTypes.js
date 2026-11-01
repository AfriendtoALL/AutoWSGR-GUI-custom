"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHIP_TYPE_FILTER_ORDER = exports.FLEET_SHIP_TYPE_CODES = exports.TYPE_LABELS = exports.NATIVE_FLEET_SHIP_TYPE_LABELS = exports.NATIVE_FLEET_SHIP_TYPE_CODES = void 0;
exports.normalizeFleetShipTypeCode = normalizeFleetShipTypeCode;
exports.shipTypeLabel = shipTypeLabel;
var nativeFleetShipTypes_generated_1 = require_nativeFleetShipTypes_generated();
var nativeFleetShipTypes_generated_2 = require_nativeFleetShipTypes_generated();
Object.defineProperty(exports, "NATIVE_FLEET_SHIP_TYPE_CODES", { enumerable: true, get: function() {
  return nativeFleetShipTypes_generated_2.NATIVE_FLEET_SHIP_TYPE_CODES;
} });
Object.defineProperty(exports, "NATIVE_FLEET_SHIP_TYPE_LABELS", { enumerable: true, get: function() {
  return nativeFleetShipTypes_generated_2.NATIVE_FLEET_SHIP_TYPE_LABELS;
} });
exports.TYPE_LABELS = Object.freeze({
  ...nativeFleetShipTypes_generated_1.NATIVE_FLEET_SHIP_TYPE_LABELS,
  ss_or_ssg: "\u6F5C\u8247/\u5BFC\u6F5C"
});
exports.FLEET_SHIP_TYPE_CODES = Object.freeze([
  ...nativeFleetShipTypes_generated_1.NATIVE_FLEET_SHIP_TYPE_CODES,
  "ss_or_ssg"
]);
var CANONICAL_FLEET_SHIP_TYPES = new Set(exports.FLEET_SHIP_TYPE_CODES);
var SHIP_TYPE_FILTER_PRIORITY = Object.freeze([
  "ap",
  "av",
  "cv",
  "bb",
  "bbg",
  "bbv",
  "bc",
  "bm",
  "ca",
  "cav",
  "cl",
  "clt",
  "cvl",
  "dd",
  "asdg",
  "kp",
  "ssg",
  "sc",
  "ss",
  "aadg",
  "cg",
  "bg",
  "aabg"
]);
exports.SHIP_TYPE_FILTER_ORDER = Object.freeze([
  ...SHIP_TYPE_FILTER_PRIORITY.filter((code) => nativeFleetShipTypes_generated_1.NATIVE_FLEET_SHIP_TYPE_CODES.includes(code)),
  ...nativeFleetShipTypes_generated_1.NATIVE_FLEET_SHIP_TYPE_CODES.filter((code) => !SHIP_TYPE_FILTER_PRIORITY.includes(code))
]);
function normalizeFleetShipTypeCode(value) {
  const code = value.trim().toLowerCase();
  return CANONICAL_FLEET_SHIP_TYPES.has(code) ? code : null;
}
function shipTypeLabel(code) {
  const canonical = normalizeFleetShipTypeCode(code);
  return canonical ? exports.TYPE_LABELS[canonical] : code;
}