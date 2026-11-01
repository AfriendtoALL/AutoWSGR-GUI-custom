"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTeamPlanSearch = normalizeTeamPlanSearch;
exports.filterAndSortTeamPlans = filterAndSortTeamPlans;
exports.compareTeamPlans = compareTeamPlans;
exports.teamPlanCardData = teamPlanCardData;
exports.appendTeamPlanCardContent = appendTeamPlanCardContent;
function normalizeTeamPlanSearch(value) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s·•._-]+/g, "");
}
function filterAndSortTeamPlans(plans, options) {
  const search = normalizeTeamPlanSearch(options.search);
  return plans.map((plan, index) => ({ plan, index })).filter(({ plan }) => (!options.filterSystem || plan.source !== "system") && (!search || normalizeTeamPlanSearch(plan.name).includes(search))).sort((left, right) => compareTeamPlans(left.plan, right.plan, options.sortField, options.ascending));
}
function compareTeamPlans(left, right, sortField, ascending) {
  let difference = 0;
  if (sortField === "name") {
    difference = left.name.localeCompare(right.name, "zh-CN");
  } else {
    difference = (left.modifiedAt ?? 0) - (right.modifiedAt ?? 0);
    if (difference === 0) {
      difference = left.name.localeCompare(right.name, "zh-CN");
    }
  }
  return ascending ? difference : -difference;
}
function teamPlanCardData(plan) {
  return {
    name: plan.name,
    source: plan.source ?? "user",
    primaryCount: plan.ships.filter((slot) => Boolean(slot.primary ?? slot.name)).length,
    backupCount: plan.ships.reduce((count, slot) => count + (slot.candidates?.length ?? 0), 0),
    modifiedAt: plan.modifiedAt
  };
}
function formatModifiedDate(modifiedAt) {
  if (modifiedAt === void 0 || !Number.isFinite(modifiedAt))
    return "";
  const date = new Date(modifiedAt);
  if (Number.isNaN(date.getTime()))
    return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function appendTeamPlanCardContent(target, data) {
  const heading = document.createElement("div");
  heading.className = "fleet-team-loader-item-heading";
  const name = document.createElement("strong");
  name.textContent = data.name;
  const badge = document.createElement("span");
  badge.className = `fleet-team-source-badge ${data.source}`;
  badge.textContent = data.source === "system" ? "\u7CFB\u7EDF\u9884\u8BBE" : data.source === "user" ? "\u7528\u6237\u9884\u8BBE" : "\u5DF2\u5220\u9664";
  heading.append(name, badge);
  const summary = document.createElement("span");
  summary.className = "fleet-team-meta";
  summary.textContent = `${data.primaryCount} \u8258\u4E3B\u9009 \xB7 ${data.backupCount} \u8258\u5907\u9009`;
  const details = document.createElement("div");
  details.className = "fleet-team-card-details";
  details.append(summary);
  const modifiedDate = formatModifiedDate(data.modifiedAt);
  if (modifiedDate) {
    const time = document.createElement("time");
    time.className = "fleet-team-card-modified";
    time.dateTime = modifiedDate;
    time.textContent = modifiedDate;
    time.title = `\u6700\u540E\u4FEE\u6539\uFF1A${modifiedDate}`;
    details.append(time);
  }
  target.append(heading, details);
}