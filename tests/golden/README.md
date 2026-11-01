# Golden set 回归防线（4.4）

这是项目自带的页面识别回归测试：改任何识别器、阈值或模板后，先跑一遍，确认 62 张历史截图和 15 个注册页面都没有退化。

## 一键运行

在仓库根目录任选一种：

```bat
run_golden.bat
```

```bat
python\python.exe tests\run_golden.py
```

```bat
tests\run_golden.bat
```

只想要汇总、不想逐张打印：

```bat
python\python.exe tests\run_golden.py --quiet
```

成功时退出码为 `0`；任何页面、得分、阈值、战斗阶段变化都会打印 `[FAIL]` 并返回 `1`。

> 为什么不用 `python -m tests.golden.test_recognition`：GUI 自带的 `python\python.exe` 是 embedded 发行版（`python312._pth`，`isolated=1`），不把当前目录加入 `sys.path`。`tests\run_golden.py` 会自己把仓库根目录放进去，所以是本项目推荐入口。若你另装了一个带 `cv2`/`autowsgr` 的普通 Python，`python -m tests.golden.test_recognition` 也可以。

## 目录结构

```text
tests/
  run_golden.py                 # 一键入口（自动定位仓库根目录）
  run_golden.bat                # Windows 双击/命令行入口
  golden/
    README.md
    test_recognition.py         # 回归脚本：逐图识别 + 比对
    generate_expectations.py    # 重新生成基线快照
    build_page_fixtures.py      # 重新生成页面夹具
    page_fixtures.py            # 夹具规格与合成逻辑
    expectations.json           # 基线：页面、分数、阈值、战斗阶段
    images/
      real/nav_error/           # 19 张历史 NavError 帧
      real/session/<会话>/      # 41 张会话帧
      real/expedition/          # 1 张远征结果页（期望 UNKNOWN）
      real/login/               # 1 张登录页（期望 登录页面）
      pages/                    # 13 张合成页面夹具
```

`expectations.json` 里每张图都有：

- `expected_page`：期望页面名；`null` 表示期望 UNKNOWN
- `expected_score`：期望页面得分；期望 UNKNOWN 时记录最高原始分
- `expected_threshold`：期望页面阈值；期望 UNKNOWN 时记录最高分页面的阈值
- `combat_phase`：战斗阶段基线
- `source` / `origin`：真实截图来源或合成夹具的模板来源

## 62 张真实截图 + 13 张页面夹具

- **62 张真实截图**：`logs/` 下现有全部 PNG，原样复制。它们是真实世界回归，覆盖 `出征准备` 4 张、`选择舰船页面` 1 张、`登录页面` 1 张，其余 56 张是 UNKNOWN/战斗帧，用于防止“改了 A 把 B 的分数带偏”。其中 `real/expedition/` 是 2026-10-29 远征结果页（本来就没有页面签名，期望 UNKNOWN），`real/login/` 是登录/选区页（「进入游戏」按钮模板正样本）。
- **13 张页面夹具**：现有素材只有 2 个页面有真机正样本；为了让 14 个注册页面都被接住，用当前锚点模板合成了 12 个缺失页面的最小夹具（外加 1 张 `选择舰船页面` 的像素签名夹具）。夹具明确标注 `source=synthetic`，**不是真机截图**，不能替代真机验收。
- 夹具只回答“这个页面还认不认得自己的锚点”，真实世界退化仍靠 60 张截图和后续补入的真机图。页面锚点缺口见 `.workbuddy/docs/page_anchors.md` §5/§7。

## 更新基线的正确姿势

只有**确认是预期变化**时才更新基线；更新前先看 `[FAIL]` 明细。

1. 改了模板或有意调整识别器/阈值：

```bat
python\python.exe tests\golden\build_page_fixtures.py
python\python.exe tests\golden\generate_expectations.py
python\python.exe tests\run_golden.py
```

2. 新增真机截图：把图放进 `images/real/session/<会话名>/` 或 `images/real/nav_error/`，再跑 `generate_expectations.py`。新增图会自动进入基线，并参与页面覆盖统计。
3. 只想核对夹具有没有被手改：

```bat
python\python.exe tests\golden\build_page_fixtures.py --check
```

## 失败提示长什么样

模板被改坏、识别器回归或阈值漂移时，脚本会打印图片路径、期望/实际页面、期望/实际得分、阈值、战斗阶段和 Top 候选，例如：

```text
[FAIL] pages/SIDEBAR.png
  图片路径: ...\tests\golden\images\pages\SIDEBAR.png
  期望页面: 侧边栏
  实际页面: UNKNOWN
  期望得分: 1.000000
  实际得分: 0.612345
  得分差: -0.387655 (容差 0.002000)
  期望阈值: 0.800000
  实际阈值: 0.800000
  战斗阶段: 期望 - / 实际 -
  判定: 页面不一致, 得分超出容差
  Top: 主页面=0.612/thr=0.95, ...
```

## 模板破坏验收

把 `python\site-packages\autowsgr\data\images\page\sidebar_540p.png` 临时改坏，再跑：

```bat
python\python.exe tests\run_golden.py
```

必须出现红色 `[FAIL]`，且至少 `pages/SIDEBAR.png` 被点名。恢复模板后重跑应回到全 PASS。验收脚本不会自动改模板；破坏与恢复由执行人手动完成，或使用备份目录里的原图。

## 容差

- 页面名、战斗阶段：必须完全一致。
- 得分：默认绝对容差 `0.002`（基线里的 `score_tolerance`），可用 `--tolerance` 覆盖。
- 阈值：完全一致（阈值变化必须显式更新基线）。

## 与 3.9 manifest 的关系

`image_resources/manifest.json` 校验模板文件的存在性、尺寸和 sha256；golden set 校验“模板变化后页面识别结果是否仍然正确”。两者互补：manifest 发现文件被改，golden set 发现行为被改。
