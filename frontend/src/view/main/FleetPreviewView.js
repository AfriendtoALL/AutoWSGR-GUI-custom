"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetPreviewView = void 0;
var ShipArtwork_1 = require_ShipArtwork();
function formatCount(count, limit) {
  if (count === 0)
    return "-";
  return limit === void 0 ? String(count) : `${count}/${limit}`;
}
var FleetPreviewView = class {
  constructor() {
    this.currentShips = [];
    this.renderedSignature = "";
    this.currentStats = null;
    this.shipDetailsPinned = false;
    this.grid = document.getElementById("current-fleet-preview");
    this.empty = document.getElementById("current-fleet-empty");
    this.statsRoot = document.getElementById("daily-sortie-stats");
    this.battleCount = document.getElementById("daily-battle-count");
    this.quickRepairCount = document.getElementById("daily-quick-repair-count");
    this.lootCount = document.getElementById("daily-loot-count");
    this.shipCount = document.getElementById("daily-ship-count");
    this.expeditionCount = document.getElementById("daily-expedition-count");
    this.shipToggle = document.getElementById("daily-ship-toggle");
    this.shipDetails = document.getElementById("daily-ship-details");
    this.shipDropList = document.getElementById("daily-ship-drop-list");
    this.dropNotice = document.getElementById("daily-drop-notice");
    this.gradeCounts = {
      SS: document.getElementById("daily-grade-ss"),
      S: document.getElementById("daily-grade-s"),
      A: document.getElementById("daily-grade-a"),
      B: document.getElementById("daily-grade-b"),
      C: document.getElementById("daily-grade-c"),
      D: document.getElementById("daily-grade-d")
    };
    this.shipToggle.addEventListener("click", () => {
      if (!this.currentStats)
        return;
      if (!this.shipDetailsPinned && this.currentStats.dropNotice) {
        this.shipDetailsPinned = true;
      } else {
        this.shipDetailsPinned = !this.shipDetailsPinned;
      }
      this.renderStats(this.currentStats);
    });
  }
  render(ships, hasRunningTask, stats) {
    this.currentStats = stats;
    this.renderStats(stats);
    this.currentShips = ships.filter((ship) => Boolean(ship.name)).slice(0, 6);
    const hasFleet = this.currentShips.length > 0;
    this.grid.hidden = !hasFleet;
    this.empty.hidden = hasFleet;
    this.empty.textContent = hasRunningTask ? "\u5F53\u524D\u4EFB\u52A1\u6CA1\u6709\u5173\u8054\u961F\u4F0D" : "\u5F53\u524D\u65E0\u4EFB\u52A1\u6267\u884C";
    if (!hasFleet) {
      this.grid.replaceChildren();
      this.renderedSignature = "";
      return;
    }
    this.renderCards();
  }
  renderStats(stats) {
    this.battleCount.textContent = formatCount(stats.battleCount);
    this.quickRepairCount.textContent = formatCount(stats.quickRepairCount);
    this.lootCount.textContent = formatCount(stats.lootCount, stats.lootLimit);
    this.shipCount.textContent = formatCount(stats.shipCount, stats.shipLimit);
    this.expeditionCount.textContent = formatCount(stats.expeditionCount);
    for (const [grade, element] of Object.entries(this.gradeCounts)) {
      element.textContent = formatCount(stats.grades[grade]);
    }
    const notice = stats.dropNotice;
    this.dropNotice.hidden = !notice;
    this.dropNotice.textContent = notice ? `\u83B7\u5F97\u300C${notice.shipName}\u300D\uFF01\u4ECA\u65E5\u7B2C ${notice.dailyIndex} \u8258\u4E86\uFF010v0\uFF01` : "";
    this.statsRoot.classList.toggle("has-drop-notice", Boolean(notice));
    this.shipToggle.classList.toggle("has-drop-notice", Boolean(notice));
    const detailsExpanded = this.shipDetailsPinned || Boolean(notice);
    this.shipToggle.setAttribute("aria-expanded", String(detailsExpanded));
    this.shipDetails.hidden = !detailsExpanded;
    if (!detailsExpanded)
      return;
    const fragment = document.createDocumentFragment();
    if (stats.shipDrops.length === 0) {
      const empty = document.createElement("span");
      empty.className = "daily-ship-drop-empty";
      empty.textContent = "\u4ECA\u65E5\u6682\u65E0\u8230\u8239\u6389\u843D";
      fragment.append(empty);
    } else {
      for (const drop of stats.shipDrops) {
        const row = document.createElement("div");
        row.className = "daily-ship-drop-item";
        const name = document.createElement("span");
        name.textContent = drop.name;
        const count = document.createElement("b");
        count.textContent = `\xD7${drop.count}`;
        row.append(name, count);
        fragment.append(row);
      }
    }
    this.shipDropList.replaceChildren(fragment);
  }
  renderCards() {
    const signature = this.currentShips.map((ship) => [
      ship.name,
      ship.ship?.id ?? "",
      ship.ship?.portraitUrl ?? "",
      ship.shipTypeLabel ?? ""
    ].join("")).join("\0");
    if (signature === this.renderedSignature)
      return;
    const fragment = document.createDocumentFragment();
    this.currentShips.forEach((ship, index) => {
      fragment.append(this.createCard(ship, index));
    });
    this.grid.replaceChildren(fragment);
    this.renderedSignature = signature;
  }
  createCard(preview, index) {
    const card = document.createElement("div");
    card.className = "current-fleet-card";
    card.title = preview.name;
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `\u4F4D\u7F6E ${index + 1}\uFF1A${preview.name}`);
    const ship = preview.ship;
    if (ship) {
      card.append((0, ShipArtwork_1.createShipArtwork)(ship, {
        shipTypeLabel: preview.shipTypeLabel ?? ship.ship_type,
        showNumber: false,
        displayName: preview.name
      }));
    } else {
      const unknown = document.createElement("span");
      unknown.className = "current-fleet-card-unknown";
      unknown.textContent = preview.name;
      card.append(unknown);
    }
    return card;
  }
};
exports.FleetPreviewView = FleetPreviewView;