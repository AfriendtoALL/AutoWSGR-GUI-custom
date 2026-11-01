"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyFleetDraftEdit = applyFleetDraftEdit;
var fleetShipTypes_js_1 = require_fleetShipTypes();
var FleetDraft_js_1 = require_FleetDraft();
var FleetQueueOps_js_1 = require_FleetQueueOps();
var DEFAULT_BACKUP_SLOT_COUNT = 6;
var FLEET_SLOT_COUNT = 6;
var unchanged = () => ({ changed: false });
var changed = (selection) => selection ? { changed: true, selection } : { changed: true };
var formationSelection = (position) => ({
  group: "formation",
  position,
  candidateIndex: 0
});
var backupSelection = (position, candidateIndex) => ({
  group: "backup",
  position,
  candidateIndex
});
function selectionAt(selection, position) {
  return selection.group === "formation" ? formationSelection(position) : backupSelection(position, selection.candidateIndex);
}
function applyDefaultShipType(rule, ship) {
  const shipType = (0, fleetShipTypes_js_1.normalizeFleetShipTypeCode)(ship.ship_type);
  if (shipType && (rule.shipTypes.length === 0 || !rule.shipTypes.includes(shipType))) {
    rule.shipTypes = [shipType];
  }
}
function compactCandidates(candidates) {
  const occupied = candidates.filter((candidate) => candidate.ship !== null);
  const slotCount = Math.max(DEFAULT_BACKUP_SLOT_COUNT, occupied.length);
  candidates.splice(0, candidates.length, ...occupied, ...Array.from({ length: slotCount - occupied.length }, FleetDraft_js_1.createFleetCandidateDraft));
}
function assignFormationShip(draft, ship, position) {
  const firstEmpty = draft.slots.findIndex(FleetDraft_js_1.isFleetSlotEmpty);
  const requested = draft.slots[position];
  const target = requested.primary || !(0, FleetDraft_js_1.isFleetSlotEmpty)(requested) || firstEmpty < 0 ? position : firstEmpty;
  const slot = draft.slots[target];
  slot.primary = ship;
  applyDefaultShipType(slot, ship);
  return target;
}
function assignShip(draft, intent) {
  const { selection, ship } = intent;
  if (selection.group === "formation") {
    const assignment = (0, FleetDraft_js_1.resolveGalleryFormationAssignment)(draft.slots, selection.position, ship.search_name);
    assignFormationShip(draft, ship, assignment.targetPosition);
    return changed(formationSelection(assignment.activePosition));
  }
  const slot = draft.slots[selection.position];
  if (!slot)
    return unchanged();
  const existing = slot.candidates.findIndex((candidate2) => candidate2.ship?.search_name === ship.search_name);
  if (existing >= 0) {
    const candidate2 = slot.candidates[existing];
    candidate2.ship = ship;
    applyDefaultShipType(candidate2, ship);
    return changed(backupSelection(selection.position, existing));
  }
  const selected = slot.candidates[selection.candidateIndex];
  const replacing = Boolean(selected?.ship);
  const firstEmpty = slot.candidates.findIndex((item) => item.ship === null);
  const target = selected?.ship || firstEmpty < 0 ? selection.candidateIndex : firstEmpty;
  while (!slot.candidates[target]) {
    slot.candidates.push((0, FleetDraft_js_1.createFleetCandidateDraft)());
  }
  const candidate = slot.candidates[target];
  candidate.ship = ship;
  applyDefaultShipType(candidate, ship);
  const nextEmpty = replacing ? -1 : slot.candidates.findIndex((item, index) => index > target && item.ship === null);
  return changed(backupSelection(selection.position, nextEmpty >= 0 ? nextEmpty : target));
}
function removePrimary(draft, position, selection) {
  const activePosition = (0, FleetDraft_js_1.removeFleetPrimary)(draft.slots, position, selection.position);
  return changed(position === selection.position ? formationSelection(activePosition) : selectionAt(selection, activePosition));
}
function removeCandidate(draft, position, candidateIndex) {
  const owner = draft.slots[position];
  if (!owner?.candidates[candidateIndex])
    return unchanged();
  owner.candidates.splice(candidateIndex, 1);
  compactCandidates(owner.candidates);
  if ((0, FleetDraft_js_1.isFleetSlotEmpty)(owner)) {
    (0, FleetDraft_js_1.compactFleetDraftSlots)(draft.slots);
    return changed(formationSelection(Math.min(position, FLEET_SLOT_COUNT - 1)));
  }
  return changed(backupSelection(draft.slots.indexOf(owner), Math.min(candidateIndex, owner.candidates.length - 1)));
}
function ensureCandidate(draft, position) {
  const candidates = draft.slots[position]?.candidates;
  if (!candidates)
    return unchanged();
  let target = candidates.findIndex((candidate) => candidate.ship === null);
  if (target < 0) {
    candidates.push((0, FleetDraft_js_1.createFleetCandidateDraft)());
    target = candidates.length - 1;
  }
  return changed(backupSelection(position, target));
}
function insertFormationShip(draft, ship, targetPosition, mode) {
  const target = (0, FleetDraft_js_1.resolveGalleryFormationDropTarget)(draft.slots, targetPosition);
  if (target !== targetPosition) {
    return assignFormationShip(draft, ship, target);
  }
  const targetSlot = draft.slots[target];
  if (targetSlot && !targetSlot.primary && !(0, FleetDraft_js_1.isFleetSlotEmpty)(targetSlot)) {
    return assignFormationShip(draft, ship, target);
  }
  const inserted = (0, FleetDraft_js_1.createFleetSlotDraft)();
  inserted.primary = ship;
  applyDefaultShipType(inserted, ship);
  if (!(0, FleetDraft_js_1.insertFleetPrimary)(draft.slots, target, inserted, mode)) {
    assignFormationShip(draft, ship, target);
  }
  return target;
}
function swapPrimaryAndCandidate(primarySlot, candidateSlot, candidateIndex) {
  const primary = primarySlot.primary;
  const primaryRule = (0, FleetDraft_js_1.cloneFleetRule)(primarySlot);
  const candidate = candidateSlot.candidates[candidateIndex];
  const promoted = candidate.ship;
  const promotedRule = (0, FleetDraft_js_1.cloneFleetRule)(candidate);
  primarySlot.primary = promoted;
  (0, FleetDraft_js_1.copyFleetRule)(primarySlot, promotedRule);
  candidate.ship = primary;
  (0, FleetDraft_js_1.copyFleetRule)(candidate, primaryRule);
  return candidate;
}
function appendBackupCandidate(targetSlot, ship, rule) {
  const occupied = targetSlot.candidates.filter((candidate) => candidate.ship !== null && candidate.ship.search_name !== ship.search_name);
  const selected = (0, FleetDraft_js_1.createFleetCandidateDraft)(ship);
  (0, FleetDraft_js_1.copyFleetRule)(selected, rule);
  occupied.push(selected);
  targetSlot.candidates = [
    ...occupied,
    ...Array.from({
      length: Math.max(0, DEFAULT_BACKUP_SLOT_COUNT - occupied.length)
    }, FleetDraft_js_1.createFleetCandidateDraft)
  ];
  return selected;
}
function appendFormationToBackup(draft, source, target) {
  const selected = appendBackupCandidate(target, source.primary, (0, FleetDraft_js_1.cloneFleetRule)(source));
  source.primary = null;
  (0, FleetDraft_js_1.copyFleetRule)(source, (0, FleetDraft_js_1.createFleetRuleDraft)());
  if ((0, FleetDraft_js_1.isFleetSlotEmpty)(source))
    (0, FleetDraft_js_1.compactFleetDraftSlots)(draft.slots);
  return selected;
}
function moveBackupToFormation(draft, sourcePosition, sourceIndex, targetPosition) {
  const source = draft.slots[sourcePosition];
  const requestedTarget = draft.slots[targetPosition];
  const candidate = source?.candidates[sourceIndex];
  if (!candidate?.ship || !requestedTarget)
    return unchanged();
  const destinationPosition = (0, FleetDraft_js_1.isFleetSlotEmpty)(requestedTarget) ? (0, FleetDraft_js_1.resolveGalleryFormationDropTarget)(draft.slots, targetPosition) : targetPosition;
  const target = draft.slots[destinationPosition];
  if (!target)
    return unchanged();
  if ((0, FleetDraft_js_1.hasOtherPrimaryShip)(draft.slots, candidate.ship.search_name, destinationPosition)) {
    return {
      changed: false,
      error: {
        title: "\u65E0\u6CD5\u79FB\u52A8",
        message: `\u4E3B\u9009\u7F16\u961F\u4E2D\u5DF2\u5B58\u5728 ${candidate.ship.name}\uFF0C\u4E0D\u80FD\u6DFB\u52A0\u540C\u540D\u8230\u8239`
      }
    };
  }
  if (target.primary) {
    swapPrimaryAndCandidate(target, source, sourceIndex);
  } else {
    target.primary = candidate.ship;
    (0, FleetDraft_js_1.copyFleetRule)(target, candidate);
    source.candidates.splice(sourceIndex, 1);
    compactCandidates(source.candidates);
    if ((0, FleetDraft_js_1.isFleetSlotEmpty)(source))
      (0, FleetDraft_js_1.compactFleetDraftSlots)(draft.slots);
  }
  return changed(formationSelection(Math.max(0, draft.slots.indexOf(target))));
}
function moveFormationToBackup(draft, sourcePosition, targetPosition, targetIndex) {
  const source = draft.slots[sourcePosition];
  const target = draft.slots[targetPosition];
  const candidate = target?.candidates[targetIndex];
  if (!source?.primary || !target || !candidate)
    return unchanged();
  const selected = candidate.ship ? swapPrimaryAndCandidate(source, target, targetIndex) : appendFormationToBackup(draft, source, target);
  return changed(backupSelection(Math.max(0, draft.slots.indexOf(target)), Math.max(0, target.candidates.indexOf(selected))));
}
function moveBackupCandidate(draft, sourcePosition, sourceIndex, targetPosition, targetIndex) {
  const source = draft.slots[sourcePosition];
  const target = draft.slots[targetPosition];
  const selected = source?.candidates[sourceIndex];
  if (!source || !target || !selected?.ship || !target.candidates[targetIndex])
    return unchanged();
  const landed = (0, FleetQueueOps_js_1.moveQueueItem)(source.candidates, sourceIndex, target.candidates, targetIndex, () => {
    compactCandidates(source.candidates);
    compactCandidates(target.candidates);
    if ((0, FleetDraft_js_1.isFleetSlotEmpty)(source))
      (0, FleetDraft_js_1.compactFleetDraftSlots)(draft.slots);
  });
  if (landed === null)
    return unchanged();
  return changed(backupSelection(Math.max(0, draft.slots.indexOf(target)), Math.max(0, target.candidates.indexOf(selected))));
}
function dropOnFormation(draft, intent) {
  if (intent.targetPosition < 0 || intent.targetPosition >= FLEET_SLOT_COUNT)
    return unchanged();
  const { source, selection } = intent;
  if (source.group === "formation") {
    const focused2 = draft.slots[selection.position];
    const moved = (0, FleetDraft_js_1.moveFleetPrimary)(draft.slots, source.position, intent.targetPosition, intent.backupFollowMode);
    if (!moved || !focused2)
      return unchanged();
    return changed(selectionAt(selection, (0, FleetDraft_js_1.resolveFleetSlotPosition)(draft.slots, focused2, selection.position)));
  }
  if (source.group === "backup") {
    return moveBackupToFormation(draft, source.position, source.candidateIndex, intent.targetPosition);
  }
  const ship = source.ship;
  const focused = draft.slots[selection.position];
  const existing = draft.slots.findIndex((slot) => slot.primary?.search_name === ship.search_name);
  if (existing >= 0) {
    assignFormationShip(draft, ship, existing);
    const position = focused ? (0, FleetDraft_js_1.resolveFleetSlotPosition)(draft.slots, focused, selection.position) : selection.position;
    return changed(formationSelection(position));
  }
  return changed(formationSelection(insertFormationShip(draft, ship, intent.targetPosition, intent.backupFollowMode)));
}
function dropGalleryOnBackup(draft, ship, targetPosition, targetIndex) {
  const candidates = draft.slots[targetPosition]?.candidates;
  if (!candidates?.[targetIndex])
    return unchanged();
  const existing = candidates.findIndex((candidate) => candidate.ship?.search_name === ship.search_name);
  if (existing >= 0) {
    candidates[existing].ship = ship;
    applyDefaultShipType(candidates[existing], ship);
    return changed(backupSelection(targetPosition, existing));
  }
  const selected = (0, FleetDraft_js_1.createFleetCandidateDraft)(ship);
  applyDefaultShipType(selected, ship);
  const index = (0, FleetDraft_js_1.insertFleetCandidate)(candidates, targetIndex, selected);
  return index < 0 ? unchanged() : changed(backupSelection(targetPosition, index));
}
function dropOnBackup(draft, intent) {
  const target = draft.slots[intent.targetPosition]?.candidates[intent.targetCandidateIndex];
  if (!target)
    return unchanged();
  const { source } = intent;
  if (source.group === "formation") {
    return moveFormationToBackup(draft, source.position, intent.targetPosition, intent.targetCandidateIndex);
  }
  if (source.group === "backup") {
    return moveBackupCandidate(draft, source.position, source.candidateIndex, intent.targetPosition, intent.targetCandidateIndex);
  }
  return dropGalleryOnBackup(draft, source.ship, intent.targetPosition, intent.targetCandidateIndex);
}
function copyBackups(draft, sourcePosition, targetPosition) {
  const source = draft.slots[sourcePosition];
  const target = draft.slots[targetPosition];
  if (!source || !target || source === target)
    return unchanged();
  const copied = source.candidates.filter((candidate) => candidate.ship !== null).map((candidate) => ({
    ship: candidate.ship,
    ...(0, FleetDraft_js_1.cloneFleetRule)(candidate)
  }));
  if (copied.length === 0)
    return unchanged();
  target.candidates = [
    ...copied,
    ...Array.from({
      length: Math.max(0, DEFAULT_BACKUP_SLOT_COUNT - copied.length)
    }, FleetDraft_js_1.createFleetCandidateDraft)
  ];
  return changed();
}
function updateRule(draft, position, candidateIndex, update) {
  const slot = draft.slots[position];
  const target = candidateIndex === void 0 ? slot : slot?.candidates[candidateIndex];
  const hasShip = candidateIndex === void 0 ? Boolean(slot?.primary) : Boolean(target?.ship);
  if (!target || !hasShip)
    return unchanged();
  if (update.levelEnabled !== void 0) {
    target.levelEnabled = update.levelEnabled;
  }
  if (update.minLevel !== void 0)
    target.minLevel = update.minLevel;
  if (update.maxLevel !== void 0)
    target.maxLevel = update.maxLevel;
  if (update.relaxed !== void 0)
    target.relaxed = update.relaxed;
  return changed();
}
function applyFleetDraftEdit(draft, intent) {
  switch (intent.type) {
    case "assign-ship":
      return assignShip(draft, intent);
    case "remove-primary":
      return removePrimary(draft, intent.position, intent.selection);
    case "remove-candidate":
      return removeCandidate(draft, intent.position, intent.candidateIndex);
    case "clear":
      draft.slots = Array.from({ length: FLEET_SLOT_COUNT }, FleetDraft_js_1.createFleetSlotDraft);
      return changed(formationSelection(0));
    case "ensure-candidate":
      return ensureCandidate(draft, intent.position);
    case "drop-formation":
      return dropOnFormation(draft, intent);
    case "drop-backup":
      return dropOnBackup(draft, intent);
    case "copy-backups":
      return copyBackups(draft, intent.sourcePosition, intent.targetPosition);
    case "update-rule":
      return updateRule(draft, intent.position, intent.candidateIndex, intent.update);
  }
}