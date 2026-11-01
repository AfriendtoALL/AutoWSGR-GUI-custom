"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorderFleetSlots = reorderFleetSlots;
exports.isFleetSlotEmpty = isFleetSlotEmpty;
exports.hasOtherPrimaryShip = hasOtherPrimaryShip;
exports.compactFleetDraftSlots = compactFleetDraftSlots;
exports.resolveFleetSlotPosition = resolveFleetSlotPosition;
exports.removeFleetPrimary = removeFleetPrimary;
exports.resolveGalleryFormationAssignment = resolveGalleryFormationAssignment;
exports.resolveGalleryFormationDropTarget = resolveGalleryFormationDropTarget;
exports.insertFleetPrimary = insertFleetPrimary;
exports.insertFleetCandidate = insertFleetCandidate;
exports.moveFleetPrimary = moveFleetPrimary;
exports.createFleetRuleDraft = createFleetRuleDraft;
exports.createFleetCandidateDraft = createFleetCandidateDraft;
exports.createFleetSlotDraft = createFleetSlotDraft;
exports.createFleetDraft = createFleetDraft;
exports.cloneFleetRule = cloneFleetRule;
exports.copyFleetRule = copyFleetRule;
exports.fleetDraftSnapshot = fleetDraftSnapshot;
exports.hasFleetDraftChanges = hasFleetDraftChanges;
exports.fleetDraftToTeamPlan = fleetDraftToTeamPlan;
exports.fleetDraftFromTeamPlan = fleetDraftFromTeamPlan;
var fleetShipTypes_js_1 = require_fleetShipTypes();
var DEFAULT_BACKUP_SLOT_COUNT = 6;
var FLEET_SLOT_COUNT = 6;
var ALLOWED_FLEET_SHIP_TYPES = new Set(fleetShipTypes_js_1.FLEET_SHIP_TYPE_CODES);
function reorderFleetSlots(slots, mode, reorder) {
  if (mode === "ship")
    return reorder();
  const candidatesByPosition = slots.map((slot) => slot.candidates);
  try {
    return reorder();
  } finally {
    slots.forEach((slot, index) => {
      slot.candidates = candidatesByPosition[index];
    });
  }
}
function isFleetSlotEmpty(slot) {
  return slot.primary === null && slot.candidates.every((candidate) => candidate.ship === null);
}
function hasOtherPrimaryShip(slots, searchName, targetPosition) {
  return slots.some((slot, position) => position !== targetPosition && slot.primary?.search_name === searchName);
}
function compactFleetDraftSlots(slots) {
  const occupied = slots.filter((slot) => !isFleetSlotEmpty(slot));
  slots.splice(0, slots.length, ...occupied, ...Array.from({ length: Math.max(0, FLEET_SLOT_COUNT - occupied.length) }, createFleetSlotDraft));
}
function resolveFleetSlotPosition(slots, focusedSlot, fallbackPosition) {
  const position = slots.indexOf(focusedSlot);
  return position >= 0 ? position : fallbackPosition;
}
function removeFleetPrimary(slots, removedPosition, activePosition) {
  const removed = slots[removedPosition];
  if (!removed?.primary)
    return activePosition;
  const focused = slots[activePosition];
  const deletingFocused = removedPosition === activePosition;
  removed.primary = null;
  copyFleetRule(removed, createFleetRuleDraft());
  compactFleetDraftSlots(slots);
  const preferred = deletingFocused ? removed : focused;
  return resolveFleetSlotPosition(slots, preferred, Math.min(Math.max(0, removedPosition), FLEET_SLOT_COUNT - 1));
}
function resolveGalleryFormationAssignment(slots, activePosition, searchName) {
  const currentPosition = Math.min(Math.max(0, activePosition), FLEET_SLOT_COUNT - 1);
  const existingPosition = slots.findIndex((slot) => slot.primary?.search_name === searchName);
  if (existingPosition >= 0) {
    return {
      targetPosition: existingPosition,
      activePosition: currentPosition
    };
  }
  const current = slots[currentPosition];
  if (current && isFleetSlotEmpty(current)) {
    const firstEmpty = slots.findIndex(isFleetSlotEmpty);
    const targetPosition = firstEmpty >= 0 ? firstEmpty : currentPosition;
    const nextPosition2 = targetPosition + 1;
    const canAdvance2 = nextPosition2 < FLEET_SLOT_COUNT && slots.slice(nextPosition2).every(isFleetSlotEmpty);
    return {
      targetPosition,
      activePosition: canAdvance2 ? nextPosition2 : targetPosition
    };
  }
  const nextPosition = currentPosition + 1;
  const canAdvance = nextPosition < FLEET_SLOT_COUNT && slots.slice(nextPosition).every(isFleetSlotEmpty);
  if (canAdvance) {
    return {
      targetPosition: nextPosition,
      activePosition: nextPosition
    };
  }
  return {
    targetPosition: currentPosition,
    activePosition: currentPosition
  };
}
function resolveGalleryFormationDropTarget(slots, targetPosition) {
  const boundedTarget = Math.min(Math.max(0, targetPosition), FLEET_SLOT_COUNT - 1);
  const firstEmpty = slots.findIndex(isFleetSlotEmpty);
  return firstEmpty >= 0 && firstEmpty < boundedTarget ? firstEmpty : boundedTarget;
}
function insertFleetPrimary(slots, targetPosition, inserted, mode) {
  if (targetPosition < 0 || targetPosition >= slots.length || isFleetSlotEmpty(inserted)) {
    return null;
  }
  const emptyPosition = slots.findIndex((slot, position) => position >= targetPosition && isFleetSlotEmpty(slot));
  if (emptyPosition < 0)
    return null;
  return reorderFleetSlots(slots, mode, () => {
    slots.splice(emptyPosition, 1);
    slots.splice(targetPosition, 0, inserted);
    return inserted;
  });
}
function insertFleetCandidate(candidates, targetIndex, inserted) {
  if (targetIndex < 0 || targetIndex >= candidates.length || !inserted.ship) {
    return -1;
  }
  const emptyPosition = candidates.findIndex((candidate, index) => index >= targetIndex && candidate.ship === null);
  if (emptyPosition >= 0)
    candidates.splice(emptyPosition, 1);
  candidates.splice(targetIndex, 0, inserted);
  const occupied = candidates.filter((candidate) => candidate.ship !== null);
  const slotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, occupied.length);
  candidates.splice(0, candidates.length, ...occupied, ...Array.from({ length: slotCount - occupied.length }, createFleetCandidateDraft));
  return candidates.indexOf(inserted);
}
function moveFleetPrimary(slots, sourcePosition, targetPosition, mode) {
  const source = slots[sourcePosition];
  const target = slots[targetPosition];
  if (!source || !target || isFleetSlotEmpty(source))
    return null;
  if (sourcePosition === targetPosition)
    return source;
  const targetIsCandidateCollection = !target.primary && !isFleetSlotEmpty(target);
  const sourceHasCandidates = source.candidates.some((candidate) => candidate.ship !== null);
  if (source.primary && !sourceHasCandidates && targetIsCandidateCollection) {
    target.primary = source.primary;
    copyFleetRule(target, source);
    source.primary = null;
    copyFleetRule(source, createFleetRuleDraft());
    if (isFleetSlotEmpty(source))
      compactFleetDraftSlots(slots);
    return target;
  }
  if (source.primary && mode === "position" && isFleetSlotEmpty(target)) {
    const destinationPosition = resolveGalleryFormationDropTarget(slots, targetPosition);
    const destination = slots[destinationPosition];
    if (!destination || !isFleetSlotEmpty(destination))
      return null;
    destination.primary = source.primary;
    copyFleetRule(destination, source);
    source.primary = null;
    copyFleetRule(source, createFleetRuleDraft());
    if (isFleetSlotEmpty(source))
      compactFleetDraftSlots(slots);
    return destination;
  }
  return reorderFleetSlots(slots, mode, () => {
    if (!isFleetSlotEmpty(target)) {
      [slots[sourcePosition], slots[targetPosition]] = [
        target,
        source
      ];
      return source;
    }
    slots.splice(sourcePosition, 1);
    const firstEmpty = slots.findIndex(isFleetSlotEmpty);
    slots.splice(firstEmpty < 0 ? slots.length : firstEmpty, 0, source);
    return source;
  });
}
function createFleetRuleDraft() {
  return {
    shipTypes: [],
    levelEnabled: false,
    minLevel: null,
    maxLevel: null,
    relaxed: false
  };
}
function createFleetCandidateDraft(ship = null) {
  return {
    ship,
    ...createFleetRuleDraft()
  };
}
function createFleetSlotDraft() {
  return {
    primary: null,
    candidates: Array.from({ length: DEFAULT_BACKUP_SLOT_COUNT }, () => createFleetCandidateDraft()),
    ...createFleetRuleDraft()
  };
}
function createFleetDraft() {
  return {
    name: "",
    file: null,
    source: "user",
    slots: Array.from({ length: FLEET_SLOT_COUNT }, createFleetSlotDraft)
  };
}
function cloneFleetRule(source) {
  return {
    shipTypes: [...source.shipTypes],
    levelEnabled: source.levelEnabled,
    minLevel: source.minLevel,
    maxLevel: source.maxLevel,
    relaxed: source.relaxed
  };
}
function copyFleetRule(target, source) {
  target.shipTypes = [...source.shipTypes];
  target.levelEnabled = source.levelEnabled;
  target.minLevel = source.minLevel;
  target.maxLevel = source.maxLevel;
  target.relaxed = source.relaxed;
}
function fleetDraftSnapshot(draft) {
  const ruleSnapshot = (rule) => ({
    shipTypes: [...rule.shipTypes],
    levelEnabled: rule.levelEnabled,
    minLevel: rule.minLevel,
    maxLevel: rule.maxLevel,
    relaxed: rule.relaxed
  });
  return JSON.stringify({
    name: draft.name,
    slots: draft.slots.map((slot) => ({
      primary: slot.primary?.id ?? null,
      rule: ruleSnapshot(slot),
      candidates: slot.candidates.map((candidate) => ({
        ship: candidate.ship?.id ?? null,
        rule: ruleSnapshot(candidate)
      }))
    }))
  });
}
function hasFleetDraftChanges(draft, savedSnapshot) {
  return fleetDraftSnapshot(draft) !== savedSnapshot;
}
function teamRuleConstraintsFromDraft(rule, field) {
  const invalidShipType = rule.shipTypes.find((shipType) => !ALLOWED_FLEET_SHIP_TYPES.has(shipType));
  if (invalidShipType) {
    throw new Error(`${field} \u7684\u8230\u79CD\u4E0D\u7B26\u5408\u540E\u7AEF\u63A5\u53E3\uFF1A${invalidShipType}`);
  }
  if (rule.levelEnabled) {
    if (rule.minLevel !== null && (!Number.isInteger(rule.minLevel) || rule.minLevel < 1)) {
      throw new Error(`${field} \u7684\u6700\u5C0F\u7B49\u7EA7\u4E0D\u5408\u6CD5`);
    }
    if (rule.maxLevel !== null && (!Number.isInteger(rule.maxLevel) || rule.maxLevel < 1)) {
      throw new Error(`${field} \u7684\u6700\u5927\u7B49\u7EA7\u4E0D\u5408\u6CD5`);
    }
    if (rule.minLevel !== null && rule.maxLevel !== null && rule.maxLevel < rule.minLevel) {
      throw new Error(`${field} \u7684\u6700\u5927\u7B49\u7EA7\u4E0D\u80FD\u5C0F\u4E8E\u6700\u5C0F\u7B49\u7EA7`);
    }
  }
  const result = {};
  if (rule.shipTypes.length > 0) {
    result.ship_type = [...rule.shipTypes];
  }
  if (rule.levelEnabled && rule.minLevel !== null) {
    result.min_level = rule.minLevel;
  }
  if (rule.levelEnabled && rule.maxLevel !== null) {
    result.max_level = rule.maxLevel;
  }
  if (rule.relaxed)
    result.relaxed = true;
  return result;
}
function teamShipRuleFromDraft(ship, rule, field) {
  const result = {
    name: ship.name,
    ...teamRuleConstraintsFromDraft(rule, field)
  };
  if (ship.search_name && ship.search_name !== ship.name) {
    result.search_name = ship.search_name;
  }
  return result;
}
function teamPlanSlotFromDraft(slot, index) {
  const backups = slot.candidates.filter((candidate) => candidate.ship !== null);
  const result = slot.primary ? teamShipRuleFromDraft(slot.primary, slot, `\u4F4D\u7F6E ${index + 1} \u4E3B\u9009`) : teamRuleConstraintsFromDraft(slot, `\u4F4D\u7F6E ${index + 1}`);
  if (backups.length > 0) {
    result.candidates = backups.map((candidate, candidateIndex) => teamShipRuleFromDraft(candidate.ship, candidate, `\u4F4D\u7F6E ${index + 1} \u5907\u9009 ${candidateIndex + 1}`));
  }
  return result;
}
function fleetDraftToTeamPlan(draft, rawName) {
  const name = rawName.trim();
  if (!name)
    throw new Error("\u8BF7\u8F93\u5165\u8230\u961F\u9884\u8BBE\u540D\u79F0");
  const occupiedSlots = draft.slots.filter((slot) => !isFleetSlotEmpty(slot));
  if (occupiedSlots.length === 0) {
    throw new Error("\u5F53\u524D\u7F16\u961F\u81F3\u5C11\u9700\u8981\u4E00\u8258\u4E3B\u9009\u6216\u5907\u9009\u8230\u8239");
  }
  return {
    name,
    ships: occupiedSlots.map(teamPlanSlotFromDraft)
  };
}
function findTeamPlanShip(rule, ships) {
  const ship = ships.find((item) => item.name === rule.name) ?? ships.find((item) => item.search_name === rule.search_name);
  if (!ship)
    throw new Error(`\u8230\u8239\u4E0D\u5B58\u5728: ${rule.name}`);
  return ship;
}
function fleetCandidateFromTeamRule(rule, ships) {
  return {
    ship: findTeamPlanShip(rule, ships),
    shipTypes: [...rule.ship_type ?? []],
    levelEnabled: rule.min_level !== void 0 || rule.max_level !== void 0,
    minLevel: rule.min_level ?? null,
    maxLevel: rule.max_level ?? null,
    relaxed: rule.relaxed === true
  };
}
function fleetSlotFromTeamPlan(slot, ships) {
  const primary = slot.name ? findTeamPlanShip({
    name: slot.name,
    search_name: slot.search_name,
    ship_type: slot.ship_type,
    min_level: slot.min_level,
    max_level: slot.max_level
  }, ships) : null;
  const backups = (slot.candidates ?? []).map((candidate) => fleetCandidateFromTeamRule(candidate, ships));
  return {
    primary,
    candidates: [
      ...backups,
      ...Array.from({ length: Math.max(0, DEFAULT_BACKUP_SLOT_COUNT - backups.length) }, () => createFleetCandidateDraft())
    ],
    shipTypes: [...slot.ship_type ?? []],
    levelEnabled: slot.min_level !== void 0 || slot.max_level !== void 0,
    minLevel: slot.min_level ?? null,
    maxLevel: slot.max_level ?? null,
    relaxed: slot.relaxed === true
  };
}
function fleetDraftFromTeamPlan(plan, ships) {
  const slots = plan.ships.map((slot) => fleetSlotFromTeamPlan(slot, ships));
  while (slots.length < FLEET_SLOT_COUNT) {
    slots.push(createFleetSlotDraft());
  }
  return {
    name: plan.name,
    file: plan.file ?? null,
    source: plan.source ?? "user",
    slots: slots.slice(0, FLEET_SLOT_COUNT)
  };
}