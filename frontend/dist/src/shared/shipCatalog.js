"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_SHIPS = void 0;
/** 加载静态舰船资料并提供舰名和国籍只读目录。 */
const ship_details_json_1 = __importDefault(require("../data/ship_details.json"));
exports.ALL_SHIPS = ship_details_json_1.default.map(ship => ({
    name: ship.name,
    nation: ship.nation,
    ship_type: ship.ship_type,
}));
