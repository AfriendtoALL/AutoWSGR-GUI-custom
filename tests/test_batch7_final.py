"""批次 7c 离线回归：7.4（定时方案死码清理）+ 7.8（编队 UI 合并）。

运行::

    python tests\\test_batch7_final.py -v
"""

from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.workbuddy' / 'asar_work'
RENDERER = WORK / 'dist' / 'renderer.bundle.js'
SOURCE_MAP = RENDERER.with_name(RENDERER.name + '.map')
ASAR = ROOT / 'resources' / 'app.asar'


def _bundle_text() -> str:
    return RENDERER.read_text(encoding='utf-8').replace('\r\n', '\n')


def _extract_module_body(text: str, module_path: str) -> str:
    banner = f'  // {module_path}\n'
    start = text.index(banner) + len(banner)
    open_line = text.index('(exports)', start)
    body_start = text.index('\n', open_line) + 1
    body_end = text.index('\n    }\n  });', body_start)
    body = text[body_start:body_end]
    return '\n'.join(line[6:] if line.startswith('      ') else line for line in body.split('\n'))


def _run_node(script: str) -> dict:
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / 'harness.js'
        path.write_text(script, encoding='utf-8')
        completed = subprocess.run(
            ['node', str(path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120,
        )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise AssertionError(f'node 无输出\nstdout={completed.stdout}\nstderr={completed.stderr}')
    return json.loads(lines[-1])


def _asar_files() -> dict[str, tuple[dict, bytes]]:
    raw = ASAR.read_bytes()
    _n1, n2, _n3, n4 = struct.unpack('<IIII', raw[:16])
    header = json.loads(raw[16 : 16 + n4].decode('utf-8'))
    content_start = 8 + n2
    files: dict[str, tuple[dict, bytes]] = {}

    def walk(node: dict, prefix: str = '') -> None:
        for name, meta in node.get('files', {}).items():
            path = prefix + name
            if 'files' in meta:
                walk(meta, path + '/')
                continue
            if meta.get('unpacked') or 'offset' not in meta:
                continue
            offset = int(meta['offset'])
            size = int(meta['size'])
            files[path] = (meta, raw[content_start + offset : content_start + offset + size])

    walk(header)
    return files


class ScheduledPlanRemovalTest(unittest.TestCase):
    """7.4/R28：不再存在「配了但不触发」的定时方案入口。"""

    @classmethod
    def setUpClass(cls) -> None:
        cls.text = _bundle_text()
        cls.cron = _extract_module_body(cls.text, 'dist/src/model/scheduler/CronScheduler.js')

    def test_dead_scheduled_api_removed(self) -> None:
        for symbol in (
            'registerScheduledTask',
            'unregisterScheduledTask',
            'scheduledTasks',
            'scheduledTaskDate',
            'checkScheduledTasks',
            'resetDailyFlags',
            'onScheduledTaskDue',
        ):
            self.assertNotIn(symbol, self.text, symbol)

    def test_scheduled_time_field_removed(self) -> None:
        lines = [line.strip() for line in self.text.split('\n')]
        remaining = [
            line for line in lines
            if 'scheduled_time' in line and not line.startswith('//')
        ]
        # 只允许「保存时清理失效字段」这两条删除语句，不再有任何解析/校验/读取。
        self.assertEqual(
            remaining,
            ['delete obj.scheduled_time;', 'delete result.scheduled_time;'],
        )
        self.assertNotIn('scheduled_time', self.cron)

    def test_plan_save_drops_stale_scheduled_time(self) -> None:
        body = _extract_module_body(self.text, 'dist/src/model/PlanModel.js')
        script = f"""
const yamlCodec = {{
  parse: () => ({{ chapter: 1, map: 4, selected_nodes: [], scheduled_time: '08:00', times: 2 }}),
}};
const exportsObj = {{}};
const factory = new Function(
  'require_adapter', 'require_nodeDecision', 'require_yamlSerializer', 'exports',
  {json.dumps(body)}
);
factory(
  () => ({{ yamlCodec }}),
  () => ({{ normalizeLegacyNodeDecisionFields: (value) => value }}),
  () => ({{ serializePlanYaml: (obj) => JSON.stringify(obj) }}),
  exportsObj
);
const plan = exportsObj.PlanModel.fromYaml('chapter: 1\\nmap: 4\\n', 'user_battle_plans/probe.yaml');
const saved = JSON.parse(plan.toYaml());
console.log(JSON.stringify({{
  dataField: plan.data.scheduled_time === undefined ? 'absent' : String(plan.data.scheduled_time),
  savedField: Object.prototype.hasOwnProperty.call(saved, 'scheduled_time') ? 'present' : 'absent',
  times: saved.times,
}}));
process.exit(0);
"""
        result = _run_node(script)
        self.assertEqual(result['dataField'], 'absent')
        self.assertEqual(result['savedField'], 'absent')
        self.assertEqual(result['times'], 2)

    def test_task_preset_strips_scheduled_time(self) -> None:
        body = _extract_module_body(self.text, 'dist/src/shared/taskPreset.js')
        script = f"""
const exportsObj = {{}};
const factory = new Function('exports', {json.dumps(body)});
factory(exportsObj);
const kept = exportsObj.taskPresetCodec.normalize({{ task_type: 'exercise', fleet_id: 2 }});
const stripped = exportsObj.taskPresetCodec.normalize({{
  task_type: 'exercise', fleet_id: 2, scheduled_time: '08:00', unknown_business_field: 'keep-me',
}});
console.log(JSON.stringify({{
  keptKeys: Object.keys(kept).sort(),
  strippedHasScheduled: Object.prototype.hasOwnProperty.call(stripped, 'scheduled_time'),
  unknownKept: stripped.unknown_business_field,
  fleetId: stripped.fleet_id,
}}));
process.exit(0);
"""
        result = _run_node(script)
        self.assertNotIn('scheduled_time', result['keptKeys'])
        self.assertFalse(result['strippedHasScheduled'])
        self.assertEqual(result['unknownKept'], 'keep-me')
        self.assertEqual(result['fleetId'], 2)

    def test_cron_scheduler_still_runs_daily_automation(self) -> None:
        tick_start = self.cron.index('tick() {')
        tick_end = self.cron.index('}\n', self.cron.index('this.checkLoot(now);')) + 2
        tick = self.cron[tick_start:tick_end]
        self.assertIn('this.checkExercise(now);', tick)
        self.assertIn('this.checkCampaign(now);', tick)
        self.assertIn('this.checkNormalFight();', tick)
        self.assertIn('this.checkDecisive(now);', tick)
        self.assertIn('this.checkLoot(now);', tick)
        self.assertNotIn('scheduled', tick)

    def test_no_scheduling_entry_in_ui(self) -> None:
        html = (WORK / 'src' / 'view' / 'index.html').read_text(encoding='utf-8')
        self.assertNotIn('scheduled', html)
        self.assertNotIn('定时', html)

    def test_cron_instance_has_no_scheduled_api(self) -> None:
        body = self.cron
        script = f"""
const calls = [];
const callbacks = {{
  onExerciseDue: (fleetId) => calls.push(['exercise', fleetId]),
  onCampaignDue: (name, times) => calls.push(['campaign', name, times]),
  onNormalFightDue: () => calls.push(['normal']),
  onDecisiveDue: (source) => calls.push(['decisive', source]),
  onLootDue: (source, planId, count) => calls.push(['loot', source, planId, count]),
  canStartNormalFight: () => true,
}};
const adapter = () => ({{ browserStorageStore: {{
  get: () => null,
  set: () => undefined,
}} }});
const campaign = () => ({{ DAILY_CAMPAIGN_TIMES: 8 }});
const exportsObj = {{}};
const factory = new Function('require_adapter', 'require_campaign', 'exports', {json.dumps(body)});
factory(adapter, campaign, exportsObj);
const instance = new exportsObj.CronScheduler({{
  autoExercise: true,
  autoBattle: true,
  autoNormalFight: true,
  autoDecisive: true,
  autoLoot: true,
  exerciseFleetId: 3,
  battleType: '困难潜艇',
  decisiveTemplateId: 'system',
  lootPlanSource: 'system',
  lootPlanId: 'default',
  lootStopCount: 50,
}});
instance.setCallbacks(callbacks);
instance.tick();
console.log(JSON.stringify({{
  calls,
  removedApi: ['registerScheduledTask', 'unregisterScheduledTask'].filter(
    (name) => typeof instance[name] === 'function',
  ),
}}));
process.exit(0);
"""
        result = _run_node(script)
        names = [call[0] for call in result['calls']]
        self.assertEqual(names, ['exercise', 'campaign', 'normal', 'decisive', 'loot'])
        self.assertEqual(result['calls'][0], ['exercise', 3])
        self.assertEqual(result['removedApi'], [])


class QueuePriorityTest(unittest.TestCase):
    """7.8/R43：候选舰船优先级的唯一数组实现。"""

    @classmethod
    def setUpClass(cls) -> None:
        text = _bundle_text()
        cls.body = _extract_module_body(text, 'dist/src/model/fleet/FleetQueueOps.js')

    def _run(self, script_body: str) -> dict:
        script = f"""
const exportsObj = {{}};
const factory = new Function('exports', {json.dumps(self.body)});
factory(exportsObj);
const ops = exportsObj;
{script_body}
"""
        return _run_node(script)

    def test_place_replaces_then_appends(self) -> None:
        result = self._run("""
const queue = ['a', 'b'];
const replaced = ops.placeQueueItem(queue, 'x', 1, 5);
const tail = ['a'];
const appended = ops.placeQueueItem(tail, 'x', 4, 5);
console.log(JSON.stringify({ queue, replaced, tail, appended }));
process.exit(0);
""")
        self.assertEqual(result['queue'], ['a', 'x'])
        self.assertEqual(result['replaced'], 1)
        self.assertEqual(result['tail'], ['a', 'x'])
        self.assertEqual(result['appended'], 1)

    def test_remove_bounds(self) -> None:
        result = self._run("""
const queue = ['a', 'b', 'c'];
const ok = ops.removeQueueItem(queue, 1);
const bad = ops.removeQueueItem(queue, 9);
console.log(JSON.stringify({ queue, ok, bad }));
process.exit(0);
""")
        self.assertEqual(result['queue'], ['a', 'c'])
        self.assertTrue(result['ok'])
        self.assertFalse(result['bad'])

    def test_same_level_swap_and_append(self) -> None:
        result = self._run("""
const queue = ['a', 'b', 'c'];
const landed = ops.moveQueueItem(queue, 0, queue, 2);
const appendQueue = ['a', 'b'];
const appended = ops.moveQueueItem(appendQueue, 0, appendQueue, 7);
const single = ['a'];
const same = ops.moveQueueItem(single, 0, single, 0);
console.log(JSON.stringify({ queue, landed, appendQueue, appended, same }));
process.exit(0);
""")
        self.assertEqual(result['queue'], ['c', 'b', 'a'])
        self.assertEqual(result['landed'], 2)
        self.assertEqual(result['appendQueue'], ['b', 'a'])
        self.assertEqual(result['appended'], 1)
        self.assertIsNone(result['same'])

    def test_cross_level_swap_and_insert(self) -> None:
        result = self._run("""
const source = ['a'];
const target = ['x', 'y'];
const swapped = ops.moveQueueItem(source, 0, target, 1);
const source2 = ['a', 'b'];
const target2 = ['x'];
const inserted = ops.moveQueueItem(source2, 0, target2, 3);
const source3 = ['a'];
const target3 = [];
const prepended = ops.moveQueueItem(source3, 0, target3, 0);
console.log(JSON.stringify({ source, target, swapped, source2, target2, inserted, source3, target3, prepended }));
process.exit(0);
""")
        self.assertEqual(result['source'], ['y'])
        self.assertEqual(result['target'], ['x', 'a'])
        self.assertEqual(result['swapped'], 1)
        self.assertEqual(result['source2'], ['b'])
        self.assertEqual(result['target2'], ['x', 'a'])
        self.assertEqual(result['inserted'], 1)
        self.assertEqual(result['source3'], [])
        self.assertEqual(result['target3'], ['a'])
        self.assertEqual(result['prepended'], 0)

    def test_after_move_hook_called_once(self) -> None:
        result = self._run("""
let hooks = 0;
const queue = ['a', 'b'];
ops.moveQueueItem(queue, 0, queue, 1, () => { hooks += 1; });
ops.moveQueueItem(queue, 1, queue, 1, () => { hooks += 1; });
console.log(JSON.stringify({ hooks }));
process.exit(0);
""")
        self.assertEqual(result['hooks'], 1)

    def test_both_drafts_share_the_primitive(self) -> None:
        text = _bundle_text()
        decisive = _extract_module_body(text, 'dist/src/model/fleet/DecisiveFleetDraft.js')
        editor = _extract_module_body(text, 'dist/src/model/fleet/FleetDraftEditor.js')
        self.assertIn('FleetQueueOps_js_1.placeQueueItem', decisive)
        self.assertIn('FleetQueueOps_js_1.removeQueueItem', decisive)
        self.assertIn('FleetQueueOps_js_1.moveQueueItem', decisive)
        self.assertIn('FleetQueueOps_js_1.moveQueueItem', editor)
        # 旧的决战排序实现（裸 splice + 交换）已删除。
        self.assertNotIn('targetQueue[targetIndex] = sourceName', decisive)


class SharedSlotBoardTest(unittest.TestCase):
    """7.8/R43：常规/决战共用同一份槽位渲染与拖拽实现。"""

    @classmethod
    def setUpClass(cls) -> None:
        cls.text = _bundle_text()
        cls.board_body = _extract_module_body(cls.text, 'dist/src/view/plan/FleetSlotBoardView.js')

    def test_only_one_slot_implementation(self) -> None:
        self.assertEqual(self.text.count('fleet-slot fleet-${group === "main"'), 1)
        self.assertEqual(self.text.count('remove.className = "fleet-slot-remove"'), 1)
        self.assertEqual(self.text.count('exports.parseSlotDragPayload'), 1)
        for symbol in ('data-fleet-slot', 'data-backup-slot', 'data-decisive-slot-index', 'bindSlotList'):
            self.assertNotIn(symbol, self.text, symbol)

    def test_both_views_use_board_and_layout_gallery(self) -> None:
        editor = _extract_module_body(self.text, 'dist/src/view/plan/FleetEditorView.js')
        decisive = _extract_module_body(self.text, 'dist/src/view/plan/DecisivePlanView.js')
        planner = _extract_module_body(self.text, 'dist/src/view/plan/FleetPlannerView.js')
        for body in (editor, decisive):
            self.assertIn('FleetSlotBoardView_1.FleetSlotBoardView', body)
        self.assertIn('FleetGalleryView_1.FLEET_DRAG_MIME', editor)
        self.assertIn('new FleetGalleryView_1.FleetGalleryView("fleet"', planner)
        self.assertIn('new FleetGalleryView_1.FleetGalleryView("decisive"', decisive)
        self.assertNotIn('require_ShipGalleryView', editor)
        self.assertNotIn('require_ShipGalleryView', decisive)

    def test_render_and_dispatch(self) -> None:
        script = f"""
function camel(name) {{
  return name.replace(/-([a-z])/g, (_m, ch) => ch.toUpperCase());
}}
function matches(element, selector) {{
  if (selector.startsWith('.')) {{
    return selector.slice(1).split('.').every((name) => element.classList.contains(name));
  }}
  let found = /^\\[data-([a-z-]+)\\]$/.exec(selector);
  if (found) return element.dataset[camel(found[1])] !== undefined;
  found = /^\\[data-([a-z-]+)="(.+)"\\]$/.exec(selector);
  if (found) return String(element.dataset[camel(found[1])]) === found[2];
  throw new Error('unsupported selector ' + selector);
}}
class FakeClassList {{
  constructor() {{ this.set = new Set(); }}
  add(...names) {{ names.forEach((name) => this.set.add(name)); }}
  remove(...names) {{ names.forEach((name) => this.set.delete(name)); }}
  toggle(name, force) {{
    const on = force === undefined ? !this.set.has(name) : Boolean(force);
    if (on) this.set.add(name); else this.set.delete(name);
    return on;
  }}
  contains(name) {{ return this.set.has(name); }}
}}
class FakeElement {{
  constructor(tag) {{
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {{}};
    this.classList = new FakeClassList();
    this.style = {{}};
    this.listeners = {{}};
    this.attributes = {{}};
    this.parentElement = null;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.draggable = false;
  }}
  get className() {{ return [...this.classList.set].join(' '); }}
  set className(value) {{
    this.classList.set = new Set(String(value).split(/\\s+/).filter(Boolean));
  }}
  append(...nodes) {{
    for (const node of nodes) {{
      if (node && node.__fragment) {{
        for (const child of node.children) {{ child.parentElement = this; this.children.push(child); }}
      }} else if (node) {{
        node.parentElement = this;
        this.children.push(node);
      }}
    }}
  }}
  replaceChildren(...nodes) {{ this.children = []; this.append(...nodes); }}
  setAttribute(name, value) {{ this.attributes[name] = String(value); }}
  addEventListener(type, handler, options) {{
    (this.listeners[type] || (this.listeners[type] = [])).push({{ handler, options }});
  }}
  dispatch(type, event) {{
    for (const entry of this.listeners[type] || []) entry.handler(event);
    return event;
  }}
  closest(selector) {{
    let node = this;
    while (node) {{
      if (node instanceof FakeElement && matches(node, selector)) return node;
      node = node.parentElement;
    }}
    return null;
  }}
  contains(node) {{
    let current = node;
    while (current) {{
      if (current === this) return true;
      current = current.parentElement;
    }}
    return false;
  }}
  querySelectorAll(selector) {{
    const found = [];
    const walk = (node) => {{
      for (const child of node.children) {{
        if (matches(child, selector)) found.push(child);
        walk(child);
      }}
    }};
    walk(this);
    return found;
  }}
  querySelector(selector) {{
    return this.querySelectorAll(selector)[0] || null;
  }}
  scrollIntoView() {{}}
}}
function descendants(node) {{
  const found = [];
  const walk = (current) => {{
    for (const child of current.children) {{ found.push(child); walk(child); }}
  }};
  walk(node);
  return found;
}}
const scrollPosition_1 = {{
  captureScrollPosition: (element) => ({{ top: element?.scrollTop ?? 0, left: element?.scrollLeft ?? 0 }}),
  restoreScrollPosition: (element, position) => {{
    if (!element) return;
    element.scrollTop = position.top;
    element.scrollLeft = position.left;
  }},
}};
const ShipArtwork_1 = {{
  createShipArtwork: (ship, options) => {{
    const art = new FakeElement('span');
    art.className = 'fleet-ship-artwork';
    art.dataset['shipName'] = ship.name;
    art.dataset['displayName'] = options.displayName ?? ship.name;
    art.dataset['typeLabel'] = options.shipTypeLabel ?? ship.ship_type;
    return art;
  }},
}};
global.document = {{
  createElement: (tag) => new FakeElement(tag),
  createDocumentFragment: () => {{
    const fragment = {{ __fragment: true, children: [] }};
    fragment.append = (...nodes) => {{ fragment.children.push(...nodes); }};
    return fragment;
  }},
}};
const mainScroll = new FakeElement('div');
mainScroll.classList.add('fleet-slot-scroll');
const mainList = new FakeElement('div');
mainScroll.append(mainList);
const backupScroll = new FakeElement('div');
const backupList = new FakeElement('div');
backupScroll.append(backupList);
const calls = {{ select: [], remove: [], drop: [], after: 0 }};
const exportsObj = {{}};
const factory = new Function(
  'require_scrollPosition', 'require_ShipArtwork', 'exports',
  {json.dumps(self.board_body)}
);
factory(() => scrollPosition_1, () => ShipArtwork_1, exportsObj);
const MIME = 'application/x-autowsgr-test';
const board = new exportsObj.FleetSlotBoardView({{
  mainList,
  backupList,
  mime: MIME,
  host: {{
    onSelect: (group, index) => calls.select.push([group, index]),
    onRemove: (group, index) => calls.remove.push([group, index]),
    onDrop: (payload, group, index) => calls.drop.push([payload, group, index]),
    afterDrop: () => {{ calls.after += 1; }},
  }},
}});
board.render('main', [
  {{ index: 0, ship: {{ id: 7, name: '\\u957F\\u95E8', ship_type: 'BB' }}, active: true, draggable: true, shipTypeLabel: 'BB-BB' }},
  {{ index: 1, fallbackName: '\\u672A\\u77E5\\u8230' }},
  {{ index: 2, ship: {{ id: 9, name: '\\u9646\\u5965', ship_type: 'BB' }}, badge: {{ text: '\\u5F31\\u6821\\u9A8C', relaxed: true }}, removable: true }},
]);
board.render('backup', [
  {{ index: 0, ship: null, candidateOnly: true, emptyLabel: '\\u4F7F\\u7528\\u5907\\u9009\\u961F\\u5217' }},
  {{ index: 1, ship: {{ id: 11, name: '\\u9AD8\\u96C4', ship_type: 'CA' }}, draggable: true, removable: false }},
]);
const mainSlots = mainList.children;
const backupSlots = backupList.children;
const slot0Artwork = descendants(mainSlots[0]).find((node) => node.className === 'fleet-ship-artwork');
const slot2Badge = descendants(mainSlots[2]).find((node) => String(node.className).startsWith('fleet-validation-badge'));
const slot0Remove = descendants(mainSlots[0]).find((node) => node.className === 'fleet-slot-remove');
const backupRemoveCount = descendants(backupSlots[1]).filter((node) => node.className === 'fleet-slot-remove').length;
const emptyText = mainSlots[1].children[0].textContent;
const candidateText = backupSlots[0].children[0].textContent;
const removeEvent = mainList.dispatch('click', {{
  target: slot0Remove,
  stopped: false,
  stopPropagation() {{ this.stopped = true; }},
}});
mainList.dispatch('click', {{ target: mainSlots[1] }});
backupList.dispatch('click', {{ target: backupSlots[1] }});

const queueTransfer = {{
  types: [MIME],
  effectAllowed: '',
  dropEffect: '',
  payload: {{}},
  setData(type, value) {{ this.payload[type] = value; }},
  getData(type) {{ return this.payload[type] ?? ''; }},
}};
mainList.dispatch('dragstart', {{ target: mainSlots[0], dataTransfer: queueTransfer }});
const blockedTransfer = {{ types: [MIME], payload: {{}}, setData() {{ throw new Error('should not drag'); }}, getData: () => '' }};
mainList.dispatch('dragstart', {{ target: mainSlots[1], dataTransfer: blockedTransfer }});
let prevented = 0;
mainList.dispatch('dragover', {{
  target: mainSlots[2],
  dataTransfer: {{ types: [MIME], dropEffect: '' }},
  preventDefault() {{ prevented += 1; }},
}});
const dragOverClass = mainSlots[2].classList.contains('drag-over');
const galleryTransfer = {{
  types: [MIME],
  payload: {{}},
  setData(type, value) {{ this.payload[type] = value; }},
  getData(type) {{ return this.payload[type] ?? ''; }},
}};
galleryTransfer.setData(MIME, JSON.stringify({{ source: 'gallery', shipId: 7 }}));
mainList.dispatch('drop', {{ target: mainSlots[1], dataTransfer: galleryTransfer, preventDefault() {{ prevented += 1; }} }});
const dropCleared = mainSlots[2].classList.contains('drag-over');
board.clearDragOver();
console.log(JSON.stringify({{
  mainCount: mainSlots.length,
  backupCount: backupSlots.length,
  slot0Class: mainSlots[0].className,
  slot0Group: mainSlots[0].dataset['slotGroup'],
  slot0Index: mainSlots[0].dataset['slotIndex'],
  slot0Active: mainSlots[0].classList.contains('active'),
  slot0Draggable: mainSlots[0].dataset['slotDraggable'],
  slot0Ship: slot0Artwork ? slot0Artwork.dataset['shipName'] : null,
  slot0Type: slot0Artwork ? slot0Artwork.dataset['typeLabel'] : null,
  slot2Badge: slot2Badge ? [slot2Badge.className, slot2Badge.textContent] : null,
  removeRole: slot0Remove ? slot0Remove.attributes['role'] : null,
  removeLabel: slot0Remove ? slot0Remove.attributes['aria-label'] : null,
  backupRemoveCount,
  emptyText,
  candidateText,
  removeEventStopped: removeEvent.stopped,
  calls,
  queuePayload: JSON.parse(queueTransfer.payload[MIME] || 'null'),
  blockedPayload: Object.keys(blockedTransfer.payload).length,
  prevented,
  dragOverClass,
  dropCleared,
  parsedGallery: exportsObj.parseSlotDragPayload(JSON.stringify({{ source: 'gallery', shipId: 7 }})),
  parsedSlot: exportsObj.parseSlotDragPayload(JSON.stringify({{ source: 'slot', group: 'backup', index: 3 }})),
  parsedBroken: exportsObj.parseSlotDragPayload('not-json'),
  parsedBadGroup: exportsObj.parseSlotDragPayload(JSON.stringify({{ source: 'slot', group: 'nope', index: 1 }})),
}}));
process.exit(0);
"""
        result = _run_node(script)
        self.assertEqual(result['mainCount'], 3)
        self.assertEqual(result['backupCount'], 2)
        self.assertTrue(result['slot0Class'].startswith('fleet-slot fleet-formation-slot'))
        self.assertEqual(result['slot0Group'], 'main')
        self.assertEqual(result['slot0Index'], '0')
        self.assertTrue(result['slot0Active'])
        self.assertEqual(result['slot0Draggable'], 'true')
        self.assertEqual(result['slot0Ship'], '长门')
        self.assertEqual(result['slot0Type'], 'BB-BB')
        self.assertEqual(result['slot2Badge'], ['fleet-validation-badge is-relaxed', '弱校验'])
        self.assertEqual(result['removeRole'], 'button')
        self.assertEqual(result['removeLabel'], '移除 长门')
        self.assertEqual(result['backupRemoveCount'], 0)
        self.assertEqual(result['emptyText'], '未知舰')
        self.assertEqual(result['candidateText'], '使用备选队列')
        self.assertTrue(result['removeEventStopped'])
        self.assertEqual(result['calls']['remove'], [['main', 0]])
        self.assertEqual(result['calls']['select'], [['main', 1], ['backup', 1]])
        self.assertEqual(result['queuePayload'], {'source': 'slot', 'group': 'main', 'index': 0})
        self.assertEqual(result['blockedPayload'], 0)
        self.assertEqual(result['prevented'], 2)
        self.assertTrue(result['dragOverClass'])
        self.assertFalse(result['dropCleared'])
        self.assertEqual(result['calls']['drop'], [
            [{'group': 'gallery', 'shipId': 7}, 'main', 1],
        ])
        self.assertEqual(result['calls']['after'], 1)
        self.assertEqual(result['parsedGallery'], {'group': 'gallery', 'shipId': 7})
        self.assertEqual(result['parsedSlot'], {'group': 'backup', 'index': 3})
        self.assertIsNone(result['parsedBroken'])
        self.assertIsNone(result['parsedBadGroup'])


class PackagedArtifactTest(unittest.TestCase):
    """7.8 交付物：语法、sourcemap 与 asar 打包一致性。"""

    def test_node_check_passes(self) -> None:
        completed = subprocess.run(
            ['node', '--check', str(RENDERER)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_sourcemap_covers_shared_modules(self) -> None:
        payload = json.loads(SOURCE_MAP.read_text(encoding='utf-8'))
        sources = payload['sources']
        self.assertIn('src/view/plan/FleetSlotBoardView.js', sources)
        self.assertIn('src/model/fleet/FleetQueueOps.js', sources)
        self.assertEqual(len(sources), len(payload['sourcesContent']))
        for path in ('src/view/plan/FleetEditorView.js', 'src/view/plan/DecisivePlanView.js'):
            index = sources.index(path)
            self.assertIn('FleetSlotBoardView_1', payload['sourcesContent'][index])
        gallery = payload['sourcesContent'][sources.index('src/view/plan/FleetGalleryView.js')]
        self.assertIn('GALLERY_LAYOUTS', gallery)
        plan_model = payload['sourcesContent'][sources.index('src/model/PlanModel.js')]
        self.assertEqual(
            [
                line.strip() for line in plan_model.split('\n')
                if 'scheduled_time' in line and not line.strip().startswith('//')
            ],
            ['delete obj.scheduled_time;'],
        )

    def test_asar_matches_work_and_integrity(self) -> None:
        files = _asar_files()
        for path in ('dist/renderer.bundle.js', 'dist/renderer.bundle.js.map'):
            self.assertIn(path, files)
            meta, data = files[path]
            self.assertEqual(meta['integrity']['hash'], hashlib.sha256(data).hexdigest())
            self.assertFalse(meta.get('unpacked'))
            self.assertEqual(data, (WORK / path.replace('/', '\\')).read_bytes())

        _meta, bundle = files['dist/renderer.bundle.js']
        text = bundle.decode('utf-8')
        self.assertIn('FleetSlotBoardView', text)
        self.assertEqual(text.count('fleet-slot fleet-${group === "main"'), 1)
        self.assertNotIn('registerScheduledTask', text)
        packed_lines = [line.strip() for line in text.split('\r\n')]
        self.assertEqual(
            [
                line for line in packed_lines
                if 'scheduled_time' in line and not line.startswith('//')
            ],
            ['delete obj.scheduled_time;', 'delete result.scheduled_time;'],
        )

        packed_map = json.loads(files['dist/renderer.bundle.js.map'][1].decode('utf-8'))
        self.assertIn('src/view/plan/FleetSlotBoardView.js', packed_map['sources'])
        self.assertIn('src/model/fleet/FleetQueueOps.js', packed_map['sources'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
