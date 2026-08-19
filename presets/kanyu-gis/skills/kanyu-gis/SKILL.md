---
name: kanyu-gis
description: Kanyu (堪舆) GIS 工作区能力地图。当任务涉及 E:\BaiduSyncdisk\堪舆GIS 的地图渲染、GIS 数据读取、坐标系框架、工程目录、地理处理工具、图层编辑、3D 场景、MCP 服务器，或需要定位模块/crate、选择验证命令、执行 kanyu CLI 时，加载本技能再动手。
metadata: { type: domain, version: "2.33", workspace: 'E:/BaiduSyncdisk/堪舆GIS' }
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
- **模型侧 9 工具**（Harness function-calling 面）：`kanyu_introspect` / `kanyu_catalog` / `kanyu_data` / `kanyu_render`（含 `symbology` LayerSymbology 编辑模型入参，地图/layout 双分支投影，与面板侧同语义）/ `kanyu_crs` / `kanyu_geoprocess` / `kanyu_edit` / `kanyu_scene3d`（含 `symbology` 逐要素取色入参）/ `kanyu_skill`（WASM 技能沙箱，内置 split_polygons 面切割（cutLine 切割线入参）+ buffer_zones 缓冲区（param {_distance} 距离入参）+ overlay_ops 叠加分析（param {_op: intersect/union/difference/clip}——clip=ArcGIS Clip 裁剪语义 + input2 第二图层入参）+ dissolve_field 融合（param {_field} 分组合并入参）+ stat_summary 统计（param {_stat} 数值字段 + 可选 {_field} 分组入参，geometry:null 表语义 _count/_avg）+ simplify_geom 几何简化（param {_tolerance} RDP 容差入参，_verts 前后顶点数，点系透传）+ measure_geom 几何量算（param {_measure: area/length} 入参，逐要素写 _area/_length，类型不匹配透传））——全部经 PATH 上的 `kanyu` CLI 执行，找不到 CLI 时 kanyu-mcp 兜底。
- **MCP 桥 17 stable 工具**：preset 组合含 `mcp-kanyu` 行（`dsh-mcp-client`，stdio 长驻子进程 `kanyu mcp serve`），模型另见 `mcp__kanyu__*` 工具面（crates/kanyu-mcp 的 17 stable 工具，与 8 动态工具互补：动态工具走一次性 CLI 调用，MCP 桥走长驻 stdio 会话）。
- **面板侧 32 RPC**（工作台页签 ↔ Host 半；静态形态经 `/kanyu-gis/call` 桥）：`ping` / `introspect` / `catalog.list` / `services.discover` / `services.fetch` / `services.wms` / `data.info` / `data.query` / `data.validate` / `data.preview` / `data.calc`（字段计算器，经 `kanyu data calc`，工作台 ƒx 区预览/应用同源）/ `data.identify`（要素点选查询：纯 fs GeoJSON 空间点选，面=射线法含洞排除/线=点到线段距/点=最近距，`tol` 容差按地图单位，面内优先距离最近；回执含 `centroid` 几何范围中心，浮层「定位至此」用）/ `render.map`（支持 `symbology` LayerSymbology 编辑模型入参，Host 半 symToRule 投影为 StyleRule）/ `render.layout`（工程模式布局排版，kyu+title 入参，经 `kanyu render layout`，SVG 双端内嵌预览）/ `crs.presets` / `crs.reproject` / `crs.search`（EPSG 全库检索，经 `kanyu crs search`，CLI 过旧回退预设兜底）/ `geoprocess.list` / `geoprocess.run` / `toolbox.list` / `toolbox.run`（tooldef 37 工具注册表全库，经 `kanyu tool list/run`，CLI 过旧降级为升级指引）/ `edit.ops` / `edit.geometry` / `edit.apply` / `edit.undo` / `edit.redo` / `edit.history` / `scene3d.data` / `catalog.readImage`（目录产物 PNG 读盘 base64，限工程目录内越界防护，地图框/布局框预览共用）/ `style.get` / `style.set`（.kyu 图层样式读写，LayerSymbology JSON 原样透传对齐壳层 symbology.rs，写回两空格缩进对齐 core to_string_pretty，写拒绝带 workspace-write 可操作指引）/ `style.list`（.kyu 图层清单全列 + source 相对工程目录绝对化 + styleMode 摘要，目录页签 .kyu 展开与图层接力地图页签用）。
- **GIS 工作台**：全屏形态接管会话中央列（顶栏 + 页签 ribbon：目录/数据/地图/坐标/处理/编辑/3D/关于 + 左侧图层坞 + 中央页签区 + 底部状态栏），随 kanyu-gis preset 联动显示（会话 `agentPreset` 快照门控：切入自动接管、切出自动收起）；「返回会话」留悬浮重开钮（🧭 堪舆GIS），会话头部按钮亦可手动开合。
- **编辑内核**：对齐 kanyu-edit 命令逆操作双栈——变更算子应用时算结构化逆操作入 undo 栈（容量 64、新变更清 redo），撤销/重做经 `edit.undo`/`edit.redo`（工作台编辑页签有按钮）。
- **组件验证面**：`node dsh/tools/test_plugin.mjs`（251 断言：RPC/工具/七能力/桥 UTF-8 正文（中文路径参数解码回归锁）/字段计算器 ƒx 面板（data.calc RPC 直通 + 双端 calcPreview/calcApply 前 5 行预览契约键）/字段计算器（kanyu data calc 出口 + kanyu_data action=calc 落盘值/stdout 直通/错误回执 + hostSrc 契约键）/编辑双栈闭环+编辑回执栈深度（kanyu_edit 撤销栈契约）+编辑算子补齐（feature-move 平移+undo 闭环+ringPath 类型分派修复+Z/M 保留+CAP 100 契约键）+挖洞算子（hole-add 对齐 kanyu-edit AddHole 校验语义+hole-remove 逆操作+挖洞/撤销闭环实测）+整行属性替换（attributes-replace 对齐 kanyu-edit UpdateProperties 自逆操作+替换/撤销闭环实测）+线打断（line-split 对齐 kanyu-edit split_line_at_point 投影吸附+line-unsplit 逆操作+打断/撤销闭环实测；面切割评估留内核侧）+拓扑共享顶点（topo-move 对齐 kanyu-edit move_shared_vertex 坐标键精确相等+自逆坐标对换+同移/撤销闭环实测）+编辑页签算子清单同步（双端 OPS 12 算子+HINTS 逐算子示例+容量 100 提示）+顶点画布拓扑模式（topoMode 开关+拖拽松开写 topo-move 双端锁）+挖洞/打断画布交互（drawMode 攒点覆盖层+applyHole/doSplitPoint 双端锁）+feature-add 画布化（绘制点/线/面三模式+doAddPoint/applyDrawNew 双端锁）+顶点框选批量移动（marquee 橡皮筋+selRef 选择集+vertices-move 原子批量算子单条 undo 双端锁）+面切割 WASM 技能通道（split_polygons guest geo Buffer+BooleanOps+skill.run RPC+cutPoly 画布切割线双端锁）+kanyu_skill 模型工具（面切割入 AI 工具面 8→9 动态工具+产出回执接力）+缓冲区 WASM 技能（buffer_zones guest geo Buffer+param _distance 注入通道+点线面膨胀属性继承+缺参中文报错实测）+叠加分析 WASM 技能（overlay_ops guest geo BooleanOps intersect/union/difference+input2 第二图层注入+缺算子/缺图层中文报错实测）+技能分析对话框（编辑页签缓冲区/叠加分析双端+skillRelay 产图层接力契约键）+融合 WASM 技能（dissolve_field guest geo union 按字段分组+相邻并单部/相离附 _part+_count 组计数+缺字段中文报错实测）+统计 WASM 技能（stat_summary guest 纯属性聚合 param _stat/_field 分组+geometry:null 表语义 _count/_skipped/_avg+宿主类型化列混合强制字符串兼容解析+缺参中文报错实测）+裁剪 clip 算子（overlay_ops guest _op=clip ArcGIS Clip 语义=基准面∩叠加整体一次性交集+叠加属性不入产出+双端下拉契约键）+几何简化 WASM 技能（simplify_geom guest geo Simplify RDP+param _tolerance 注入+_verts 前后顶点数+点系透传+缺参中文报错实测）+目录条目过滤（TabCatalog flt 过滤框+五分类子串过滤+命中/总数+过滤中强制展开双端锁）+几何量算 WASM 技能（measure_geom guest param _measure=area/length+shoelace 外环减内环/欧氏长度+类型不匹配透传+缺参中文报错实测）+CRS 检索双按钮（TabCrs 命中行「源」/「目标」分设 CRS 双端锁）+preset 联动（pkg prevGis 转换边切入自动展开/切出自动收起+plugin autoOpened 激活即展开双端锁——修「切 GIS 模式界面无变化」）+全屏工作台（双端 kyg-shell 接管会话中央列+useCenterRect 矩形同步+顶栏/图层坞/状态栏+kyg-reopen 重开钮契约键——参考「地理工作台」形态）+状态栏真实数据（render.map 成功后 data.info 取要素计数/范围→approxScale 推算近似比例尺+格式推断坐标系→store.mapInfo 发布+编辑页签框选顶点/属性表选中行→store.selVerts/selFeature 实时上栏双端锁）+顶栏工程选择（catalog.list 扫 .kyu→style.list 载入图层清单→store.kyuProject 发布→Dock 工程图层组点击=图层+样式+工程接力双端锁）+底图 WMS 入画布背景（render.map --background none 内核透明出图+loadBasemap 范围→GetMap 同尺寸垫底+axisSwap 严格 1.3.0 轴序+canvas 合成导出双端锁）+地图页签画布化（stageRef 量宽渲染铺满中央区+firstRef 入场自动出图+kyg-map-stage 预览容器+导出地图图片 PNG 下载双端锁）+3D 视角书签+PNG 导出（saveView/exportPng/toDataURL 双端锁+工具计数 9 漂移修正）+3D 书签持久化（localStorage 按图层键控 kanyu-3d-views:+delView 双端锁）+编辑页签联动刷新（apply2/undoRedo 属性表作废+几何重载+路径广播双端锁）+地图页签联动重渲染（store.rev 版本号+autoRef 双端锁）+3D 页签联动重载（auto3dRef 双端锁）+两半 RPC 面对称锁（动态=静态零独有）/3D 高度范围回执（heightRange 增量字段 + 3D 页签接力指引）/服务链接回执指引（discover 拉取用法 + fetch 接力提示 + wms bbox/宽高/urlOnly 参数面 + xml/data 离线直通）/3D 管线契约+分类着色（colorField/categories/catColor 双端锁）/符号化/属性表预览/data.info 范围摘要（extent 四元组契约）/查询联动（runQuery 落盘 + 命中计数 + 设为当前图层双端锁 + 结果集自动载入属性表 + kanyu_data query 落盘回执）/投影变换联动（runReproject 双端锁 + kanyu_crs reproject 计数回执）/工具箱产图层联动（tbRun 缺省落盘 + stderr 写出清单 + 首产出设当前图层双端锁）/目录五分类（地图框=渲染产物、布局框=.kyu layouts + freshness 自动重扫双端锁）/布局排版出口（render layout CLI + kanyu_render layout 分支）/布局预览（render.layout kyu 工程模式 + 双端 SVG 内嵌）/地图框产物预览（catalog.readImage base64 + 工程目录内越界防护）/符号化编辑模型（LayerSymbology→StyleRule 投影 symToRule 三色带 + F64_MIN 首档 + buildSymbology/symToForm 双端 + render.map symbology 出图回执 styleApplied）/工程样式读写（style.set/style.get 闭环 + 非法 mode 中文报错 + 写拒绝 writeHint 指引 + 双端读取样式/写入工程按钮）/模型侧符号化同能力（kanyu_render schema symbology 入参 + 地图/layout 双分支投影实测）/3D 符号化着色（scene3d.data symbology 逐要素取色 + catColors 映射 + symbologyMode 回执 + 双端 3D 符号化行模型色三级回退）/目录 .kyu 图层接力（style.list 全列 + source 绝对化 + 双端图层清单展开 + pickKyuLayer 设当前图层 + store.sym 接力 symRef 回填）/服务链接发现+拉取+WMS 底图/属性单元格编辑/顶点编辑画布/CRS 全库检索（含兜底降级）/工具箱注册表（37 工具全库 + 双端全库表单 + 降级指引双态 + kanyu_geoprocess 注册表分支 + 双分支产出回执）/workspace-write 指引/pkg 双面包契约 + RPC 桥实测+GIS 界面重排（KYG_GRPS ribbon 五分组组框+kyg-grp-label 组标签+kanyuIcon 手绘风 SVG 页签/罗盘图标替 emoji 双端契约键）+地图画布缩放（kyg-map-view 滚轮非 passive 监听 1.2× 步进+拖拽平移+双击复位+store.mapZoom 状态栏比例尺重算/缩放档显示双端契约键）+滚轮指针为锚（pan 倍率差补偿 pan·(z'/z)+指针相对视口中心·(1−z'/z)，光标下内容点不动，双端契约键）+工程下拉接目录自定义扫描目录（TabCatalog scan 发布 store.scanDir → Workbench 工程下拉随 scanDir 重扫 .kyu 双端契约键）+地图画布要素点选查询（identify：store.mapExtent 随渲染发布+画布单击像素分数反算地图坐标+data.identify RPC+kyg-identify 属性浮层+store.selFeature 状态栏联动+拖拽超 4px 抑制 click 双端契约键）+状态栏鼠标坐标实时跟踪（画布 mousemove 节流 ≥60ms 反算地图坐标+store.mapCursor 发布+mouseleave/出图区清空双端契约键）+地图画布量测（测距/测面：onMapClick 分派攒点+kyg-measure SVG 覆盖层随缩放平移+haversine/等距圆柱 shoelace 累算+onMapDblClick 双击冻结+清除重来双端契约键）+identify 浮层定位至此（centroid 回执+onLocateFeature zf=2 pan 倍率反解居中双端契约键）；`--static` 为无 CLI 的 CI 模式 194 断言）；`node dsh/tools/verify_preset.mjs --preset-dir dsh/presets`（preset 可加载性旁路校验，含运行时同款 name 判定 + 插件包存在性 + 技能 frontmatter）；`bash dsh/sync-local.sh`（**每次更新后必跑**：preset 回灌 + 校验 + 插件重装一键化，运行中的 dsh web 实例须重启方生效）。

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
