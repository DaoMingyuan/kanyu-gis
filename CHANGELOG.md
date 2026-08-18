# dsh/ 组件变更记录

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
