"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPlanManagementViewObject = buildPlanManagementViewObject;
function planKey(source, file) {
  return `${source}:${file.trim().toLocaleLowerCase("zh-CN")}`;
}
function teamKey(name) {
  return name.trim().toLocaleLowerCase("zh-CN");
}
function collectTaskGroupUsage(taskGroups) {
  const usage = /* @__PURE__ */ new Map();
  taskGroups.forEach((group) => {
    group.items.forEach((item) => {
      if (item.kind !== "plan")
        return;
      let source = item.managedSource;
      let file = item.managedFile?.trim();
      if ((!source || !file) && item.path) {
        const normalizedPath = item.path.replace(/\\/g, "/");
        const lowerPath = normalizedPath.toLocaleLowerCase("zh-CN");
        if (/(^|\/)system_battle_plans\//.test(lowerPath)) {
          source = "system";
        } else if (/(^|\/)user_battle_plans\//.test(lowerPath)) {
          source = "user";
        }
        file = normalizedPath.split("/").pop()?.trim();
      }
      if (!source || !file)
        return;
      const key = planKey(source, file);
      const groups = usage.get(key) ?? /* @__PURE__ */ new Set();
      groups.add(group.name);
      usage.set(key, groups);
    });
  });
  return usage;
}
function collectBattlePlans(result) {
  const plans = /* @__PURE__ */ new Map();
  result.bindings.forEach((binding) => {
    const key = planKey(binding.source, binding.planFile);
    let plan = plans.get(key);
    if (!plan) {
      plan = {
        file: binding.planFile,
        name: binding.planName,
        source: binding.source,
        teams: /* @__PURE__ */ new Set()
      };
      plans.set(key, plan);
    }
    if (binding.teamName)
      plan.teams.add(binding.teamName);
  });
  return plans;
}
function teamDeleteWarning(result, file, name, relations) {
  if (relations.length === 0)
    return void 0;
  const normalizedName = teamKey(name);
  const hasOtherTeamWithSameName = result.teamPlans.some((plan) => plan.file !== file && teamKey(plan.name) === normalizedName);
  return hasOtherTeamWithSameName ? `
\u5F53\u524D\u6709 ${relations.length} \u4E2A\u51FA\u5F81\u8BA1\u5212\u5F15\u7528\u8BE5\u540D\u79F0\uFF0C\u5220\u9664\u540E\u4ECD\u4F1A\u5339\u914D\u53E6\u4E00\u4EFD\u540C\u540D\u8230\u961F\u65B9\u6848\u3002` : `
\u5F53\u524D\u6709 ${relations.length} \u4E2A\u51FA\u5F81\u8BA1\u5212\u5F15\u7528\u8BE5\u8230\u961F\uFF1B\u5220\u9664\u540E\u8FD9\u4E9B\u8BA1\u5212\u4F1A\u663E\u793A\u8230\u961F\u6587\u4EF6\u7F3A\u5931\u3002`;
}
function buildPlanManagementViewObject(result, taskGroups) {
  const taskGroupUsage = collectTaskGroupUsage(taskGroups);
  const battlePlans = collectBattlePlans(result);
  const availableTeams = new Set(result.teamPlans.map((plan) => teamKey(plan.name)));
  const teamUsage = /* @__PURE__ */ new Map();
  battlePlans.forEach((plan) => {
    plan.teams.forEach((name) => {
      const key = teamKey(name);
      const usedBy = teamUsage.get(key) ?? /* @__PURE__ */ new Set();
      usedBy.add(plan.name);
      teamUsage.set(key, usedBy);
    });
  });
  const ignored = new Set(result.ignoredUnlinkedPlans);
  const rows = [];
  battlePlans.forEach((plan) => {
    const relations = [...plan.teams];
    const missingRelations = relations.filter((name) => !availableTeams.has(teamKey(name)));
    const ignoredUnlinked = ignored.has(`battle/${plan.source}/${plan.file}`);
    const attention = relations.length === 0 && !ignoredUnlinked || missingRelations.length > 0;
    rows.push({
      kind: "battle",
      source: plan.source,
      name: plan.name,
      file: plan.file,
      relations,
      taskGroups: [
        ...taskGroupUsage.get(planKey(plan.source, plan.file)) ?? []
      ],
      missingRelations,
      status: relations.length === 0 ? ignoredUnlinked ? "" : "\u672A\u5173\u8054\u8230\u961F" : missingRelations.length > 0 ? "\u8230\u961F\u6587\u4EF6\u7F3A\u5931" : "\u5173\u8054\u6B63\u5E38",
      statusClass: ignoredUnlinked ? "muted" : attention ? "warning" : "ok",
      attention,
      ignoredUnlinked
    });
  });
  result.teamPlans.forEach((plan) => {
    const relations = [...teamUsage.get(teamKey(plan.name)) ?? []];
    const ignoredUnlinked = ignored.has(`team/${plan.source}/${plan.file}`);
    rows.push({
      kind: "team",
      source: plan.source,
      name: plan.name,
      file: plan.file,
      relations,
      taskGroups: [],
      missingRelations: [],
      status: relations.length > 0 ? `\u5DF2\u88AB ${relations.length} \u4E2A\u8BA1\u5212\u5F15\u7528` : ignoredUnlinked ? "" : "\u672A\u88AB\u5F15\u7528",
      statusClass: relations.length > 0 ? "ok" : "muted",
      attention: relations.length === 0 && !ignoredUnlinked,
      ignoredUnlinked,
      deleteWarning: teamDeleteWarning(result, plan.file, plan.name, relations)
    });
  });
  result.errors.forEach((error) => {
    rows.push({
      kind: error.kind,
      source: error.source,
      name: error.file.replace(/\.ya?ml$/i, ""),
      file: error.file,
      relations: [],
      taskGroups: error.kind === "battle" ? [...taskGroupUsage.get(planKey(error.source, error.file)) ?? []] : [],
      missingRelations: [],
      status: "\u65E0\u6CD5\u8BFB\u53D6",
      statusClass: "warning",
      attention: true,
      invalid: true,
      errorMessage: error.message
    });
  });
  return {
    rows,
    errors: result.errors.map((error) => ({
      source: error.source,
      file: error.file,
      message: error.message
    }))
  };
}