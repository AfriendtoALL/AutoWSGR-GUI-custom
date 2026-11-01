# AutoWSGR-GUI-custom

AutoWSGR-GUI 的**个人定制版源码存档**：后端 Python 源码、前端（Electron 渲染层 + 主进程）解包源码、
页面识别回归测试与全套设计文档。基于 [OpenWSGR/AutoWSGR](https://github.com/OpenWSGR/AutoWSGR) 修改。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `python/site-packages/autowsgr/` | 后端源码，与安装目录路径一一对应（`autowsgr 2.3.0` 定制版） |
| `frontend/` | 前端源码：渲染层 130 个模块 + 主进程 83 个文件，自 `resources/app.asar` 解包（`wsgrgui 2.1.2-alpha.3`） |
| `tests/` | 回归测试：批次 4.1–7 用例 + golden 识别基线（75 图 / 48.5 MB） |
| `presets/` | 可直接导入的作战计划预设（如 `decisive-00-E6-全自动刷分.yaml`） |
| `docs/` | 需求、排期、映射、核查文档，入口见 [docs/README.md](docs/README.md) |
| `run_golden.bat`、`tests/run_golden.bat` | golden 回归一键入口 |

前端目录的构成与来源（哪些是手写、哪些从 sourcemap 还原、怎么重新同步）见
[frontend/README.md](frontend/README.md)。

## 快速开始

```bat
:: 页面识别回归（75 张图，约 3 分钟）
run_golden.bat

:: 只输出汇总
python\python.exe tests\run_golden.py --quiet
```

golden 基线覆盖 62 张真机截图 + 13 张合成页面夹具，对应 15 个注册页面；
任何识别器/阈值/模板改动都应先跑一遍，`[FAIL]` 会打印期望值与实际值。

## 生效方式

本仓库是**源码存档**，不是可直接构建的工程：

- **后端**：把 `python/site-packages/autowsgr/` 覆盖回安装目录同名路径即可（运行时为 `python/python.exe` 3.12）。
- **前端**：`frontend/dist/**` 与 asar 内同名文件一一对应；修改后需重新打包 `resources/app.asar`
  并同步每个条目的 `integrity`（详见 `frontend/README.md`）。改 `frontend/src/**` 不会直接生效。

## 不包含的内容

| 内容 | 原因 |
|---|---|
| Electron / Chromium 运行库、`AutoWSGR-GUI.exe`、`.asar` | 二进制与打包产物，随安装包分发 |
| Python 解释器与第三方依赖（`python/` 下非 `autowsgr/` 部分） | 同上，安装器自带 |
| OCR 模型 `data/ocr/ppocr_v6_small/{det,rec}.onnx` + `keys.txt`（约 30 MB） | 二进制；缺失时从上游发行渠道补齐 |
| `node_modules/`（asar 内 341 文件） | `package.json` 可还原 |
| `logs/`、`.workbuddy/` | 运行日志与内部工作记录 |

## 推送注意

本机到 `github.com:443` 的 TLS 握手会被间歇性阻断（`api.github.com` 正常）。`git push` 失败时：

```bash
python/python.exe .workbuddy/api_push.py
```

该脚本走 Git Data API（blob → tree → commit → PATCH ref）复刻本地提交，令牌取自
Git Credential Manager。API 生成的 sha 与本地不同时，需要按同样方式重建提交对象再 `update-ref` 对齐。

## 许可证

根目录 [LICENSE](LICENSE)：**OpenWSGR 严格非商业性许可协议**。

- 仅限非商业、非营利、完全免费地使用/复制/修改/分发；
- 衍生作品必须以完全相同的条款分发（相同方式共享）；
- 所有副本须保留版权声明与本许可声明。

上游包元数据 `METADATA` 标注 `License: MIT` 与其随包 `LICENSE` 不一致，以 `LICENSE` 原文为准。
