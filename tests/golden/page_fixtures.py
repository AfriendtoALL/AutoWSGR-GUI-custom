"""Build minimal synthetic page fixtures for pages without real screenshots.

The 60 archived frames only cover ``BATTLE_PREP`` and ``CHOOSE_SHIP`` as
positive page matches.  The other 12 registered pages need a repeatable
positive sample so a template edit cannot silently break page recognition.

These fixtures are *not* real screenshots.  They are 960x540 canvases with the
page's own anchor template pasted at its natural size, plus the tab-bar probes
for the five tabbed pages.  They are deliberately simple: they answer "does
this page still recognise its own anchor?", not "does a real game frame still
match?".  Keep the 60 real frames as the real-world regression and replace
these fixtures with real screenshots whenever material becomes available.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

CANVAS_W = 960
CANVAS_H = 540
BACKGROUND = (30, 30, 30)
TAB_CROP_W = 604
TAB_CROP_H = 40
TAB_ERODE = 3
TAB_PROBE_DX = 0
TAB_PROBE_DY = 0


@dataclass(frozen=True, slots=True)
class FixtureSpec:
    """One synthetic page fixture."""

    filename: str
    page: str
    kind: str
    template: str | None = None
    position: tuple[int, int] | None = None
    active_tab: int = 0


# Page names are resolved from PageName in build_page_fixtures.py so this module
# does not import the vision stack at import time.
FIXTURE_SPECS: tuple[FixtureSpec, ...] = (
    FixtureSpec('MAIN.png', '主页面', 'template', 'main_page/main_page_540p.png'),
    FixtureSpec('MAP.png', '地图页面', 'tabbed', 'ui/map.png'),
    FixtureSpec('SIDEBAR.png', '侧边栏', 'template', 'page/sidebar_540p.png'),
    FixtureSpec('MISSION.png', '任务页面', 'tabbed', 'ui/mission.png'),
    FixtureSpec('BACKYARD.png', '后院页面', 'template', 'page/backyard_540p.png'),
    FixtureSpec('BATH.png', '浴室页面', 'template', 'bath/bath_540p.png'),
    FixtureSpec('CANTEEN.png', '食堂页面', 'template', 'page/canteen_540p.png'),
    FixtureSpec('BUILD.png', '建造页面', 'tabbed', 'ui/build.png'),
    FixtureSpec('INTENSIFY.png', '强化页面', 'tabbed', 'ui/intensify.png'),
    FixtureSpec('FRIEND.png', '好友页面', 'tabbed', 'ui/friend.png'),
    FixtureSpec('EVENT_MAP.png', '活动页面', 'template', 'event/quiz_prompt_20260930_540p.png'),
    FixtureSpec(
        'DECISIVE_BATTLE.png',
        '决战页面',
        'template',
        'decisive/entry_challenging_540p.png',
    ),
    FixtureSpec('CHOOSE_SHIP.png', '选择舰船页面', 'pixels'),
)


def template_root() -> Path:
    """Return the bundled ``autowsgr/data/images`` directory."""

    import autowsgr

    return Path(autowsgr.__file__).resolve().parent / 'data' / 'images'


def fixture_specs() -> tuple[FixtureSpec, ...]:
    """Return the fixture catalogue, with page names normalised to ``str``."""

    from autowsgr.types import PageName

    by_name = {
        '主页面': PageName.MAIN.value,
        '地图页面': PageName.MAP.value,
        '侧边栏': PageName.SIDEBAR.value,
        '任务页面': PageName.MISSION.value,
        '后院页面': PageName.BACKYARD.value,
        '浴室页面': PageName.BATH.value,
        '食堂页面': PageName.CANTEEN.value,
        '建造页面': PageName.BUILD.value,
        '强化页面': PageName.INTENSIFY.value,
        '好友页面': PageName.FRIEND.value,
        '活动页面': PageName.EVENT_MAP.value,
        '决战页面': PageName.DECISIVE_BATTLE.value,
        '选择舰船页面': PageName.CHOOSE_SHIP.value,
    }
    return tuple(
        FixtureSpec(
            filename=s.filename,
            page=by_name[s.page],
            kind=s.kind,
            template=s.template,
            position=s.position,
            active_tab=s.active_tab,
        )
        for s in FIXTURE_SPECS
    )


def _fit_position(image_w: int, image_h: int) -> tuple[int, int]:
    return max(0, (CANVAS_W - image_w) // 2), max(0, (CANVAS_H - image_h) // 2)


def build_fixture(spec: FixtureSpec):
    """Create one RGB fixture image as a numpy array."""

    import cv2
    import numpy as np

    canvas = np.full((CANVAS_H, CANVAS_W, 3), BACKGROUND, dtype=np.uint8)
    if spec.kind == 'template':
        assert spec.template is not None
        path = template_root() / spec.template
        bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if bgr is None:
            raise FileNotFoundError(f'cannot decode fixture template: {path}')
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        x, y = spec.position or _fit_position(w, h)
        if y + h > CANVAS_H or x + w > CANVAS_W:
            raise ValueError(f'{spec.filename}: template {w}x{h} does not fit the canvas')
        canvas[y : y + h, x : x + w] = rgb
        return canvas

    if spec.kind == 'tabbed':
        assert spec.template is not None
        from autowsgr.ui.tabbed_page import TAB_BLUE, TAB_DARK, TAB_PROBES

        path = template_root() / spec.template
        tmpl = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if tmpl is None:
            raise FileNotFoundError(f'cannot decode tab template: {path}')
        tmpl = cv2.erode(tmpl, np.ones((TAB_ERODE, TAB_ERODE), np.uint8), iterations=1)
        crop = cv2.resize(tmpl, (TAB_CROP_W, TAB_CROP_H), interpolation=cv2.INTER_NEAREST)
        canvas[0:TAB_CROP_H, 0:TAB_CROP_W] = crop[:, :, None]
        for index, (px, py) in enumerate(TAB_PROBES):
            x = int(px * CANVAS_W) + TAB_PROBE_DX
            y = int(py * CANVAS_H) + TAB_PROBE_DY
            color = (
                (TAB_BLUE.r, TAB_BLUE.g, TAB_BLUE.b)
                if index == spec.active_tab
                else TAB_DARK
            )
            canvas[max(0, y - 2) : y + 3, max(0, x - 2) : x + 3] = color
        return canvas

    if spec.kind == 'pixels':
        from autowsgr.ui.choose_ship_page import PAGE_SIGNATURE

        for rule in PAGE_SIGNATURE.rules:
            x = int(rule.x * CANVAS_W)
            y = int(rule.y * CANVAS_H)
            color = (rule.color.r, rule.color.g, rule.color.b)
            canvas[max(0, y - 1) : y + 2, max(0, x - 1) : x + 2] = color
        return canvas

    raise ValueError(f'unknown fixture kind: {spec.kind}')


def write_fixture(spec: FixtureSpec, out_dir: Path) -> Path:
    """Build and write one fixture as PNG; returns the written path."""

    import cv2

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / spec.filename
    image = build_fixture(spec)
    if not cv2.imwrite(str(out_path), cv2.cvtColor(image, cv2.COLOR_RGB2BGR)):
        raise OSError(f'failed to write fixture: {out_path}')
    return out_path
