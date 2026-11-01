"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureScrollPosition = captureScrollPosition;
exports.restoreScrollPosition = restoreScrollPosition;
function captureScrollPosition(element) {
  return {
    top: element?.scrollTop ?? 0,
    left: element?.scrollLeft ?? 0
  };
}
function restoreScrollPosition(element, position) {
  if (!element)
    return;
  element.scrollTop = position.top;
  element.scrollLeft = position.left;
  requestAnimationFrame(() => {
    element.scrollTop = position.top;
    element.scrollLeft = position.left;
  });
}