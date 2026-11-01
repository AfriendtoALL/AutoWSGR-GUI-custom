"use strict";
var __importDefault = exports && exports.__importDefault || function(mod) {
  return mod && mod.__esModule ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_SHIPS = void 0;
var ship_details_json_1 = __importDefault(require_ship_details());
exports.ALL_SHIPS = ship_details_json_1.default.map((ship) => ({
  name: ship.name,
  nation: ship.nation,
  ship_type: ship.ship_type
}));