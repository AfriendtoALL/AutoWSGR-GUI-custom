# 前端源码（Electron 渲染层 + 主进程）

本目录不是独立构建的项目，而是从发行版打包产物 `resources/app.asar` 中还原出来的**前端源码存档**，
唯一目的：让 GUI 侧的改动进入版本管理，不再只存在于二进制 asar 里。

## 来源

| 项目 | 值 |
|---|---|
| 源文件 | `resources/app.asar`（6,203,061 字节） |
| SHA-256 | `ab17d39d196cf4b7773dd2b96799c557ae505adb6b611d0c71903ef7f44f7d9c` |
| 包名 / 版本 | `wsgrgui` 2.1.2-alpha.3（取自 asar 内 `package.json`） |
| 提取时间 | 2026-11-01 |

## 目录构成与可信度

| 路径 | 数量 | 来源 | 说明 |
|---|---|---|---|
| `src/view/*.html`、`src/view/styles/styles.css` | 3 | asar 原文件 | 作者手写，逐字节一致 |
| `src/**/*.js`、`src/data/ship_details.json` | 130 | **从 sourcemap 还原** | 取自 `renderer.bundle.js.map` 的 `sourcesContent`，是 webpack 打包时读到的原始模块，未经压缩，但为 tsc 编译后的 JS（`Object.defineProperty(exports, ...)` 形式） |
| `dist/electron/**`、`dist/src/shared/**` | 83 | asar 原文件 | 主进程、IPC、pythonEnv、共享模型；未参与渲染层打包，本身就是可读源码 |
| `dist/renderer.bundle.js` | 1 | asar 原文件 | 渲染层打包产物（1.3 MB），**临时改动历史上都是直接改这里的** |
| `dist/renderer.bundle.js.map` | 1 | asar 原文件 | 含 `sourcesContent`，是上面 130 个模块的唯一来源，勿删 |
| `package.json` | 1 | asar 原文件 | 依赖：`electron-updater ^6.8.3`、`js-yaml ^4.1.0`、`jszip ^3.10.1` |

`node_modules/` 未收录（asar 内有 341 个文件约 3.1 MB，`npm i` 可还原）。

## 重新同步

asar 内容再变动后，用脚本一键重建（`README.md` 与 `tools/` 会保留，其余按 asar 重写）：

```bash
python frontend/tools/extract_frontend.py --asar resources/app.asar --out frontend
```

脚本只读取 asar 头部的 offset/size 表，不依赖 `asar` 命令行工具。校验方式：重建后的文件树应与
`frontend/` 除 `README.md`、`tools/` 外逐字节一致（2026-11-01 已验证，219 个文件全等）。

> 已核对 sourcemap 与 bundle 同步：补丁引入的 `setDeviceLease`（`src/model/scheduler/Scheduler.js`）、
> `readApiToken`（`src/adapter/ApiAdapter.js`、`src/model/ApiClient.js`）都能在还原源码中检索到，
> 说明 `.map` 是在打补丁之后生成的，`src/` 即当前发行版的实际渲染层逻辑。

## 修改约定

- **改渲染层逻辑**：编辑 `src/**/*.js` 只是留档，不会生效。实际生效需改 `dist/renderer.bundle.js`
  或重新构建该 bundle，再用重新打包流程写回 `resources/app.asar`。
- **改主进程**：`dist/electron/**` 与 asar 内同名文件一一对应，可整文件替换。
- 重新打包 asar 必须同步更新每个文件条目里的 `integrity`（sha256 hex，4 MB 分块），
  否则 Electron 加载会报完整性校验失败。asar 头结构：`uint32 4 + uint32 n2 + uint32 n3 + uint32 jsonLen + json`，
  内容区从 `8 + n2` 开始。
- 本仓库**不含** webpack / 构建配置，原始构建流水线已丢失；`src/` 可用于阅读与 diff，
  不能直接 `npm run build` 出与发行版一致的 bundle。

## 与后端的接口

渲染层通过 `Authorization: Bearer <token>` 访问后端 `/api/*`，WebSocket 走 `?token=`；
token 由主进程每次启动生成并经 `get-api-token` IPC 下发，细节见 `dist/electron/main.js` 与后端 `autowsgr/server/main.py`。
