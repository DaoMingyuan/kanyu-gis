---
name: kanyu-gis
description: Kanyu (堪舆) GIS 工作区能力地图。当任务涉及 E:\BaiduSyncdisk\堪舆GIS 的地图渲染、GIS 数据读取、坐标系框架、工程目录、地理处理工具、图层编辑、3D 场景、MCP 服务器，或需要定位模块/crate、选择验证命令、执行 kanyu CLI 时，加载本技能再动手。
metadata: { type: domain, version: "1.0", workspace: "E:\BaiduSyncdisk\\堪舆GIS" }
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
