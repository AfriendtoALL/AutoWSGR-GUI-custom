"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonCodec = void 0;
exports.jsonCodec = {
  parse(content) {
    return JSON.parse(content);
  },
  stringify(value) {
    return JSON.stringify(value, null, 2);
  }
};