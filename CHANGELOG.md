# dsh/ 组件变更记录

## [0.32.0] — 2026-08-18

- **编辑页签联动刷新（双端 Client）**：通用表单 `apply2` 成功后——非原地
  写出时改用 `r.output` 为当前路径并广播（对齐顶点编辑 vUp 语义）、属性
  表作废待重载、顶点画布已加载则重载几何；`undoRedo` 成功后同刷新（改
  文件内容不改路径）。此前仅顶点拖拽路径有联动，通用表单应用/撤销/重做
  后属性表与顶点画布滞留旧数据。plugin 动态半与 pkg 静态半同步改造
  （hostCall 方言差异保持），RPC 表不变仍 25。
- **测试器 +2 断言**（双端「联动刷新/nextPath/setAttrs(null)」契约键 +
  两处命中计数锁）；总计 **101/101 全绿**（static 78/78）。

## [0.31.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_catalog` 服务链接分支回执补操作指引**：
  discover 回执尾部附「拉取图层：本工具 url + layer=<名称>（WMS 底图加
  kind=wms）」用法指引——此前模型侧拿到图层清单后不知下一步怎么拉；
  fetch 回执附「可继续作为 kanyu_data/kanyu_render/kanyu_edit 的 path
  接力检视/渲染/编辑」产出接力提示（对齐 geoprocess/edit 既有范式）。
- **工具面补齐 xml/data 离线直通参数**：`servicesDiscover`/`servicesFetch`
  的离线调试路径（给文本不触网）RPC 早有，动态工具面缺失——补上后服务
  链接分支首次可离线动态实测（不依赖外部 WFS 服务在线）。
- **测试器 +3 断言**（hostSrc 静态契约 + discover(xml) 指引动态回执 +
  fetch(data) 计数/接力提示/落盘一致）；总计 **99/99 全绿**（static
  76/76——三断言均为离线路径，两种模式皆覆盖）。RPC 表不变仍 25。

## [0.30.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_edit` 回执补撤销/重做栈深度**：编辑内核
  `editApply` 本已返回 `history: { undo, redo }`（对齐 kanyu-edit 命令
  逆操作双栈），但动态工具文本面只拼 `summary + 输出路径`，栈深被丢弃。
  现成功回执附「撤销栈 N 步 / 重做栈 M 步（可经 edit.undo/edit.redo
  RPC 或工作台编辑页签回滚）」——模型侧可据此提示用户可回滚步数，形成
  「编辑 → 回执 → 撤销提示」闭环。只读算子 feature-count 无栈深不附。
  RPC 表不变仍 25（纯动态工具文本面）。
- **测试器 +2 断言**（hostSrc 静态契约 + 临时副本 attribute-set 动态
  回执「撤销栈 1 步」）；总计 **96/96 全绿**（static 73/73）。

## [0.29.0] — 2026-08-18

- **数据域续：`data.info` 加范围（extent）摘要**（内核层增强，CLI/MCP/
  组件三面同增益）：主仓 `LayerSummary` 新增 `extent: Option<[f64;4]>`
  ——`summary()` 在既有 WKB 行走中解码几何累积坐标 bbox（空图层/全空
  几何为 None）；`kanyu data info` 文本模式加「范围」行、--json 直通；
  MCP `kanyu_data_load` 同结构自动带出。组件 `data.info` RPC 原样透传
  即获益，无组件代码改动。CRS 字段不加——内核 Layer 模型不追踪坐标系
  （reproject 为显式操作），不诚实报告不如不报。
- **测试器 +1 断言**（data.info extent 数值四元组契约）；总计 **94/94
  全绿**（static 71/71）。cargo test --workspace 全绿、clippy -D
  warnings 通过、本机 CLI 已 cargo install 更新。

## [0.28.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_geoprocess` 双分支产出回执**：精选白名单与
  注册表双分支成功回执均附「产出: N 要素 → path（可继续作为 input/path
  接力检视/渲染/编辑）」——新增 `writesSummary` 解析 stderr「已写出 N
  个要素 → path」共用契约（与客户端 tbRun 同源）。此前白名单分支缺省落
  OUT_DIR 但回执无路径无计数、注册表分支带 output 时 stdout 空回执无
  产出信息。RPC 表不变仍 25（纯动态工具文本面）。
- **测试器 +3 断言**（注册表 mean_coordinates 产出回执、白名单 buffer
  产出回执 + 落盘一致、hostSrc writesSummary 契约键）；总计 **93/93
  全绿**（static 71/71）。

## [0.27.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_crs` reproject 回执补命中计数**：动态工具
  `action=reproject` 带 `output` 成功时，返回「投影变换完成：from → to，
  N 要素 → 已写出: path（可继续作为 path 检视/渲染/编辑）」——此前仅
  「已输出: path」无计数。要素数解析自 stderr「已写出 N 个要素 → path」
  契约（与客户端 runReproject 同源）。output 参数说明同步注明落盘回执。
  RPC 表不变仍 25（纯动态工具文本面）。
- **测试器 +2 断言**（kanyu_crs reproject+output 计数回执 + 落盘文件
  一致、hostSrc 确认文本契约键）；总计 **90/90 全绿**（static 70/70）。

## [0.26.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_data` query 落盘分支**：动态工具
  `action=query` 带 `output` 且成功时，返回「查询完成：命中 N 要素 →
  已写出: path（可继续作为 path 检视/渲染/编辑）」确认文本——此前该分支
  stdout 为空、模型侧拿到空字符串无任何回执。命中数解析自 stderr
  「已写出 N 个要素 → path」契约（与客户端 runQuery 同源）。工具描述
  同步注明落盘语义与产出接力用法。RPC 表不变仍 25（纯动态工具文本面）。
- **测试器 +2 断言**（kanyu_data query+output 确认文本 + 落盘文件要素
  一致、hostSrc 确认文本契约键）；总计 **88/88 全绿**（static 69/69）。

## [0.25.0] — 2026-08-18

- **处理域深化：ToolboxPanel 产图层工具设为当前图层联动**（落盘联动范式
  第三处）：双端 tbRun 改造——产图层工具（`def.report === false` 且无
  OutFile 参数）输出缺省落 `dsh/output/kanyu-tool-<id>-<ts>.geojson`
  （`split_by_field` 为 toolrun.rs 唯一 NewLayers 多产出，output 视作目录
  不加扩展名）→ 成功解析 stderr「已写出 N 个要素 → path」清单 → 首个产出
  设为当前图层并广播（各页签联动）；报告类工具保持原文直出；export 工具
  OutFile 参数自带路径不动。输出框占位提示同步更新。
- **host.js `toolboxRun` 健壮性修复**：落盘前先 `ensureOutDir()`——
  `kanyu tool run --output` 单产出走 `write_geojson_result` 同为
  `std::fs::write` 不建父目录（与 dataQuery/crsReproject 同款防护，
  至此三条 --output 路径全部保底）。RPC 表不变仍 25。
- **测试器 +4 断言**（toolbox.run stderr 写出清单契约、ensureOutDir
  静态契约、双端 tbRun 联动契约键）；总计 **86/86 全绿**（static 68/68）。
  3080 桥实测：buffer 带 output 落盘实例工作区，stderr 计数 4 要素正确。

## [0.24.0] — 2026-08-18

- **坐标框架域深化：投影变换联动闭环**：双客户端坐标页签「投影变换」按钮
  改专属 `runReproject()`——`crs.reproject` 带 output 落盘
  `dsh/output/kanyu-reproject-<ts>.geojson` → stderr「已写出 N 个要素」
  解析 → 展示「源 → 目标：变换 N 要素」→ 落盘成功设 `store.path` 为结果
  文件并广播（各页签联动跟随当前图层；对齐数据页签 runQuery 语义）。
  投影结果从「截断 JSON 文本」升级为「可继续检视/渲染/编辑的图层」。
- **host.js `crsReproject` 健壮性修复**：落盘前先 `ensureOutDir()`——
  `kanyu data reproject --output` 底层 `write_geojson_result` 同为
  `std::fs::write` 不建父目录（与上轮 dataQuery 同款防护）。RPC 表不变仍 25。
- **测试器 +4 断言**（reproject 落盘 + stderr 计数契约、ensureOutDir
  静态契约、双端 runReproject 契约键）；总计 **82/82 全绿**
  （static 65/65）。3080 桥实测：4326→4547 带 output 落盘实例工作区，
  stderr 计数 4 要素正确。

## [0.23.0] — 2026-08-18

- **数据域深化：查询联动闭环**：双客户端数据页签「查询」按钮改专属
  `runQuery()`——`data.query` 带 output 落盘 `dsh/output/kanyu-query-<ts>.geojson`
  → stderr「已写出 N 个要素」解析命中数 + `data.preview` 取总数 M → 展示
  「命中 N/M 要素」→ 落盘成功设 `store.path` 为结果文件并广播（目录/地图/
  编辑等页签联动跟随当前图层）。查询结果从「一次性 JSON 文本」升级为
  「可继续检视/渲染/编辑的图层」。
- **host.js `dataQuery` 健壮性修复**：落盘前先 `ensureOutDir()`——
  `kanyu data query --output` 底层 `std::fs::write` 不建父目录，`dsh/output`
  缺省时写失败（此前 output 参数存在但该路径未保底）。RPC 表不变仍 25。
- **测试器 +4 断言**（host 落盘 + stderr 计数契约与 stdout 路径同计数、
  dataQuery ensureOutDir 静态契约、双端 runQuery 契约键）；总计 **78/78
  全绿**（static 62/62）。3080 桥实测：带 output 查询落盘实例工作区
  `dsh/output/smoke-query.geojson`，stderr 计数 3 要素正确。

## [0.22.0] — 2026-08-18

- **3D 域深化：挤出体分类着色（壳层 symbology 唯一值语义的 3D 轻量投影）**：
  `scene3d.data` RPC 加 `colorField` 参数——逐要素带 `cat` 类别值、响应带
  `categories` 去重清单（上限 12 类，超出归「其他」）；无 colorField 时
  `categories: null`（契约不漂移）。`kanyu_scene3d` 工具加 colorField 可选
  参数，摘要带类别清单。
- **双客户端 3D 页签**：`catColor` 字符串哈希 → HSL 稳定取色（同类别恒
  同色），棱柱顶面/侧面明暗档改按类别色着色（贴地线/点保持基色）；Tab3d
  加「着色字段」输入 + 画布下方类别图例（色块与棱柱同函数同色）；状态行
  带类别数。RPC 表不变仍 25（scene3d.data 参数扩展）。
- **测试器 +2 断言**（usage 两类 + 逐要素 cat / 无 colorField 契约）；s3dKeys
  契约键补 catColor/colorField/categories 双端锁；总计 **74/74 全绿**
  （static 59/59）。3080 桥实测 categories=['office','residential'] 正确。

## [0.21.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_geoprocess` 加注册表分支**：动态工具执行双轨
  分流——精选 13 白名单走 GP_TOOLS（`kanyu analysis` 出口）不变；白名单外
  id 走 `toolbox.run` 注册表分支（`kanyu tool run` 出口，core::tooldef 37
  工具全库），`input` 便捷映射 `layer`、注册表参数经 `params` 键值透传
  （第二输入键名各异——overlay/join/values/points/layer2，不猜，引导模型
  按参数表具名传）。工具描述更新为双轨发现面。模型侧处理域至此覆盖全库。
- **测试器 +2 断言**（mean_coordinates 注册表分支输出 1 要素 + 未知 id
  中文报错不静默）；总计 **72/72 全绿**（static 57/57）。RPC 表不变仍 25。
- 3080 桥实测：mean_coordinates stdout 直出均值点（工作区外写拒绝为既有
  workspace-write 边界，产图层工具在生产桥应省 output 走 stdout 或写实例
  工作区内路径）。

## [0.20.0] — 2026-08-18

- **双客户端处理页签工具箱全库表单**：新增 `ToolboxPanel`（动态/静态双端同步）
  ——`toolbox.list` 拉取 core::tooldef 注册表 37 工具，按五分类（矢量分析/
  矢量几何/矢量选择/数据管理/统计度量）optgroup 分组下拉；选定工具后按参数表
  ParamKind 动态生成表单（Enum→中文标签下拉、Boolean→复选、Layer 预填当前
  图层路径、LinearUnit/MultiLayers/Extent 带格式占位提示、其余文本域），
  报告类工具直出 stdout、产图层类提供输出路径（多产出视作目录）；运行走
  `toolbox.run` RPC。GP_TOOLS 13 精选快捷面保留在上方并存。
- **测试器 +2 断言**（双端 ToolboxPanel/toolbox.list/toolbox.run/TB_CAT_CN
  契约）；静态模式 toolbox.list 断言改双态（CI 无 CLI 降级指引 / 本机有
  CLI 真实注册表）；总计 **70/70 全绿**（static 57/57）。RPC 表不变仍 25。

## [0.19.0] — 2026-08-18

- **处理域深化：工具箱注册表全库接内核 tooldef（37 工具）**：主仓 `kanyu-cli`
  新增顶层子命令 `kanyu tool list`（--json 输出含参数表全量定义）/
  `kanyu tool run <id> --param k=v...`（直连 core::tooldef 注册表 +
  toolrun::run_tool 统一执行入口——Layer 参数值按文件路径预加载、多图层
  逗号/换行分隔、枚举内核值或中文标签均可、报告类 --json 包装、多产出
  --output 视作目录；docs/CLI.md 新增 §4C），与壳层工具箱面板/MCP 工具面
  同一单一事实来源。组件侧新增 `toolbox.list`/`toolbox.run` RPC
  （RPC 表 23→**25**）；CLI 过旧无 tool 子命令时中文报错指引升级（无本地
  兜底——注册表定义在内核，JS 侧不重复造表）。GP_TOOLS 13 白名单精选
  快捷面保留不动。
- **测试器 +4 断言**（全量：37 工具清单含 buffer/zonal_stats + 注册表路径
  buffer 输出 4 要素 + stats 报告 JSON 包装；静态：无 CLI 降级报错形状），
  RPC 计数断言 23→25；总计 **68/68 全绿**（static 55/55）。
- 双客户端处理页签的工具箱全库表单下轮跟进（本轮 RPC 面先行）。

## [0.18.0] — 2026-08-18

- **坐标框架域深化：CRS 全库检索接内核 EPSG 库**：主仓 `kanyu-cli` 新增顶层
  子命令 `kanyu crs search [query] [--limit N]` / `kanyu crs info <code>`
  （直连 `core::crs::search_crs`/`crs_info` 单一事实来源，crs-definitions
  内置 EPSG 库 7507 条；docs/CLI.md 新增 §4B），本机 CLI 已 cargo install
  更新。组件侧新增 `crs.search` RPC（RPC 表 22→**23**）——经 CLI 出口检索
  全库，kind 英文枚举映射中文标签；CLI 过旧无 crs 子命令时回退 CRS_PRESETS
  本地过滤并标注 `degraded`（双模式可测）。`kanyu_crs` 工具加 `search` 分支。
- **双客户端坐标页签加 EPSG 检索框**：代码/名称模糊检索（Enter 或按钮触发），
  结果行显示代码/名称/类型/单位、标注来源（全库或兜底），点击设为目标 CRS。
- **测试器 +2 断言**（4547 检索命中 + 空查询常用精选），RPC 计数断言 22→23；
  总计 **65/65 全绿**（static 54/54）。`cargo test --workspace` 全绿。

## [0.17.0] — 2026-08-18

- **目录域补全：地图框/布局框分类的组件语境对应物**：`catalog.list` 新增
  `mapItems`（会话工作区渲染产物 output/*.png——render.map 落盘即地图框
  对应物）与 `layoutItems`（解析扫描到的 .kyu 工程 v2 `layouts` 节，壳层
  project.rs 单一事实来源），五分类计数全部真实回填（此前地图框/布局框
  恒 0 空态）；空态文案同步更新。服务链接占位文案更正（WFS/WMS 已于
  0.12–0.14 实现，不再「规划中」）。
- **双客户端目录页签改 `catRows` 分行描述符**：数据库/本机数据可点选设为
  当前图层，地图框/布局框为只读产物行（PNG/KYU 徽标）；原 itemRow 收敛
  删除。`dsh/examples/demo.kyu` 夹具加 `layouts` 节（示例布局A4横）。
- **测试器 +1 断言**（layoutItems 解析夹具入列 + 两分类计数与清单一致），
  五分类契约断言并入 mapItems/layoutItems 键；总计 **63/63 全绿**
  （static 52/52）。3080 桥实测：布局框计数 1（示例布局A4横 ← demo.kyu）。

## [0.16.0] — 2026-08-18

- **编辑域深化：顶点编辑画布（壳层 edit.rs 顶点会话语义）**：新增
  `edit.geometry` RPC（RPC 表 21→**22**）——顶点编辑专用数据源，原样几何
  **不抽稀**（scene3d.data 有抽稀预算，顶点下标须与文件一致故不可用），
  上限 200 要素 + bbox。双客户端编辑页签新增顶点编辑画布：`enumVertices`
  按几何类型枚举顶点（ringPath 对齐 host vertex-move 的 GeomPath 三级
  定位：LineString []、MultiLineString/Polygon [环/部件]、MultiPolygon
  [部件, 环]），`drawEdit2d` 纯白画布（壳层 mapview 契约）轮廓 + 顶点
  方块；点选 8px 命中 → 拖拽高亮预览 → 松开写 `edit.apply vertex-move`
  → 重载几何；非原地模式输出路径自动设为当前图层。
- **测试器 +3 断言**（edit.geometry 原样几何契约 + 双端顶点画布契约），
  RPC 计数断言 21→22；总计 **62/62 全绿**（static 51/51）。3080 桥实测：
  edit.geometry 返回 4/4 要素原样几何 + bbox 正确。

## [0.15.0] — 2026-08-18

- **编辑域深化：属性单元格编辑（壳层 attrtable.rs/edit.rs 语义）**：双客户端
  编辑页签新增「加载属性表 → 点选行 → 字段/新值 → 写入单元格」闭环
  （复用 `data.preview` 行矩阵 + `edit.apply attribute-set`；新值 JSON 可
  解析则按类型写入，否则按字符串；写成功后表格收起待重载）。无新增 RPC
  （表仍 21 项）。
- **workspace-write 写拒绝可操作指引（3080 实测排障入档）**：DSH fs 服务
  生产侧为 workspace-write 模式——工作区外**读放行、写拒绝**
  （`file access denied under workspace-write mode`）。新增 `writeHint`
  统一规范化 edit/services 写失败消息（附中文可操作指引：改用工作区内
  输出路径，或先由拉取/CLI 产物在工作区生成副本）。editWriteFc 改返回
  错误串（原布尔丢弃了原因）。
- **测试器 +3 断言**（双端属性编辑区契约 + host writeHint 指引），总计
  **59/59 全绿**（static 48/48）。3080 桥端到端实测：工作区外写回给
  可操作指引；工作区内 attribute-set 闭环（写入 → preview 复查值 →
  undo 栈 +1）。

## [0.14.0] — 2026-08-18

- **WMS GetMap 底图预览（壳层 services.rs v2 语义）**：新增 `services.wms`
  RPC（RPC 表 20→**21**）——`buildGetmapUrl` 移植壳层同名纯函数（WMS 1.3.0
  + CRS=EPSG:4326 + bbox 经/纬序六位小数，宽限服务器通用）；联机路径 10s
  超时拉 PNG → base64 回传 Client 内联预览（content-type 非图像即报图层名
  有误）；`urlOnly` 为离线契约路径（只构造地址不触网）。`kanyu_catalog`
  动态工具加 `kind=wms` 分支。
- **双客户端目录页签 WMS 底图预览**：服务链接分类加「图层名 + 预览底图」
  行（基址与 WFS 发现共用），返回 PNG 内联显示。
- **测试器 +1 断言**（buildGetmapUrl 逐字符契约：1.3.0/EPSG:4326/bbox 六位
  小数/基址补 &），RPC 计数断言 20→21；总计 **56/56 全绿**（static 45/45）。
  3080 桥实测 urlOnly 地址构造逐字符正确。

## [0.13.0] — 2026-08-18

- **WFS GetFeature 拉取落 GeoJSON 图层（壳层 services.rs v1 语义）**：新增
  `services.fetch` RPC（RPC 表 19→**20**）——`buildGetFeatureUrl`/`joinQuery`
  移植壳层同名纯函数（基址去尾 `?`/`&` 补分隔符、typeNames 原样拼接、
  `outputFormat=application/json`）；URL 路径 10s 超时；`data` 参数为离线
  路径（测试不触网）；响应校验 FeatureCollection 根，输出缺省
  `output/wfs_<图层名消毒>.geojson`。`kanyu_catalog` 动态工具加
  `url+layer` 拉取分支。
- **双客户端目录页签图层行「拉取」按钮**：服务链接发现清单每行可直接
  GetFeature 拉取，成功即设为当前图层（store.path 联动）。
- **测试器 +1 断言**（离线拉取落盘：FeatureCollection 校验 + 2 要素写出），
  RPC 计数断言 19→20；总计 **55/55 全绿**（static 44/44）。3080 桥实测：
  离线拉取落 `output/wfs_demo_test.geojson`、计数正确。

## [0.12.0] — 2026-08-18

- **服务链接：WFS GetCapabilities 图层发现（对齐壳层 services.rs）**：新增
  `services.discover` RPC（RPC 表 18→**19**）——`parseCapabilities` 为壳层
  同名纯函数的 JS 移植（`<FeatureType>` 块内 Name/Title 最小提取 +
  实体反转义 + 命名空间前缀剥离，不引 XML 库）；URL 路径 10s 超时
  （AbortController）+ `acceptVersions=2.0.0,1.1.0`；`xml` 参数为离线
  解析路径（测试/调试不触网）。`kanyu_catalog` 动态工具加 `url` 分支
  （WFS 图层清单文本）。
- **双客户端目录页签服务链接分类发现表单**：基址输入 + 「发现图层」按钮，
  结果图层列表（name —— title）；空态提示保持壳层文案语义。
  新增 `dsh/examples/wfs_capabilities.xml` 夹具（命名空间前缀 +
  实体转义 + 缺 Name 坏块三态）。
- **测试器 +3 断言**（services.discover 解析契约 + 双客户端表单契约），
  RPC 计数断言 18→19；总计 **54/54 全绿**（static 43/43）。3080 桥实测：
  夹具解析 2 图层、命名空间剥离与实体反转义正确、坏块跳过。

## [0.11.0] — 2026-08-18

- **目录域深化：五分类对齐壳层 `catalog.rs`**：`catalog.list` RPC 响应扩展
  `categories` 固定五分类元组（地图框/布局框/数据库/服务链接/本机数据，
  ArcGIS Pro 工程目录范式）+ `dataItems`/`dbItems` 分离（.kdb/.kyu 入数据库类，
  其余 GIS 数据文件入本机数据类）；地图框/布局框/服务链接组件语境暂无对应物，
  按壳层契约给空态提示。`kanyu_catalog` 动态工具输出加五分类计数行。
- **双客户端目录页签分类区渲染**：分类头（展开/收起箭头 + 计数徽标，
  `kyg-cat-head` 样式），壳层契约默认仅「本机数据」展开；空分类显示
  空态提示。新增 `dsh/examples/demo.kyu` 夹具（KYU v1 最小清单）。
- **测试器 +3 断言**（五分类名称序/kyu 归类契约 + 双客户端分类区 UI 契约），
  总计 **51/51 全绿**（static 40/40）；3080 桥实测五分类计数正确、
  demo.kyu 入数据库类。

## [0.10.0] — 2026-08-18

- **数据域深化：属性表预览**：新增 `data.preview` RPC（纯 fs 读面，不经
  CLI——读 GeoJSON，字段并集上限 40、行上限 min(limit,200)、单元格 ≤80
  字符，返回 fields/rows/shown/total），RPC 表 17→**18**；`kanyu_data`
  动态工具新增 `preview` action（字段清单 + 前行文本，截 5000 字符）。
- **双客户端数据页签属性表**：`plugin/client.js` 与 `pkg/client.js`
  同步新增「属性表」按钮 + `kyg-table-wrap` 滚动容器原生 table 渲染
  （sticky 表头）。
- **测试器 +2 断言**（`data.preview` 行数/字段契约 + `kanyu_data(preview)`
  动态工具文本），RPC 计数断言改 18；总计 **48/48 全绿**（static 37/37）。
  3080 桥端到端实测：`data.preview` 返回 buildings.geojson 5 字段 4 行、
  limit=3 截断正确。

## [0.9.0] — 2026-08-18

- **地图面板接入属性驱动符号化（StyleRule 对齐 kanyu-render）**：`render.map`
  RPC 与 `kanyu_render` 动态工具新增 `style` 参数（graduated 分级 /
  categorical 唯一值，语义即 `kanyu render map --style`）；双客户端地图页签
  新增符号化控件（方法选择 + 字段 + 规则文本，`buildStyle` 构建 StyleRule，
  graduated 文本「阈值:#RRGGBB,…」、categorical「类别:#RRGGBB,…，* 为默认色」）。
- **pwsh 引号教训（实测排障入档）**：JSON 内嵌双引号不能经命令行传递——
  `\"` 转义在 bash 成立、在 pwsh（DSH 生产 shell 后端）被拆成多参数
  （3080 桥实测报 `unexpected argument`）。样式改走 `--style-file`：
  Host 半先落临时 JSON 再传路径（路径无引号，双 shell 兼容）。
- **sync-local.sh 加固**：remove 后强制清 profile 残留目录（pnpm 部分失败时
  旧副本滞留致 add 命中缓存跳过拷贝）+ add 后内容级新鲜度校验（不一致即
  exit 1）。测试器新增 4 断言（graduated 出图 / 非升序内核拒止 / 双客户端
  符号化控件契约），总计 **46/46 全绿**（static 35/35）；3080 桥端到端实测
  graduated PNG 出图并目检（分档着色正确）。

## [0.8.0] — 2026-08-18

- **GIS 模式接入 kanyu-mcp（堪舆内核 AI 意图面整合）**：preset 组合新增
  `mcp-kanyu` 行（`@deepseek-ai/dsh-mcp-client`，stdio 长驻子进程
  `kanyu mcp serve`），kanyu-mcp 的 17 stable 工具以 `mcp__kanyu__*` 限定名
  进会话模型工具面，与组件 8 个 `kanyu_*` 动态工具互补（动态工具 = 一次性
  CLI 调用；MCP 桥 = 长驻 stdio 会话）。`failOnStartupError` 默认 false，
  kanyu.exe 不在 PATH 时会话仍可加载。
- web profile 实证：roster（agentPreset.list）kanyu-gis 无 broken；
  `session.create(agentPreset=kanyu-gis)` 成功；实例日志见 9 处
  「kanyu-mcp: MCP server 监听 stdio」启动行、零错误（HTTP API 无会话
  工具清单端点，模型侧 `mcp__kanyu__*` 入目以首局对话实测终验）。
- SKILL.md 组件形态章节登记 MCP 桥工具面；验证面计数同步 42/33 断言。

## [0.7.1] — 2026-08-18

- **修复「组件界面未正确加载」（用户报告）**：根因为运行中的 `dsh web`（3080）
  实例过期——组合树与客户端 boot 图在启动时一次成型、不热加载，插件重装后
  旧实例 boot 图无 kanyu 条目、bundle 404、/kanyu-gis/health 落 SPA 兜底页。
  重启实例即恢复（health 200：8 工具/17 RPC，boot 图含 `immediately: true`
  条目，bundle 200 含最新 3D 管线）。
- **`sync-local.sh` 一键本地同步脚本**（用户指令「每次更新完成，本地要同步更新」
  落地）：preset 回灌 + 旁路校验 + web profile 静态插件 remove/add 重装
  （pnpm file: 副本刷新）一步完成，脚本实证通过；README 安装节与
  docs/GIS_MODE.md §5 维护契约同步改写。

## [0.7.0] — 2026-08-18

- **3D 能力对齐内核 scene3d.rs 软件管线**：双客户端（plugin/client.js 动态形态 +
  pkg/client.js 静态形态）`drawScene3d` 重写——废弃固定 45° 等距投影，移植内核
  投影链（数据→画布线性映射 view.rs 同式 → 绕中心 yaw 旋转 → sin(pitch) 俯仰压缩
  → 高度抬升）、`face_visible` 背面剔除、质心纵深排序（远先绘）、侧面两档明暗
  （0.55/0.75）、高度归一化画布高 × 0.25（MAX_HEIGHT_FRAC）、纯白底约束、
  线/点贴地投影；Tab3d 新增视角态（yaw=-0.5 / pitch=35° 默认）+ 左键拖拽旋转
  （yaw += dx*0.01，pitch 钳制 30°–45°），角标实时显示方位角/俯仰。
- 测试器新增 2 项 3D 管线契约断言（双客户端各一：yaw/pitch/faceVisible/0.25/
  onMouseDown 全命中），总计 **42/42 断言全绿**（static 33/33）；web profile 重装
  冒烟：health 200（8 工具/17 RPC）+ bundle 200 含新管线代码。

## [0.6.0] — 2026-08-18

- **组件仓 CI 落地**：`tools/test_plugin.mjs` 新增 `--static` 零依赖模式——跳过一切
  调用 kanyu CLI 的断言（ping/introspect/data.xxx/render.map/crs.reproject/
  geoprocess.run/动态工具抽查），RPC 桥实测改用纯本地方法 `crs.presets`；
  布局自检——主仓 `dsh/` 子目录与独立组件仓根布局自动识别（REPO_ROOT/DSH_DIR）。
  新增 `.github/workflows/component-test.yml`（同步进组件仓仓根 .github/workflows/，
  push/PR 触发，ubuntu + node 20 跑静态契约回归）。本机实证：主仓 static 31/31、
  全量 40/40 回归不破、模拟组件仓根布局 static 31/31。
- 边界入档：verify_preset.mjs 依赖本机 DSH npx 缓存检出绝对路径，不可进 CI。

## [0.4.2] — 2026-08-18

- `presets/kanyu-gis/skills/kanyu-gis/SKILL.md` 新增「DSH 组件形态」章节，对齐组件
  现状：双半与双安装形态（plugin/ 动态 cordis 包 + pkg/ 常驻静态 web profile）、
  8 个动态工具清单、17 项 RPC 全清单、工作台 preset 门控联动、编辑逆操作双栈、
  组件验证面（test_plugin.mjs 40 断言 / verify_preset.mjs / sync-preset.sh）。
  同轮记录：本地三个模型端点（11434/1031614/15724）实测全部离线（curl 000），
  kanyu-gis 会话首局对话实测顺延。

## [0.5.0] — 2026-08-18

- **编辑能力深化：对齐 kanyu-edit 内核范式（命令逆操作双栈）**——`host.js` 编辑段
  重构为单一变更入口 `applyMutation`（正/逆向共用），每个变更算子应用时同步计算
  结构化逆操作（feature-delete↔feature-insert、feature-add→feature-delete、
  attribute-set/delete↔attribute-restore、vertex-move 自逆），按源文件键控入
  undo 栈（容量 64 淘汰最旧、新变更清空 redo，与 `History.push` 同语义）；
  新增 `edit.undo` / `edit.redo` / `edit.history` 三个 RPC（RPC 表 14 → 17）。
- 双客户端（`plugin/client.js` 动态形态 + `pkg/client.js` 静态形态）编辑页签
  同步加「撤销/重做」按钮与历史语义提示；RPC 方法名显式不拼接（两半漂移锁
  静态可查——本轮实测锁住一次 `'edit.' + dir` 拼接漂移）。
- 测试器新增 5 项编辑历史断言（apply 入栈 → undo 逆操作回写字段移除 →
  redo 正向重放字段恢复 → 新变更清空 redo → edit.history 栈深与栈顶标签），
  总计 **40/40 断言全绿**；web profile 重装冒烟：health 报 8 工具 + 17 RPC。

## [0.4.1] — 2026-08-18

- `tools/test_plugin.mjs` 新增 **pkg 静态双面包契约断言组**（23 → 35 断言全绿）：
  package.json exports 三键（含 `./package.json` 防 exports 封装拦截的回归锁）+
  dsh.client 声明；client.js 语法/工厂 id==包名/inject 三服务/两处 slot 注册/
  preset 门控字面量/无动态沙箱符号调用；**两半漂移锁**——客户端 `hostCall('<m>')`
  方法名集合 ⊆ host.js RPC 表；index.js inject 含 webServer + apply 实测
  （mock tools/webServer 注册 8 工具与 /kanyu-gis 前缀路由）+ **RPC 桥端到端实测**
  （模拟 node:http req/res POST /kanyu-gis/call ping → 200 + ok）。

## [0.4.0] — 2026-08-18

- **GIS 工作台面板随 preset 联动加载（用户指令「切换到 GIS 模式时面板一并联动加载」）**：
  `pkg/` 从纯 Host 适配器升级为 dsh.client 双面包——新增 `pkg/client.js` 静态客户端
  bundle（手写工厂格式，`window.__ModuleLoader__.load`，id=包名），常驻进 web 前端
  boot 图（`immediately: true`）；「🧭 堪舆GIS」头部按钮 + 七页签工作台浮层经
  会话快照 `agentPreset` 字段门控，**仅 kanyu-gis 会话显示、切走即隐藏**。
- Host 半新增 RPC 桥：`inject` 加 `webServer`，注册前缀路由 `POST /kanyu-gis/call`
  （派发到 host.js 同一张 14 项 RPC 表）+ `GET /kanyu-gis/health`——静态形态无
  host.call 通道（动态包专利），同源 HTTP 自定义路由是官方等价物。
- 实测排障入档：声明 `dsh.client` 的 package.json 若带 `exports` 却不导出
  `./package.json`，`require.resolve('<pkg>/package.json')` 受 exports 封装拦截，
  客户端扫描静默跳过（boot 图无条目）——补 `"./package.json": "./package.json"` 后
  实证修复（boot 图条目 + bundle 200 + ping/catalog.list 中文路径端到端全通）。
- 验证链（dsh web 实例实测）：启动日志无 ClientPackageCompositionError；
  `__DSH_BOOT__` 含 kanyu-gis-dsh-plugin 条目；`/plugins/.../client.js` 200；
  `/kanyu-gis/call` ping（kanyu 0.22.0 + 七能力）与 catalog.list（命中示例数据）。

## [0.3.1] — 2026-08-18

- **GIS 模式 preset 活体挂载验证通过（web profile）**：`agentPreset.list` API 实测
  初版组合判 broken（"row 1 names no plugin"），按 local-hybrid 方言重写
  `agent.cordis.yml` 为合法代理平面组合（persona + 工具面 + plan-mode/compaction/
  delegation 三 isolate 组 + skill-filesystem 技能注入；删除误写的 model 路由行、
  file-operations/process 服务行、memory/system-prompt 特殊行与不存在的
  dsh-tool-read/write/edit/glob/grep/read-image 包名）。
- 修复 `skills/kanyu-gis/SKILL.md` frontmatter 双引号标量内 `\B` 非法 YAML 转义
  （技能文件被宿主静默丢弃、会话技能目录为空）；修为正斜杠路径后
  `session.create(agentPreset=kanyu-gis)` + `skill.list` 实证技能入目。
- `verify_preset.mjs` 补强：补「每行必须携带插件 name」判定（对齐运行时
  invariant.js `entryListProblem`），仓库侧旁路校验可提前拦截 roster 级 broken。
- preset.yml 描述笔误修正（工程目录目录树 → 工程目录树）。

## [0.3.0] — 2026-08-18

- 新增 `pkg/` 常驻静态插件适配器：`new Function` 求值 `plugin/host.js` 单一事实源，
  harness façade 折算（`registerTool` → `ctx.tools.register`，defineTool 参数方言 →
  标准 JSON Schema）；命名导出 `name`/`inject`/`apply`（无 default，DSH 约定）。
- **本机 DSH web profile 常驻安装落地**：`dsh plugin --profile web add file:.../dsh/pkg`
  + `cordis.patch.yml` insert 行（`config.hostSource` 显式路径）；启动实测激活，
  8 个 `kanyu_*` 工具注册进真实工具注册表。
- 实测教训入档：普通插件必须 `inject` 声明服务；pnpm file: 为副本需重装刷新；
  `import.meta.url` 副本路径须以 config.hostSource 兜底。

## [0.2.0] — 2026-08-18

- 新增 `tools/test_plugin.mjs` 组件本地测试器：node:vm 等价沙箱加载 Host 半
  （shell→真实子进程 kanyu CLI、fs→node:fs、harness→RPC/动态工具表），
  23 项断言全绿：14 个 RPC 注册、8 个 `kanyu_*` 动态工具注册、七大能力逐项实证
  （渲染出图 base64 回传 / 目录扫描 / info/query / 投影变换 / buffer 出要素 /
  编辑写回 / 3D 场景制备）、Client 半语法与 slot/页签结构静态校验。
- DSH 活体冒烟：`dsh --profile headless` 会话代理真实执行
  `kanyu agents validate --code-repo` 并正确引用输出，DSH × kanyu CLI 链路验证通过。
- 实测边界入档：headless profile 无 agent-presets roster / cordis 动态包 runner
  （组件活体挂载仅在 web profile）；cmd.exe 中文绝对路径代码页截断
  （宿主 shell 为 pwsh，无此问题；测试器走 Git Bash）。
- `.gitignore` 增加 `/dsh/output/`（组件运行时临时产物）。

## [0.1.0] — 2026-08-18

- 组件源首次完整入库：`plugin/host.js` + `plugin/client.js`（七大能力域 RPC + 8 个
  `kanyu_*` 动态工具）、`presets/kanyu-gis/`（GIS 模式 preset + 领域技能）、
  `examples/`、`tools/verify_preset.mjs`、`sync-preset.sh`。
- `host.js` 的 kanyu CLI 命令面与 v0.22.0 实测逐旗标对拍一致
  （`data info/query/validate/reproject`、`render map`、`analysis` 13 工具参数名）。
- GitHub 开源同步：主仓库 `DaoMingyuan/Kanyu` 入库推送 + 独立组件仓
  `DaoMingyuan/kanyu-gis` 建仓首发（详见 AI_SYNC.md 会签簿 2026-08-18 回记）。
