---
name: kanyu-gis
description: Kanyu (堪舆) GIS 工作区能力地图。当任务涉及 E:\BaiduSyncdisk\堪舆GIS 的地图渲染、GIS 数据读取、坐标系框架、工程目录、地理处理工具、图层编辑、3D 场景、MCP 服务器，或需要定位模块/crate、选择验证命令、执行 kanyu CLI 时，加载本技能再动手。
metadata: { type: domain, version: "1.0", workspace: 'E:/BaiduSyncdisk/堪舆GIS' }
---

# Kanyu (堪舆) GIS 能力地图

E:\BaiduSyncdisk\堪舆GIS 是「AI 原生地理空间操作系统」的纯软件工程仓库（无 GIS 地理数据层，`AGENTS.md` 显式声明 `data-layer: 否`，校验免检）。本技能只做**路由**：把请求映射到 crate 与验证命令。

## 单一事实来源（动手前先读，永不复制）

模块清单、MCP 工具清单、格式矩阵**只维护在 `kanyu-core` 代码里**。需要"现在支持什么"时，直接运行自省，不在文档/回答里抄格式表：

```bash
kanyu introspect                     # 模块清单 / 工具清单 / 格式矩阵
kanyu introspect --json              # 机器可读
```

配套文档索引（引用，勿复写）：

- `AI_SYNC.md`（**强制前置**：开工登记、收工回记、状态快照、迭代边界——开始任何工作前先读）
- `AGENTS.md`：校验契约、构建/验证命令、不可逾越的约定
- `docs/`：MASTERPLAN（总规与能力蓝图）、ARCHITECTURE、API（格式矩阵同步处）、MCP、CLI
- `SECURITY.md`：MCP 安全基线（永不暴露 `execute_code`）

## 能力域 → crate 路由表

| 能力域 | 主 crate（入口） | 关键模块 | 验证命令 |
|--------|------------------|----------|----------|
| ① 地图（渲染） | `crates/kanyu-render/` | 离屏渲染：SVG 零依赖 + tiny-skia PNG；晨山/夜观星主题；`symbolize.rs` 符号化 | `cargo build -p kanyu-render && cargo test -p kanyu-render` |
| ② 数据读取 | `crates/kanyu-core/` | `format.rs`（格式注册表/矩阵）；`layers.rs`（图层模型、AGENTS.md 语义解析） | `cargo build -p kanyu-core && cargo test -p kanyu-core` + `kanyu introspect` |
| ③ 坐标系（CRS） | `crates/kanyu-core/` | `crs.rs`（crs 解析、`resolve_data_layer` 语境裁决） | `cargo test -p kanyu-core -- crs`；shell 侧：`crates/kanyu-shell/src/settings.rs`（坐标系全库） |
| ④ 工程目录 | `crates/kanyu-shell/` | `catalog.rs`（五分类目录树）；`toc.rs`（Contents 图层树 + 符号化分类展开） | `cargo build -p kanyu-shell && cargo test -p kanyu-shell` |
| ⑤ 地理处理 | `crates/kanyu-core/` + `crates/kanyu-shell/src/toolbox/` | `tooldef.rs`（`TOOLS` 注册表：分类/中文名/参数表，对齐 ArcGIS Python 工具规范）；`analysis/`、`geoprocess/`（内核算法）；`toolrun.rs`（`run_tool` 分派）；shell `toolbox/`（参数对话框） | 加工具三步：`tooldef.rs` 加 `ToolDef` → `toolrun.rs` 加分支 → 壳层/CLI/Python 自动可见；验证：`cargo clippy --workspace --all-targets -- -D warnings` + `--tool-demo` 预设参数对话框截图验证 |
| ⑥ 编辑 | `crates/kanyu-edit/`（内核）+ `crates/kanyu-shell/src/edit.rs`（会话） | `crates/kanyu-edit/src/`：`undo.rs`（命令逆操作双栈）、`commands/`（GeomPath 三级定位）、`vertex.rs`/`draw.rs`/`cell.rs`；shell `edit.rs`（顶点/绘制/单元格会话）、`attrtable.rs`（属性表 + 字段计算器）、`symbology.rs`（单色/唯一值/分级，入 .kyu） | `cargo test -p kanyu-edit && cargo test -p kanyu-shell` |
| ⑦ 3D | `crates/kanyu-shell/src/scene3d.rs`（实验性，`mapview.rs` 页签吸附 + 纯白画布之上） | `scene3d.rs` | `cargo build -p kanyu-shell` |
| MCP 服务器 | `crates/kanyu-mcp/`（rmcp 3.x，stdio + streamable HTTP，SEP-2663 长任务） | `server.rs` 的 `#[tool_router]` 块（工具唯一清单） | `cargo build -p kanyu-mcp && cargo test -p kanyu-mcp` |
| CLI | `crates/kanyu-cli/` | `cli.rs`（clap derive）+ `commands.rs`（实现） | `cargo build -p kanyu-cli` |
| 技能（WASM 宿主） | `crates/kanyu-skill/` | wasmtime 沙箱 + WIT 组件模型 ABI + fuel 配额 | `cargo build -p kanyu-skill && cargo test -p kanyu-skill` |
| AI/MCP 联动入口 | 根 `AGENTS.md` + `crates/kanyu-core/src/introspect.rs` | `kanyu introspect`、`kanyu agents validate`、`kanyu agents init`（模板：`--geo [crs]` / `--code-repo [crs]`） | `kanyu agents validate --code-repo`（在仓库根执行，零路径参数） |

## DSH 组件形态（本会话即运行在堪舆 GIS 组件之上）

本 preset 会话所在的 DSH 组件源在 `dsh/`（开源双仓：主仓 `DaoMingyuan/Kanyu` 的 `dsh/` + 独立组件仓 `DaoMingyuan/kanyu-gis`）。需要「组件现在能做什么」时以代码与自省为准，勿抄本文：

- **双半与双安装形态**：`dsh/plugin/host.js` + `plugin/client.js`（动态包形态，cordis_define/cordis_run，进程内存态不落盘）；`dsh/pkg/`（常驻静态双面包：`index.js` Host 适配器 + `client.js` 静态客户端 bundle + `package.json` dsh.client 声明，已装进本机 web profile，随 DSH 启动激活）。
- **模型侧 8 工具**（Harness function-calling 面）：`kanyu_introspect` / `kanyu_catalog` / `kanyu_data` / `kanyu_render` / `kanyu_crs` / `kanyu_geoprocess` / `kanyu_edit` / `kanyu_scene3d`——全部经 PATH 上的 `kanyu` CLI 执行，找不到 CLI 时 kanyu-mcp 兜底。
- **MCP 桥 17 stable 工具**：preset 组合含 `mcp-kanyu` 行（`dsh-mcp-client`，stdio 长驻子进程 `kanyu mcp serve`），模型另见 `mcp__kanyu__*` 工具面（crates/kanyu-mcp 的 17 stable 工具，与 8 动态工具互补：动态工具走一次性 CLI 调用，MCP 桥走长驻 stdio 会话）。
- **面板侧 25 RPC**（工作台页签 ↔ Host 半；静态形态经 `/kanyu-gis/call` 桥）：`ping` / `introspect` / `catalog.list` / `services.discover` / `services.fetch` / `services.wms` / `data.info` / `data.query` / `data.validate` / `data.preview` / `render.map` / `crs.presets` / `crs.reproject` / `crs.search`（EPSG 全库检索，经 `kanyu crs search`，CLI 过旧回退预设兜底）/ `geoprocess.list` / `geoprocess.run` / `toolbox.list` / `toolbox.run`（tooldef 37 工具注册表全库，经 `kanyu tool list/run`，CLI 过旧降级为升级指引）/ `edit.ops` / `edit.geometry` / `edit.apply` / `edit.undo` / `edit.redo` / `edit.history` / `scene3d.data`。
- **GIS 工作台**：会话头部「🧭 堪舆GIS」按钮 + 七页签浮层（目录/数据/地图/坐标/处理/编辑/3D/关于），随 kanyu-gis preset 联动显示（会话 `agentPreset` 快照门控，切走即隐藏）。
- **编辑内核**：对齐 kanyu-edit 命令逆操作双栈——变更算子应用时算结构化逆操作入 undo 栈（容量 64、新变更清 redo），撤销/重做经 `edit.undo`/`edit.redo`（工作台编辑页签有按钮）。
- **组件验证面**：`node dsh/tools/test_plugin.mjs`（99 断言：RPC/工具/七能力/编辑双栈闭环+编辑回执栈深度（kanyu_edit 撤销栈契约）/服务链接回执指引（discover 拉取用法 + fetch 接力提示 + xml/data 离线直通）/3D 管线契约+分类着色（colorField/categories/catColor 双端锁）/符号化/属性表预览/data.info 范围摘要（extent 四元组契约）/查询联动（runQuery 落盘 + 命中计数 + 设为当前图层双端锁 + kanyu_data query 落盘回执）/投影变换联动（runReproject 双端锁 + kanyu_crs reproject 计数回执）/工具箱产图层联动（tbRun 缺省落盘 + stderr 写出清单 + 首产出设当前图层双端锁）/目录五分类（地图框=渲染产物、布局框=.kyu layouts）/服务链接发现+拉取+WMS 底图/属性单元格编辑/顶点编辑画布/CRS 全库检索（含兜底降级）/工具箱注册表（37 工具全库 + 双端全库表单 + 降级指引双态 + kanyu_geoprocess 注册表分支 + 双分支产出回执）/workspace-write 指引/pkg 双面包契约 + RPC 桥实测；`--static` 为无 CLI 的 CI 模式 76 断言）；`node dsh/tools/verify_preset.mjs --preset-dir dsh/presets`（preset 可加载性旁路校验，含运行时同款 name 判定）；`bash dsh/sync-local.sh`（**每次更新后必跑**：preset 回灌 + 校验 + 插件重装一键化，运行中的 dsh web 实例须重启方生效）。

## 依赖方向（改前先确认不违反）

`kanyu-core` 不依赖任何兄弟 crate；`render`/`skill` 依赖 core；`cli`/`mcp` 依赖 core+render+skill；`shell` 依赖 core+render+skill（外加 `edit` 内核的编辑命令）。内核**零 C 依赖**：GDAL/GEOS/LibreDWG 只能以可选 feature 或 WASM 插件存在，默认构建必须在三大桌面平台开箱通过。

## 标准验证序列（提交前全绿）

```bash
cargo build --workspace
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
kanyu agents validate --code-repo
kanyu introspect
```

`kanyu` 二进制路径见会话 state `kanyu_core` 指向的 `target/debug/kanyu`；验证前先确认二进制为本仓库本次构建产物。

## 新增能力工作流（按请求类型选路）

- **改格式矩阵** → 编辑 `crates/kanyu-core/src/format.rs` → 同步 `docs/API.md` 与 README 能力表。
- **加 MCP 工具** → `crates/kanyu-mcp/src/server.rs` 的 `#[tool_router]` 块 → `introspect.rs::tools()` 登记 → 更新 `docs/MCP.md`。
- **加 CLI 命令** → `crates/kanyu-cli/src/cli.rs` 定义 + `commands.rs` 实现 → 更新 `docs/CLI.md`。
- **加工具箱工具** → `core/src/tooldef.rs` 的 `TOOLS` 注册表加 `ToolDef`（分类/中文名/参数表）→ 内核算法写入 kanyu-core（`analysis`/`geoprocess`/`crs`）→ `core/src/toolrun.rs` 的 `run_tool` 加分支 → 壳层/CLI/Python 自动可见 → `--tool-demo` 截图验证（见能力域⑤）。
- **加 UI 图标** → `ui_kit/icons.rs` 的 `Icon` 枚举加变体（含手绘 `draw` 分支）→ `arcgis_resource_name()` 登记 ArcGIS Pro 资源名映射（单一事实来源）→ 调用方一律走 `draw_or_image()`（位图优先、手绘回退双轨）。**许可边界**：ArcGIS Pro 位图 PNG 仅存用户本机 `%LOCALAPPDATA%\Programs\kanyu\icons\`（light/dark 双主题），**不得提交进仓库再分发**；仓库内只保留手绘图标与映射表，克隆环境自动回退手绘。
- **加 MCP 长任务** → 遵循 SEP-2663（rmcp 3.x 的 `ToolCallContext`/长任务模型），`server.rs` 内实现 `TaskNotification`，见 `docs/MCP.md` 长任务节。

## UI 铁律（kanyu-shell 专属，改动前必查）

1. **先查 `crates/kanyu-shell/src/ui_kit/`** 已有组件再调用；确无组件时按 `ui_kit/mod.rs` 分类标准（`tokens`/`controls`/`containers`/`icons`）新建**可复用**组件入 kit。禁止业务代码一次性手搓样式——色值/字号/间距只许出自 `theme::palette` 与 `ui_kit::tokens`（含 `tokens::state` 状态色强制）。
2. **WCAG 对比度 + 24px 交互目标**：新控件走 `controls` 内已验证的参数；截图验证模式下对照 `ui_kit/mod.rs`「设计审查规范」清单（层级/间距/文本/色彩/交互/三分离/AI slop 黑名单）逐项核验。

## 不可逾越的约定（摘要，全文见根 `AGENTS.md`「不可逾越的约定」节）

- **单一事实来源**：模块/工具/格式清单只写在 `kanyu-core` 代码（`introspect.rs`/`format.rs`/`tooldef.rs`），文档只引用不复写。
- **MCP 永不暴露任意代码执行**（无 `execute_code`），基线见 `SECURITY.md`。
- **无冗余文件**：新文档优先扩展现有文件；不留 `.bak`、临时输出、重复文档。
- 代码注释与文档用**中文**；标识符用**英文**；提交信息用 Conventional Commits。
- 联动协议：开工先在 `AI_SYNC.md` 会签簿登记，收工回记并同步状态快照；自我迭代只发生在 GitHub 协作层，运行时绝不自改内核。

## 校验契约（零手工裁决）

`kanyu agents validate` 对「数据层语义表必填」按优先级裁决（`AgentsMd::resolve_data_layer`）：**元数据行 `- **data-layer**: 是/否` 最高优先**（`是`→必填，`否`→免检）；未显式声明才回退 crs 占位（真实编码→地理项目→语义表必填；`不适用`/`N/A`→代码仓库→免检，软告警不阻断）。本仓库 `AGENTS.md` 已写 `data-layer: 否`，故零参 `kanyu agents validate` 或 `--code-repo` 旗标均可一次通过、零人工。
