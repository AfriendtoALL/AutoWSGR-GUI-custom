"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeQueueItem = placeQueueItem;
exports.removeQueueItem = removeQueueItem;
exports.moveQueueItem = moveQueueItem;
/**
 * 7.8/R43：编队「候选舰船优先级」的唯一实现。
 * 常规编队的候选槽位与决战编队的主选/备选队列都走这里调整顺序，
 * 改优先级规则（交换 / 插入 / 补空位）只需改本文件。
 */
function placeQueueItem(queue, item, requestedIndex, maxIndex) {
  const requested = Number.isFinite(requestedIndex) ? Math.trunc(requestedIndex) : 0;
  const limit = Number.isFinite(maxIndex) ? Math.min(Math.max(0, requested), maxIndex) : Math.max(0, requested);
  if (limit < queue.length) {
    queue[limit] = item;
    return limit;
  }
  const target = Math.min(limit, queue.length);
  queue.splice(target, 0, item);
  return target;
}
function removeQueueItem(queue, index) {
  if (!Number.isInteger(index) || index < 0 || index >= queue.length)
    return false;
  queue.splice(index, 1);
  return true;
}
/**
 * 把 source[sourceIndex] 移到同一队列或另一个队列的 targetIndex：
 * 目标位已有值则交换，目标位为空则移除源项后插入；返回落点下标或 null。
 * afterMove 供调用方做压缩/补空槽等收尾。
 */
function moveQueueItem(source, sourceIndex, target, targetIndex, afterMove) {
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex < 0 || targetIndex < 0)
    return null;
  const item = source[sourceIndex];
  if (item === void 0)
    return null;
  let landed = targetIndex;
  if (source === target) {
    if (sourceIndex === targetIndex)
      return null;
    if (targetIndex < target.length) {
      [source[sourceIndex], target[targetIndex]] = [target[targetIndex], item];
    } else {
      source.splice(sourceIndex, 1);
      target.push(item);
      landed = target.length - 1;
    }
  } else {
    const replaced = target[targetIndex];
    if (replaced !== void 0) {
      [source[sourceIndex], target[targetIndex]] = [replaced, item];
    } else {
      source.splice(sourceIndex, 1);
      const insertAt = Math.min(targetIndex, target.length);
      target.splice(insertAt, 0, item);
      landed = Math.min(target.length - 1, insertAt);
    }
  }
  afterMove?.();
  return landed;
}