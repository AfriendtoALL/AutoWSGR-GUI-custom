# AutoWSGR-GUI-custom

AutoWSGR-GUI 的**个人定制版后端源码快照**，外加配套的问题清单与修复排期文档。

## 仓库内容

| 路径 | 说明 |
| --- | --- |
| `python/site-packages/autowsgr/` | 后端源码（与 GUI 安装目录中的路径一一对应，改哪一行看文档里的 `py:` 前缀即可） |
| `AutoWSGR-GUI-问题汇总与修复排期.md` | 问题总表、统一编号（R01–R51）、批次 0–7 排期 |
| `LICENSE` | 上游许可证原文（非商业 · 相同方式共享） |

## 上游与版本

- 上游项目：[OpenWSGR/AutoWSGR](https://github.com/OpenWSGR/AutoWSGR)
- 包版本：`autowsgr 2.3.0`（`autowsgr-2.3.0.dist-info/METADATA`）
- 本仓库是**衍生作品**：包含本机对上游代码的修改（见下）

## 本仓库承载的本地改动

按《问题汇总与修复排期》的批次推进，已落地：

- **批次 0**：补注册 `BATTLE_PREP`、页面元数据 `overlay/always`、候选集并入 always（R46 治标）
- **批次 1**：进度不变式与可观测性、导航取证（R47）
- **批次 2**：`act_and_wait` 闭环原语、`wait_for_page` 稳定帧、恢复阶梯（R48）
- **专项**：R02 停止响应下沉、R03 三级兜底（返回箭头 / 网络弹窗 / 重建栈）
- **批次 3.1 / 3.2**：活动页锚点改为「多锚点 + 特异性排序」（标题 → 难度图标 → 出击按钮，分数取锚点自身置信度）；出击按钮模板匹配限定到右下角 `_FIGHT_BUTTON_ROI`，消除出征准备页标题栏 0.87 误命中

所有改动文件与行号在文档 §5「修复记录」与各批次章节中可查。

## 不包含的内容

- Electron/Chromium 运行库、`AutoWSGR-GUI.exe`、`.asar`（二进制与打包产物）
- Python 解释器与第三方依赖（`python/` 下除 `site-packages/autowsgr/` 外的部分）
- 上游打包的 OCR 模型 `data/ocr/**/*.onnx`（约 30 MB）
- 运行日志与截图（`logs/`）、内部工作记录与打包备份（`.workbuddy/`）

## 还原方式

把本仓库的 `python/site-packages/autowsgr/` 覆盖回安装目录同名路径即可生效（后端以 `python/python.exe` 3.12 运行）；OCR 模型缺失时需从上游发行渠道补齐 `data/ocr/ppocr_v6_small/{det,rec}.onnx` 与 `keys.txt`。

## 许可证

本仓库整体适用根目录 [LICENSE](LICENSE)：**OpenWSGR 严格非商业性许可协议**。

- 仅限非商业、非营利、完全免费地使用/复制/修改/分发；
- 衍生作品必须以完全相同的条款分发（相同方式共享）；
- 所有副本须保留版权声明与本许可声明。

上游包元数据 `METADATA` 中标注的 `License: MIT` 与其随包 `LICENSE` 不一致，以 `LICENSE` 原文为准。
