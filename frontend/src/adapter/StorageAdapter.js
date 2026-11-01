"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserStorageStore = void 0;
exports.browserStorageStore = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};