# dsh/ 组件变更记录

## [0.88.0] — 2026-08-19

- **地图画布量测（第九十三轮 测距/测面，ArcGIS 测量语义）**：量测模式下拉
  （关闭/距离/面积），激活后画布单击攒点（`onMapClick` 分派，不触发
  identify），`kyg-measure` SVG 覆盖层（viewBox 0 0 1 1 + 非缩放描边，
  随画布缩放/平移自动跟随）画折线/多边形；EPSG:4326 用 haversine 距离 +
  等距圆柱投影 shoelace 面积，其余坐标系平面欧氏并标注「（平面单位）」；
  双击冻结结果（`onMapDblClick`：量测中结束攒点，否则复位缩放），清除钮
  重来。攒点 setState 函数式更新（修同步连击 stale 闭包丢点）。测试器
  248/248（static 191/191），agent-browser 3080 实测两点测距 1.02 km
  （=0.012° 经度 haversine 理论值）、四点测面 1.36 km²。

## [0.87.0] — 2026-08-19

- **状态栏鼠标坐标实时跟踪（第九十二轮 GIS 标配）**：地图画布 mousemove
  → 像素分数反算地图坐标（与 identify 同公式，extent y 顶=maxy 翻转）
  → `store.mapCursor` 节流发布（≥60ms，避免逐帧重渲）→ 状态栏
  「坐标: x, y」5 位小数实时显示；mouseleave/移出图区即清空。
  测试器 246/246（static 189/189），agent-browser 3080 实测画布中心
  mousemove 显示 116.39999,39.91001（=范围中心）、mouseout 清空。

## [0.86.0] — 2026-08-19

- **地图画布要素点选查询（第九十一轮 identify 语义）**：host 新增
  `data.identify` RPC——纯 fs 读 GeoJSON 空间点选（面=射线法点在面内
  含洞排除、线=点到线段距离、点=最近距；容差 `tol` 按地图单位，多要素
  面内优先/距离最近；不经 CLI，--static 与无 CLI 环境同覆盖）。双端
  Client：渲染成功发布 `store.mapExtent`，画布单击 → img 像素分数
  （getBoundingClientRect 已含缩放/平移变换）→ 范围反算地图坐标
  （y 顶=maxy 翻转）→ 属性浮层（kyg-identify 卡片）+ `store.selFeature`
  联动状态栏「选中要素 #N」；拖拽超 4px 抑制 click 误触发；舞台 div
  补挂 stageRef（八十二轮量宽渲染落地）。测试器 244/244（static
  187/187），agent-browser 3080 实测单击命中示例大厦A（要素 #0 浮层
  三属性 + 状态栏联动）。

## [0.85.0] — 2026-08-19

- **工程下拉接目录自定义扫描目录（第八十九轮）**：目录页签 scan 成功即发
  布 `store.scanDir`，顶栏工程下拉（.kyu 清单）随 scanDir 变更按该目录
  重扫——自定义目录与工程选择联动，不再只看会话工作区根。测试器
  240/240（static 183/183），agent-browser 实测扫 examples/（无 .kyu）
  下拉清空为「（无工程）」、扫回 dsh/examples 恢复 demo.kyu。

## [0.84.0] — 2026-08-19

- **滚轮缩放指针为锚（第八十八轮）**：缩放保持光标下内容点不动——pan
  按倍率差补偿（pan·(z'/z) + 指针相对视口中心·(1−z'/z)，内容铺满
  视口时精确），GIS 软件标准缩放手感；z≤1 仍归零复位。测试器
  238/238（static 181/181），agent-browser 实测偏心位置滚轮三级
  ×1.73 伴随 translate(127px,64px) 补偿、比例尺 1:4,639、双击复位
  回 1:8,025。

## [0.83.0] — 2026-08-19

- **地图画布缩放/平移 + 状态栏比例尺重算（第八十七轮）**：地图页签画布
  支持滚轮缩放（1.2× 步进，0.5–16×，wheel 非 passive 监听绕过 React
  根代理被动监听）、拖拽平移（zoom>1 时）、双击复位；倍率经
  `store.mapZoom` 发布，状态栏比例尺 = 渲染比例尺 ÷ 倍率实时重算并
  显示「缩放: ×N」档；重渲染自动复位。测试器 236/236（static
  179/179），agent-browser 实测滚轮两级 ×1.44 → 1:5,573、双击复位回
  1:8,025。

## [0.82.0] — 2026-08-19

- **GIS 界面重排 + 堪舆手绘风图标（第八十六轮）**：工作台 ribbon 按 GIS
  操作语义重排——`KYG_GRPS` 五分组（数据管理/地图视图/分析处理/编辑/
  系统）组框 + 组标签（ArcGIS Pro 功能区同语义），页签改纵向「图标 +
  文字」；新增 `KYG_ICONS` 手绘风 SVG 路径表 + `kanyuIcon()` 助手
  （16×16 线稿，stroke=currentColor 随页签态变色，对齐壳层 ui_kit
  手绘图标语义），八枚页签图标（目录/数据/图钉/3D/十字丝/齿轮/铅笔/
  信息）+ 罗盘替顶栏/头部按钮/重开钮三处 emoji 🧭。会话功能原样保留
  （返回会话/重开钮不动）。测试器 234/234（static 177/177），
  agent-browser 复验五分组渲染 + 地图页签激活通过。

## [0.81.0] — 2026-08-19

- **底图 WMS 入画布背景（第八十五轮）**：地图页签新增「底图 WMS」行——
  勾选后 render.map 透明出图（内核 kanyu-render 新增透明背景支持：
  `background: "none"/"transparent"` 不铺主题画布色，SVG 省背景 rect、
  PNG 角像素 alpha=0，CLI `render map --background` 旗标直通），
  `loadBasemap` 经 data.info 取图层范围 → services.wms GetMap 同尺寸
  底图垫透明渲染图下层；导出地图图片在有底图时 canvas 合成双层。
  默认底图 ows.terrestris.de OSM-WMS。
- **WMS 严格 1.3.0 轴序修复（axisSwap）**：terrestris 等严格服务器按
  EPSG:4326 规范轴序（纬度/经度序）解读 bbox，壳层契约的经度/纬度序
  在其上出空白图（壳层已声明的已知边界）。services.wms 新增 `axisSwap`
  参数（缺省 false 保持壳层宽限契约不变；true 按纬度/经度序发 bbox），
  工作台底图加载默认置 true。agent-browser 实测：修复前 2.3KB 空白图 →
  修复后 500KB 真实 OSM 街道底图 + 透明要素叠加出图。
- 测试器 **229→232** / static **172→175**（底图契约键 + axisSwap 轴序
  断言锁双端）；内核 kanyu-render 25 测试过（含透明背景 2 新例），
  cargo test --workspace 全绿。

## [0.80.0] — 2026-08-19

- **顶栏工程选择接 .kyu（第八十四轮）**：工作台顶栏新增工程下拉——
  `catalog.list` 扫工作区 .kyu（数据库类），选中即 `style.list` 载入工程
  图层清单并发布 `store.kyuProject`；图层坞（Dock）渲染「工程: <名>」
  图层组，点击图层行 = 设为当前图层 + 样式/工程路径/图层 id 接力
  （store.path/sym/kyu/layerId，与目录页签 pickKyuLayer 同语义）。
  agent-browser 实测：下拉命中 demo.kyu → Dock 出「工程: 组件目录夹具」
  图层组 → 点击 buildings 图层 → 状态栏当前图层切换。
- 部署注记：dsh web 以仓根为 cwd 启动后 sandboxPolicy.workspaceRoot =
  仓根，catalog.list 默认扫描即可命中仓内 .kyu/.geojson（此前 npx 缓存
  目录作 cwd 时工作区无 GIS 数据）。
- 测试器 **227→229** / static **170→172**（顶栏工程选择契约键锁双端）。

## [0.79.0] — 2026-08-19

- **状态栏接真实数据（第八十三轮）**：工作台底部状态栏由静态占位升级为
  数据驱动——TabMap 渲染成功即经 `data.info` RPC 取图层概要（要素计数/
  范围），`approxScale` 按范围宽 × 图像像素宽（96dpi ≈ 0.28mm/px，经纬度
  按中心纬度换算地面米宽、投影坐标按米直读）推算近似比例尺，坐标系按
  格式推断（GeoJSON 遵循 RFC 7946 = EPSG:4326，其余内核不追踪记未声明），
  发布 `store.mapInfo` 上栏；编辑页签框选顶点集（`store.selVerts`）与
  属性表选中行（`store.selFeature`）实时上栏。agent-browser 实测：
  buildings.geojson 渲染后状态栏显示「要素: 4 · 坐标系: EPSG:4326 ·
  比例尺≈1:8,025」，编辑页签框选后追加「已选顶点: 1」。
- 测试器 **225→227** / static **168→170**（状态栏数据契约键锁双端）。

## [0.78.0] — 2026-08-19

- **地图页签画布化（第八十二轮）**：TabMap 对齐全屏工作台中央区——
  `stageRef` 量中央区实际宽度出图（480–1600 自适应，替换固定 760×520）；
  `firstRef` 入场自动出图（带当前图层进地图页签即渲染，无需手动点
  「渲染」）；渲染预览包入 `kyg-map-stage` 舞台容器；新增「导出地图
  图片」按钮（当前渲染图 dataURL 落盘 PNG，文件名取图层名）。联动重渲
  （图层切换/内容变更自动重渲）语义不变。agent-browser 实测：
  buildings.geojson 舞台大图出图 + 导出按钮在列 + 点击无崩。
- 测试器 **223→225** / static **166→168**（地图画布化五契约键锁双端）。

## [0.77.0] — 2026-08-19

- **GIS 模式全屏工作台（第八十一轮，参考用户提供的「地理工作台」截图）**：
  工作台由 580px 浮层改为全屏接管会话中央列——`useCenterRect` 以
  ResizeObserver 同步 `[class*=centerCol]` 矩形，`position:fixed` 落位于
  shell.overlay 层内（侧栏/详情列保持原生可交互）。新布局：顶栏
  （标题 + kanyu 内核徽标 + 「返回会话」）+ 页签 ribbon + 左侧图层坞
  （catalog.list 数据类快清单，点击设当前图层、清单外产出自动重扫）+
  中央页签区（复用八页签组件）+ 底部状态栏（页签/当前图层/模式）。
  「返回会话」后留 `kyg-reopen` 悬浮重开钮（首页/新会话视图无会话头部
  槽位，不留则无法自行回到工作台）。agent-browser 实测闭环：切入自动
  接管 → 返回会话 → 重开钮召回 → 切出 preset 自动收起。
- 测试器 **221→223**（client 全屏布局契约键）/ static **164→166**
  （pkg 同款契约键，各含 `kyg-reopen`）。

## [0.76.0] — 2026-08-19

- **修「切 GIS 模式界面无变化」（第八十轮，用户实测报告）**：静态半
  `pkg/client.js` 工作台此前只在会话头部按钮点击后展开，而首页/新会话
  视图不渲染会话头部槽位——切 kanyu-gis preset 后页面零变化。现加
  preset 转换边联动：`prevGis` ref 记录上一帧门控值，切入 kanyu-gis
  自动展开工作台、切出自动收起（用户在 GIS 模式下手动关闭不反复弹出）；
  动态半 `plugin/client.js` 补同款 UX（`autoOpened` 激活即展开一次——
  动态包仅在 kanyu-gis 组合下加载，加载本身即切入）。agent-browser 实测：
  标准模式 ↔ kanyu-gis 往返，面板 0 ↔ 22 kyg-* 元素（8 页签）联动。
- 测试器 **219→221**（plugin 半 autoOpened 契约键）/ static **162→164**
  （pkg 半 prevGis/自动展开收起契约键）。

## [0.75.0] — 2026-08-19

- **CRS 检索命中双按钮（第七十九轮）**：双端 TabCrs 检索结果行加「源」/
  「目标」双按钮分设 CRS（替代整行点击只能设目标——源 CRS 此前只能靠
  预设下拉，检索命中无法回填）。
- 测试器 **219** 不变 / static **162** 不变（crsKeys 扩 `setFrom(c.code)`/
  `按钮分设 CRS` 契约键锁双端）。

## [0.74.0] — 2026-08-19

- **几何量算 WASM 技能（第七十八轮，技能沙箱第七算子）**：新 guest
  `measure_geom`——param `_measure: area/length` 逐要素量算写 `_area`/
  `_length`（shoelace 外环减内环 / 欧氏长度，零依赖纯实现；类型不匹配
  透传、全不匹配中文报错；平面坐标语义——经纬度请先投影变换）。
  host.js `kanyu_skill` 清单+param 说明登记；双端 client.js 技能分析区加
  量算行（area/length 下拉 + skillRelay 接力）。
- 测试器 216→**219**（+3：面积带洞 96/线透传 + 长度 10 + 缺参中文报错
  契约）/ static **162** 不变（skillDlgKeys 扩 `applyMeasure`/
  `measure_geom.wasm`/`kanyu-measure-` 契约键）。

## [0.73.0] — 2026-08-19

- **目录面板条目过滤（第七十七轮）**：双端 TabCatalog 加过滤框——五分类
  清单按显示名子串过滤（大小写不敏感），分类头显示命中/总数，过滤中
  强制展开便于命中可见（服务链接类不参与计数改写）。
- 测试器 **216** 不变 / static **162** 不变（catKeys 扩 `setFlt`/
  `过滤条目名（五分类清单）`/`rows.filter` 契约键锁双端）。

## [0.72.0] — 2026-08-19

- **几何简化 WASM 技能（第七十六轮，技能沙箱第六算子）**：新 guest
  `simplify_geom`——param `_tolerance` RDP 容差抽稀线/面顶点（geo Simplify，
  属性继承 + `_tolerance`/`_verts` 前后顶点数；点系透传、退化跳过）。
  host.js `kanyu_skill` 清单+param 说明登记；双端 client.js 技能分析区加
  简化行（容差输入 + skillRelay 接力）。
- 测试器 214→**216**（+2 简化功能实测 11→2 顶点抽稀/点透传 + 缺参中文
  报错契约）/ static **162** 不变（skillDlgKeys 扩 `applySimplify`/
  `simplify_geom.wasm`/`kanyu-simplify-` 契约键）。

## [0.71.0] — 2026-08-19

- **裁剪 clip 算子（第七十五轮）**：`overlay_ops` guest 扩 `_op: clip`——
  ArcGIS Clip 语义特化（基准面整体 ∩ 叠加整体一次性交集，不两两配对、
  叠加属性不入产出、一部一基准要素，多部附 `_part`）；host.js `_op` 清单
  与 `kanyu_skill` 描述登记；双端叠加算子下拉加「裁剪 clip（叠加层作模子）」。
- 测试器 213→**214**（+1 clip 功能实测：5-10 方块面积/坐标域 + 叠加属性
  剔除契约）/ static **162** 不变（skillDlgKeys 扩 `裁剪 clip` 契约键）。

## [0.70.0] — 2026-08-19

- **统计聚合 WASM 技能（第七十四轮）**：新 guest `stat_summary`（第五算子）
  ——param 注入 `_stat` 必填数值字段 + `_field` 可选分组字段，纯属性聚合
  输出 geometry:null 表语义要素（`_count/_skipped/_sum/_min/_max/_avg`）。
  调试中发现并修复宿主侧隐蔽行为：混合类型列（数值+字符串）经 GeoArrow
  类型化列中转被强制为字符串列，guest 兼容解析数值字符串（"10"→10），
  真正非数值跳过计 `_skipped`。host.js `kanyu_skill` 清单+param 说明登记；
  双端 client.js 技能分析区加统计行（数值字段 + 可选分组字段 + skillRelay 接力）。
- 测试器 211→**213**（+2 统计功能实测与缺参契约）/ static **162** 不变
  （skillDlgKeys 扩 `applyStat`/`stat_summary.wasm`/`kanyu-stat-` 契约键）。

## [0.69.0] — 2026-08-19

- **3D 视角书签持久化（第七十三轮）**：双端 TabScene3d 书签改 localStorage
  持久化——按图层路径键控（`kanyu-3d-views:<path>`，跨会话留存、切图层
  自动换组），逐条删除钮（delView）；容量满静默降级（不阻断视图）。
- 测试器 209→**211** / static 160→**162**（+2 双端书签持久化契约键）。

## [0.68.0] — 2026-08-19

- **3D 页签视角书签 + PNG 导出（第七十二轮）**：双端 client.js TabScene3d
  新增视角书签（存当前 yaw/pitch → 具名按钮点击恢复 + 复位视角）与
  PNG 场景导出（画布 `toDataURL` 触发浏览器下载，文件名
  `kanyu-scene3d-<ts>.png`）；TabAbout/README/agent.cordis.yml 工具计数
  「8 个 kanyu_*」漂移修正为 9。
- 测试器 207→**209** / static 158→**160**（+2 双端 3D 书签契约键）。

## [0.67.0] — 2026-08-19

- **融合 WASM 技能（第七十一轮，技能沙箱第四算子）**：新 guest crate
  `dsh/skills/dissolve_field/`（geo 0.33 BooleanOps union 组内折叠——
  按 `_field` 值分组合并面要素，相邻并单部 / 相离附 `_part`，properties
  留分组字段 + `_count`；缺失/空值归缺失组，非面要素中文报错），产出
  `dsh/skills/dissolve_field.wasm`（380KB 入仓）；双端编辑页签技能分析区
  加融合行（分组字段输入 → param `_field` 注入，skillRelay 接力）。
- 测试器 205→**207** / static 158（+2 功能实测：分组合并 _count/_part /
  缺 _field 中文报错，均入 STATIC_ONLY 门控块；契约键扩 3 键不计数）。

## [0.66.0] — 2026-08-19

- **技能画布交互（第七十轮，WASM 技能入编辑页签对话框）**：双端 client.js
  编辑页签新增「技能分析」区——缓冲区（距离输入 → `buffer_zones.wasm`
  param `_distance` 注入）/ 叠加分析（算子下拉 intersect/union/difference +
  第二图层路径 → `overlay_ops.wasm` param `_op` + input2 注入）；公共
  `skillRelay` 产图层接力（落 dsh/output → 设为当前图层 + 版本号广播 +
  几何重载，同 applyCutPoly 语义），失败回执直通技能中文业务错误。
- 测试器 203→**205** / static 156→**158**（+2 双端技能对话框契约键）。

## [0.65.0] — 2026-08-19

- **叠加分析 WASM 技能（第六十九轮，技能沙箱第三算子）**：新 guest crate
  `dsh/skills/overlay_ops/`（技能模板 + geo 0.33 `BooleanOps`——
  `intersect` 基准面 × 叠加面两两配对交集（基准属性继承）/ `union`
  两图层合并整体 / `difference` 基准面减叠加整体，仅面要素、空结果与
  非法算子中文报错），产出 `dsh/skills/overlay_ops.wasm`（394KB 入仓）；
  第二图层经 `_role` 注入约定传递——host.js `skillRun` 增 `input2` 通道
  （读第二文件逐要素标 `_role="overlay"` 注入滚动临时输入，与 cut/param
  并轨），`skill.run` RPC 与 `kanyu_skill` 模型工具参数面同步加 `input2`。
- 测试器 199→**203** / static 156（+4 功能实测：intersect 属性继承 /
  union 合并单要素 / 缺 _op 中文报错 / 缺 input2 中文报错，均入
  STATIC_ONLY 门控块）。

## [0.64.0] — 2026-08-19

- **缓冲区 WASM 技能（第六十八轮，技能沙箱第二算子）**：新 guest crate
  `dsh/skills/buffer_zones/`（split_polygons 模板 + geo 0.33 `Buffer`
  round join——点→近圆面 / 线→条带面 / 面→外扩面，geojson crate 转
  geo-types Geometry，属性继承 + `_distance` 回写、多部附 `_part`），
  产出 `dsh/skills/buffer_zones.wasm`（511KB 入仓）；缓冲距离经 `_role`
  注入约定传递——host.js `skillRun` 增 `param` 通道（参数键值注入
  `_role="param"` 参数要素走滚动临时输入，与 cutLine 切割线注入并轨），
  `skill.run` RPC 与 `kanyu_skill` 模型工具参数面同步加 `param`。
- 测试器 196→**199** / static 156（+3 功能实测：param 注入点线面膨胀
  属性继承 / 缺 param 中文报错 / kanyu_skill 缓冲区回执接力，均入
  STATIC_ONLY 门控块）；host.js 激活日志「8 动态工具」计数修正为 9。

## [0.63.0] — 2026-08-18

- **kanyu_skill 模型工具（第六十七轮，面切割入 AI 工具面）**：动态工具
  8→9 新增 kanyu_skill——skill/input/output/cutLine 四参直挂 skillRun
  （WASM 技能沙箱语义入模型 function-calling 面），回执附「已写出 N 要素
  → path」产出清单 + 接力提示（与 kanyu_geoprocess writesSummary 同契约）。
- 测试器 195→**196** / static 156（+1 kanyu_skill 回执实测）；
  **CI 修复**：skill.run 三断言补 STATIC_ONLY 门控（kanyu skill run 为
  CLI 依赖——六十六轮组件仓 CI e3f052e 红于此，组件仓 static 无 kanyu
  二进制；159→156 为门控后真实静态计数）。

## [0.62.0] — 2026-08-18

- **面切割 WASM 技能通道（第六十六轮，内核 geo BooleanOps 经技能沙箱进组件）**：
  新 guest crate `dsh/skills/split_polygons/`（attr_scaler 模板 + geo 0.33
  Buffer/BooleanOps——切割线微缓冲窄条带与目标面差集劈分，ε=范围×1e-6，
  属性继承 + `_part` 序号，洞环随差集正确归属，未横贯中文报错），构建链
  `cargo build --target wasm32-unknown-unknown --release` + `wasm-tools
  component new` 产出 `dsh/skills/split_polygons.wasm`（379KB 入仓）；
  host.js RPC 31→32 新增 `skill.run`（`kanyu skill run` CLI 出口 + cutLine
  注入 `_role="cut"` 滚动临时输入，原数据不动）；pkg 适配器注入 skillDir
  （与 host.js 同源 resolveHostSource 定位——pnpm file: 安装形态 realpath
  滞留 node_modules 的坑入档注释）；双端 client.js 编辑画布「面切割」模式
  （cutPoly 攒切割线 ≥2 点应用，产出落 dsh/output 接力当前图层 + 版本号
  广播 + 几何重载）。
- 测试器 190→**195** / static 154→**156**（+3 功能实测：劈分属性继承 /
  未横贯报错 / 无切割线报错，+2 双端画布契约键；三功能实测为 CLI 依赖，
  static CI 模式按 STATIC_ONLY 门控跳过——六十七轮补正）；3080 生产桥实测通过
  （两面横贯其一 → 3 要素，_part 0/1 属性继承）。

## [0.61.0] — 2026-08-18

- **顶点框选批量移动（第六十五轮，vertices-move 原子批量算子）**：
  EDIT_OPS 11→12 新增 vertices-move——moves 逐项同 vertex-move 语义
  （ringPath 缺省类型分派、Point 特判、保留 Z/M），先全量校验再统一
  写入（任一项越界整体不变更），单条 undo 逆操作整体回滚；双端
  client.js 编辑画布新增「框选」开关——marquee 拖橡皮筋多选顶点
  （单击清空选择集），选择集 ≥2 时拖拽任一选中顶点按位移增量整组
  写 vertices-move（批量优先于拓扑模式），drawEdit2d 第四参 opts
  叠加橡皮筋虚线框 + 选中顶点金色高亮 + 批量拖拽联动预览。
- 测试器 185→**190** / static 149→**154**（+3 功能实测：批量写入含
  Point 特判 + Z 保留 / undo 整体回滚 / 越界原子性，+2 双端框选契约
  键）；3080 生产桥 vertices-move 实测通过（批量移动 3 顶点，undo:1
  单条整体回滚）。

## [0.60.0] — 2026-08-18

- **feature-add 画布化（第六十四轮，壳层 edit.rs 绘制会话语义进画布）**：
  双端 client.js 编辑画布绘制模式扩三种——「绘制点」单击落点即
  feature-add Point；「绘制线」≥2 点 /「绘制面」≥3 点（自动闭合）攒点
  应用 feature-add LineString/Polygon；覆盖层预闭合预览与挖洞共用
  drawRef/drawOverlay 骨架，afterEdit 联动刷新统一。属性空表待属性
  页签补录（hint 注明）。
- 测试器 183→**185** / static 147→**149**（+2 双端画布化契约键）；
  3080 生产桥 feature-add Polygon 实测通过（5 要素，undo:1）。

## [0.59.0] — 2026-08-18

- **挖洞/打断画布交互（第六十三轮，两算子进编辑画布）**：双端 client.js
  顶点编辑画布新增「绘制挖洞 / 点选打断」模式——drawMode 分派 vDown：
  挖洞逐点攒环（drawRef ref 范式 + drawOverlay 覆盖层 ≥3 点预闭合预览，
  「应用挖洞」写 hole-add，目标=属性表选中行否则 #0）；打断单击落点即
  line-split（投影最近线段吸附顶点）。afterEdit 联动刷新统一（产出接力
  当前路径 + 版本号广播 + 属性表作废 + 几何重载），与 vUp 同语义。
- 测试器 181→**183** / static 145→**147**（+2 双端画布交互契约键）；
  3080 重启 health 通过。

## [0.58.0] — 2026-08-18

- **顶点画布拓扑模式开关（第六十二轮，Map Topology 语义进画布）**：双端
  client.js 顶点编辑区新增「拓扑模式（共享顶点一次同移）」复选框——开启后
  拖拽顶点松开写 `topo-move`（以被拖顶点原坐标精确匹配，共享该坐标的全部
  顶点含环闭合首末点一次同移），关闭时保持 `vertex-move` 单点移动；两路
  均入 undo 栈一次撤销。提示文案随开关切换。
- 测试器 179→**181** / static 143→**145**（+2 双端 topoMode 契约键）；
  3080 重启 health 通过（topo-move 桥实测见 [0.56.0]）。

## [0.57.0] — 2026-08-18

- **编辑页签算子清单同步（第六十一轮，新算子进工作台 UI）**：双端
  client.js 编辑页签 `OPS` 下拉 6→**11 算子**（入列 feature-move / hole-add /
  attributes-replace / line-split / topo-move），`HINTS` 参数示例逐算子补齐
  （含 ringPath 类型分派、挖洞自动闭合、打断吸附、拓扑精确匹配等语义注记）；
  编辑历史提示容量 64→100（跟随第五十六轮内核对齐）。OPS 与 host.js
  EDIT_OPS 单一事实来源约定入注释（新增算子须双端同步入列）。
- 测试器 177→**179**（static 137→**143**：双端算子清单契约键各 +1）；
  3080 生产桥 edit.ops 返回 11 算子实测通过。

## [0.56.0] — 2026-08-18

- **共享顶点拓扑编辑移植（第六十轮，kanyu-edit move_shared_vertex → 组件，
  编辑算子盘点表收官）**：EDIT_OPS 10→11 新增 `topo-move`（对齐
  topoedit.rs:147，ArcGIS Pro Map Topology 语义）——坐标键 f64 精确相等，
  一次移动全部共享该坐标的顶点（含同一要素环闭合首末点等多处出现），
  仅动 x/y、保留 Z/M；单记录入 undo 栈一次撤销（内核 DeltaSet 同语义）；
  自逆算子（坐标对换）。坐标无顶点中文报错「拓扑移动未命中」。
- 测试器 173→**177**（+3 动态：相邻面共享顶点同移无裂缝、undo 一次复原
  两要素、未命中拒绝；edit.ops 10→11）+ static 137→**141**（+1 契约键）；
  3080 生产桥实测 3 处命中（含环闭合末点）+ 撤销闭环通过。
- 至此编辑算子盘点表全部落地：6 原始算子 + feature-move / hole-add /
  attributes-replace / line-split / topo-move 五件移植 + vertex-move 双修复，
  面切割 split_polygon_by_line 经评估留内核侧（geo BooleanOps 无 JS 等价）。

## [0.55.0] — 2026-08-18

- **线打断移植（第五十九轮，kanyu-edit split_line_at_point → 组件）**：
  EDIT_OPS 9→10 新增 `line-split`（对齐 split.rs:109）——仅 LineString；
  打断点投影最近线段（t 截断 [0,1]，1e-9 内吸附既有顶点），首段就地改 +
  次段插入其后（属性深拷贝随行复制）；投影落于线端点中文报错。逆操作
  内部算子 `line-unsplit`（恢复原几何 + 删次段；其自身逆操作不被使用——
  redo 重放的是 line-split 原记录）。
- **面切割评估结论**：`split_polygon_by_line` 依赖 geo Buffer/BooleanOps
  （微量缓冲 + 差集 + 碎条剔除），无忠实 JS 等价物，组件不移植、留内核侧
  （未来可经 WASM 技能或 CLI 出口接入）；评估结论已入 GIS_MODE §4。
- 测试器 169→**173**（+3 动态：投影打断闭环、undo 合并回原样、端点拒绝；
  edit.ops 9→10）+ static 133→**137**（+1 契约键）；3080 生产桥
  打断/撤销闭环实测通过。

## [0.54.0] — 2026-08-18

- **整行属性替换移植（第五十八轮，kanyu-edit UpdateProperties → 组件）**：
  EDIT_OPS 8→9 新增 `attributes-replace`（对齐 ops.rs:281）——`properties`
  整体覆写（`null` = 清空属性表）；自逆算子，逆操作恢复旧属性（含原无
  属性表的 null 态），redo 路径自动重算新鲜逆操作。kanyu_edit 描述与
  args 示例同步补齐。
- 测试器 166→**169**（+2 动态：整行覆写 3→1 字段、undo 自逆恢复旧属性行；
  edit.ops 8→9）+ static 130→**133**（+1 契约键）；3080 生产桥
  替换/撤销闭环实测通过。

## [0.53.0] — 2026-08-18

- **挖洞算子移植（第五十七轮，kanyu-edit AddHole → 组件）**：EDIT_OPS 7→8
  新增 `hole-add` 面内挖洞（对齐 ops.rs:383 AddHole）——`ring` 未闭合自动闭合
  兜底，`holeValidate` 校验语义完整移植：洞环顶点严格位于外环内（射线法 +
  边界检测 `pointRingRel`）、不落在既有洞内、边不与外环/既有洞边界相接
  （`segTouch` 任意相交含端点/共线判负）；`part` Polygon 恒 0、MultiPolygon
  为子面下标，越界中文报错不改动集合。逆操作内部算子 `hole-remove` 弹出
  末环（AddHole::revert 语义）。kanyu_edit 描述与 args 示例同步补齐。
- 测试器 162→**166**（+3 动态：挖洞闭环 1→2 环、越界拒绝、undo 弹出末环；
  edit.ops 计数 7→8）+ static 126→**130**（+1 契约键）；3080 生产桥
  hole-add 挖洞/撤销闭环实测通过。

## [0.52.0] — 2026-08-18

- **编辑算子对照盘点补齐（第五十六轮，组件 EDIT_OPS ↔ kanyu-edit 全量比对）**：
  新增 `feature-move` 整要素平移算子（对齐 kanyu-edit `MoveFeature {index,dx,dy}`，
  ops.rs:166）——`translateCoords` 递归平移任意维度坐标嵌套（Point 至
  MultiPolygon 通吃），仅动 x/y、保留 Z/M，负量逆操作入 undo 栈。EDIT_OPS
  6→7（RPC 计数不变，仍 31）。
- **vertex-move 两个 bug 级修复**：① ringPath 缺省旧版恒 `[0]`，对
  LineString/Point 会错误下钻进首顶点数组——现按几何类型分派（面 `[0]`/
  多面与多线 `[0,0]`/线与点 `[]`），Point 的 coordinates 本身是 position
  特判直写；② 旧版恒写二维 `[x,y]` 丢弃 Z/M——现仅覆写 x/y、
  `concat(oldPos.slice(2))` 保留高程。两修复语义已写进 kanyu_edit 工具描述。
- **undo 容量对齐内核**：EDIT_HISTORY_CAP 64→100（对齐 kanyu-edit History
  默认，history.rs:32），旧注释自称「同语义」实为偏差。
- 测试器 156→**162**（动态 +4：feature-move 平移+undo 闭环、LineString 缺省
  ringPath 修复实测、Point 特判+Z 保留）+ static 120→**126**（+2 契约键）；
  3080 生产桥实测 feature-move 平移/撤销闭环通过（workspace-write 模式下
  仅实例工作区内可写，教训沿用）。

## [0.51.0] — 2026-08-18

- **目录 .kyu 工程图层接力（第五十五轮，目录→地图联动闭环）**：新增
  `style.list` RPC（30→31）——.kyu layers 全列（id / source 相对工程目录
  解析为绝对路径 / visible / styleMode / style 原文；fs.resolve 字符串化
  走 processPath→displayPath→原值三级回退，3080 实测教训入注释）。双端
  目录页签数据库类 .kyu 条目点击 → 图层清单展开（visible 标注 +
  styleMode 徽章 + symPrimaryColor 主色色块，对齐壳层 Contents 语义）；
  图层行点击 → source 设当前图层 + style/kyu/layerId 经 store 接力，
  地图页签 symRef 快照回填符号化表单 + 写入区工程路径/图层 id
  （目录→地图→写入工程闭环）。store 扩展 sym/kyu/layerId 三字段。
- **测试器 +4 断言**（style.list 注册+回退链契约键 + style.list 动态实测
  （承接 style.set 写入态 + source 绝对化）+ 双端接力契约键）；总计
  **156/156 全绿**（static 120/120）。3080 生产桥实测：health rpc:31 +
  demo.kyu 图层清单（source 绝对化命中）。

## [0.50.0] — 2026-08-18

- **3D 场景符号化着色（第五十四轮，符号化模型打通 3D 管线）**：
  `scene3d.data` RPC 新增 `symbology` 入参——symToRule 投影后逐要素派生
  hex 色（categorical 命中色/default 回退 + 自带字段时接管 colorField；
  graduated 按 stops 末档命中，内核 color_for 同语义；缺字段要素不着色
  走基色）；响应新增 `catColors`（类别→模型色映射，图例/棱柱同色）与
  `symbologyMode` 回执。`kanyu_scene3d` 工具 schema 同款入参。双端 3D
  页签新增符号化行（复用 buildSymbology 三模式控件）+ drawScene3d 模型色
  优先（f.color → catColors → 哈希色三级回退）+ HUD 符号化标注。
- **测试器 +7 断言**（host scene3d symbology 契约键 + kanyu_scene3d schema +
  三模式动态实测（single 同色/categorical catColors 命中回退/graduated
  色带取样色域+缺字段不着色）+ 双端 3D 符号化行契约键）；总计
  **152/152 全绿**（static 117/117）。3080 生产桥实测：categorical
  symbology 3D 着色（catColors 映射 + 逐要素色）通过。

## [0.49.0] — 2026-08-18

- **模型侧符号化同能力（第五十三轮，kanyu_render 补 symbology 入参）**：
  `kanyu_render` 动态工具 schema 新增 `symbology` 参数（LayerSymbology
  编辑模型文档化：single/categorical/graduated 三模式 + ramp 色带名）；
  地图分支与 layout 分支同款 symToRule 投影（renderLayout 第八参，
  显式 style 优先）。模型侧与面板侧至此同一编辑模型语义——AI 可直接
  产出 .kyu 持久化格式样式。RPC 仍 30 项（纯工具面扩展）。
- **测试器 +4 断言**（schema symbology 契约键 + renderLayout 投影契约键 +
  symbology single 出图落盘动态实测 + layout+graduated 投影排版动态实测）；
  总计 **145/145 全绿**（static 110/110）。3080 生产桥复测：health rpc:30 +
  categorical symbology 投影出图（4 要素）。

## [0.48.0] — 2026-08-18

- **图层符号化编辑移植（第五十二轮，壳层 symbology.rs 图层属性页对齐）**：
  Host 半新增 LayerSymbology→StyleRule 投影（`symToRule` + `RAMPS` 青玉/
  琥珀/蓝灰三色带值逐一对齐壳层 + `rampSample` 均匀取样 + F64_MIN 首档
  全域着色）；`render.map` 新增 `symbology` 入参（编辑模型 JSON，显式
  style 优先），回执带 `styleApplied` 投影结果。新增 `style.get` /
  `style.set` RPC（28→30）：.kyu 清单 `layers[].style` 读写（LayerSymbology
  JSON 原样透传对齐 project.rs 语义，图层按 id 匹配，写回两空格缩进对齐
  core to_string_pretty，写拒绝带 workspace-write 可操作指引）。双端地图
  页签符号化区由裸 StyleRule 文本升级为编辑模型：单色（颜色选择器）/
  唯一值（字段+类别色文本+<其他>色）/分级（字段+断点文本+色带下拉）三模式
  + 工程样式读写行（.kyu 路径 + 图层 id + 读取样式回填/写入工程按钮）。
- **测试器 +7 断言**（host symToRule/RAMPS 契约键 + style RPC 注册 +
  render.map symbology 投影动态实测（F64_MIN 首档+色带取样 3 色）+
  style.set/get 闭环 + 非法 mode 拒绝 + 双端工程样式区契约键）；总计
  **141/141 全绿**（static 108/108）。3080 生产桥三测：health rpc:30 +
  symbology 投影出图（Slate 色带 4 要素）+ style.set 工作区外写拒绝
  writeHint 指引。领域技能 SKILL.md 同步 v1.2（30 RPC/141 断言实况对齐）。

## [0.47.0] — 2026-08-18

- **GIS 模式领域技能 SKILL.md 与组件能力面一致性精修（第五十一轮，AI 能力
  整合优化方向）**：`dsh/presets/kanyu-gis/skills/kanyu-gis/SKILL.md` 三处
  实况对齐——① 面板侧 RPC 清单 26→28：补 `render.layout`（kyu+title 工程
  模式布局排版 SVG）与 `catalog.readImage`（产物 PNG 读盘 base64 + 越界
  防护）；② 组件验证面计数 123→134 / static 96→104，验证面列举补
  「布局排版出口/布局预览/地图框产物预览/verify_preset 插件包存在性+技能
  frontmatter」四项；③ frontmatter metadata version "1.0"→"1.1"。
  verify_preset ALL FILES LOADABLE + static 回归 104/104 全绿；
  sync-preset.sh 回灌安装区完成（技能按会话加载，web 实例无需重启）。
  纯文档一致性改动，无代码行为变更。

## [0.46.0] — 2026-08-18

- **目录地图框条目点击预览（第五十轮，目录五分类可点闭环）**：host 半新增
  `catalog.readImage` RPC（RPC 表 27→28）——readImagePng 助手读渲染产物
  PNG → base64 回传；**越界防护**：仅限 dsh/output 产物目录内的 .png
  （目录清单外任意路径一律拒绝）。双端 Client 目录页签地图框条目
  onClick → PNG 内嵌预览（kyg-img + 关闭产物预览按钮，四十八轮布局
  预览同范式）。两半 RPC 面对称锁随动 21=21。
- **测试器 +5 断言**（host 契约键 + 产物读盘动态实测 + 越界拒绝（两种
  模式）+ 双端 previewMapImage 契约键）；总计 **134/134 全绿**
  （static 104/104）。3080 生产桥双测：render.map 产物读回 ok（base64
  PNG）+ geojson 数据文件按边界拒绝。

## [0.45.0] — 2026-08-18

- **verify_preset.mjs 校验覆盖扩展（第四十九轮）**：两面新校验——
  ① 行内插件包存在性：组合行 name 解析为包名（作用域包前两段、子路径
  如 `.../list-agents` 剥离、`cordis:*` 内核行豁免），对照宿主检出
  node_modules（roster「包不存在」类 broken 旁路拦截，对齐初版误写
  dsh-tool-read 事故）；② preset 自带技能 frontmatter：`skills/<id>/
  SKILL.md` 须 `---` 包裹 YAML 映射且 name === 目录名、description 非空
  （对齐 frontmatter 非法转义事故）；显式文件模式同样附带技能校验
  （preset 目录 = 组合文件所在目录，sync-preset.sh 通道覆盖）。宿主
  node_modules 路径提为 HOST_NM 单一事实来源；动态 import 改
  命名空间/default 双层查找（js-yaml 等 ESM 构建以 default 导出为主）。
  正/负向实测通过（bogus 包名拦截 + 现存 17 行全过），sync-preset.sh
  联动验证 ALL FILES LOADABLE。
- 测试器无新断言（verify_preset 依赖本机宿主检出绝对路径，不可进 CI
  ——既有边界维持）；static 回归 100/100。

## [0.44.0] — 2026-08-18

- **布局预览 UI（目录布局框点击 → 排版预览，第四十八轮）**：host 半新增
  `render.layout` RPC（RPC 表 26→27）——`layoutPreview` 助手两种入参：
  path 直传数据文件，或 `kyu + title` 读 .kyu 工程清单（壳层 project.rs
  ProjectLayout 规格：page/dpi/legend/scalebar/north 取自工程，数据取首个
  可见图层、source 相对工程文件所在目录解析），经第四十六轮 renderLayout
  出 SVG 落 dsh/output 并回传文本。catalog.list 布局框条目新增 `kyu`
  工程路径字段。双端 Client 目录页签布局框条目点击 → 排版 → SVG 内嵌
  预览（kyg-layout-preview 滚动容器 + 关闭按钮）。两半 RPC 面对称锁随动
  20=20。**教训入档**：fs.resolve 返回 `{displayPath}` 对象非字符串，
  取路径须 `fs.processPath()`（首轮测试器实证 `kyuAbs.replace` 报错）。
- **测试器 +4 断言**（render.layout host 契约键 + catalog kyu 字段 +
  双端 previewLayout 契约键 + render.layout(kyu) 动态实测——demo.kyu
  夹具补可见图层 source=buildings.geojson）；总计 **129/129 全绿**
  （static 100/100）。3080 生产桥实测 render.layout(kyu) 通过
  （1754×1240 = A4@150dpi 工程规格生效，中文绝对路径无碍）。

## [0.43.0] — 2026-08-18

- **布局排版出口（壳层 layoutview 移植，第四十六轮）**：主仓新增
  `kanyu render layout <file> --out <path>`（`RenderCommand::Layout` →
  kanyu-render `layout` 排版器：A4 横/竖页面 + 标题/图例/比例尺/指北针
  内嵌地图渲染，`--page/--dpi/--no-legend/--no-scalebar/--no-north/--theme/
  --style[-file]` 全参数面；比例尺按 extent 跨度 ×111320 赤道近似 +
  `nice_scale` 取整；graduated 图例行「≤ 阈值」、categorical 类别排序）。
  此前排版器只有壳层 layoutview 一个消费者，CLI/组件无出口。组件侧
  `kanyu_render` 动态工具新增 `layout` 分支（renderLayout 助手 +
  ensureOutDir 落盘防护 + `--style-file` 样式直通 + 「排版完成: out
  （可 read_image 查看）」回执；`title/page/dpi/out` 可选参数）。
  RPC 表不变（26 项；布局预览 UI 页签为下轮候选）。
- **测试器 +2 断言**（renderLayout 静态契约键 + 动态工具 layout 出 SVG
  含标题实测）；总计 **125/125 全绿**（static 97/97）。

## [0.42.0] — 2026-08-18

- **中文路径根因复核（推翻第四十四轮「shell 桥 GBK 乱码」初判）**：逐项隔离
  实证——pwsh 直连中文路径正常、桥 ASCII 越 workspace 正常、catalog.list
  中文目录在无 charset 头时乱码而 `--data-binary @UTF-8 文件` 全链路正确
  → **乱码源是 curl.exe 命令行参数 GBK 化（测试方法学伪影），组件桥
  Buffer 拼接 + JSON.parse 本就按 UTF-8 正确解码**，生产浏览器 Client
  （fetch/JSON.stringify 恒 UTF-8）中文路径全链路无恙。组件代码零改动。
- **测试器 +1 断言**（桥 UTF-8 正文回归锁：中文目录自建自扫不经 CLI，
  两种模式皆覆盖）；总计 **123/123 全绿**（static 96/96）。

## [0.41.0] — 2026-08-18

- **字段计算器 UI 面板（双端编辑页签 ƒx 区）**：host 半新增 `data.calc` RPC
  （dataCalc 助手提为 RPC，上轮模型侧 kanyu_data action=calc 同源）——RPC
  表 25→26；双端 Client 编辑页签新增「字段计算器」区：目标字段 + 表达式
  输入、「预览前 5 行」（无 output 全量求值后取前 5 行目标值，对齐壳层
  attrtable.rs preview_calc 语义）与「应用」（inPlace 原地覆盖，否则写
  .edited.geojson；成功回执带要素数 → 路径广播 + 属性表作废 + 顶点画布
  重载 + store.rev++ 全联动）。两半 RPC 面对称锁随动 19=19。
- **测试器 +3 断言**（data.calc RPC 直通 + 双端 ƒx 契约键）；总计
  **122/122 全绿**（static 95/95）。3080 生产桥实测 data.calc 通过
  （ASCII 路径；中文绝对路径经 shell 桥 GBK 乱码为既有跨 RPC 限制，
  入下轮候选）。

## [0.40.0] — 2026-08-18

- **字段计算器出口（attrcalc 内核 → CLI → 组件模型侧）**：主仓新增
  `kanyu data calc <file> --target <field> --expr <expr> [--output]`
  （`DataCommand::Calc` → `attrcalc::calc_field`，逐要素求值写入目标字段，
  不存在则新建；支持 +-*/%、比较、and/or/not、round/upper/concat/coalesce
  等函数与 $area/$length/$x/$y 几何虚列，对齐壳层属性表字段计算器）。
  组件侧 `kanyu_data` 动态工具新增 `action=calc`（dataCalc 助手 +
  ensureOutDir 落盘防护 + 「字段计算完成（target）：N 要素 → 已写出」
  确认回执，与 query 落盘分支同契约）。此前 attrcalc 只有壳层 attrtable
  与 kanyu-py 两个消费者，CLI/组件无出口。
- **测试器 +4 断言**（静态契约键 + calc 落盘值 177=88.5×2 / stdout JSON
  直通 / 错误表达式失败回执）；总计 **119/119 全绿**（static 93/93）。

## [0.39.0] — 2026-08-18

- **双半盘点 + RPC 面对称锁**：实测动态半（plugin）与静态半（pkg）RPC
  方法集 18 = 18 零独有、页签 8/8 相同；差异仅四处设计意图（cordis 卡片
  动态专利 / preset 门控静态半 agentPreset 快照 / 样式注入路径 / slot
  数），已在 dsh/README 落「双半差异白名单」表。测试器新增对称断言
  （动态 host.call 与静态 hostCall 方法集互无独有）——比既有单向
  「pkg ⊆ 25 RPC」更强的漂移锁。组件代码零改动。
- 总计 **115/115 全绿**（static 92/92）。

## [0.38.0] — 2026-08-18

- **3D 页签联动重载（双端 Client）**：Tab3d `load` 改可传路径参数 + 联动
  重载 effect——已加载场景时 `store.path` 切换或 `store.rev` 递增自动
  重载场景（未加载不自动制备防打扰），与第四十轮 TabMap 联动重渲染同
  范式；按钮修正无参调用防事件对象误入。store.rev 版本号机制的第二个
  受益面。RPC 表不变仍 25。
- **测试器 +2 断言**（双端「联动重载/auto3dRef」契约键）；总计
  **114/114 全绿**（static 91/91）。

## [0.37.0] — 2026-08-18

- **地图页签联动重渲染（双端 Client）**：`store` 加 `rev` 内容版本号——
  编辑页签 apply2/undoRedo/applyAttr/vUp 成功一律 `store.rev++` 并广播
  （撤销/原地编辑改内容不改路径，此前地图页签无感知；vUp 此前仅路径变化
  才广播）；TabMap 加联动重渲染 effect：已渲染过时 `store.path` 切换或
  `rev` 递增自动 `render2d(store.path)`，未渲染过不自动出图防打扰。
  `render2d` 改可传路径参数（按钮修正为无参调用，防事件对象误入）。
  RPC 表不变仍 25。
- **测试器 +2 断言**（双端「store.rev/联动重渲染/autoRef」契约键 +
  store.rev++ 四处递增计数锁）；总计 **112/112 全绿**（static 89/89）。

## [0.36.0] — 2026-08-18

- **目录页签 freshness 自动重扫（双端 Client）**：`useEffect` 监听
  `store.path`——已加载过清单且当前图层变为清单外路径（查询/编辑/服务
  拉取产出）时自动 `scan()` 重扫一次，`knownRef` 防重复；此前五分类计数
  与清单滞留到手工点「扫描」。产出类操作四面落盘广播后，目录页签是最后
  一个不跟随的面，现已闭环。plugin 动态半与 pkg 静态半同步改造。RPC 表
  不变仍 25。
- **测试器 +2 断言**（双端「freshness 自动重扫/knownRef」契约键）；总计
  **110/110 全绿**（static 87/87）。

## [0.35.0] — 2026-08-18

- **数据页签查询结果联动属性表（双端 Client）**：`runQuery` 查询成功并设为
  当前图层后，对产出图层自动 `data.preview` 载入结果属性表——命中行即
  结果集，用户免再点「属性表」即可看到查询结果；预览不可达时降级仅保留
  计数回执。此前 `setTable(null)` 后结果集不可见。plugin 动态半与 pkg
  静态半同步改造。RPC 表不变仍 25。
- **测试器 +2 断言**（双端「查询结果联动属性表/pv2」契约键）；总计
  **108/108 全绿**（static 85/85）。

## [0.34.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_scene3d` 回执补高度范围 + 交互视图接力**：
  `scene3dData` 挤出循环顺手累积 minH/maxH 返回 `heightRange`（纯增量
  字段，RPC 契约不破坏；缺高度字段要素归一 10 后参与累积）；动态工具
  回执附「高度范围 min~max」——模型侧可判断挤出量级，并附「交互式 3D
  视图：工作台 3D 页签（该数据为当前图层时联动加载）」入口指引。至此
  8 个 kanyu_* 动态工具回执面全部过一轮（query/crs/geoprocess/edit/
  catalog 三分支/scene3d）。RPC 表不变仍 25。
- **测试器 +3 断言**（hostSrc 静态契约 + RPC heightRange [10,120] 字段 +
  动态回执「高度范围 10~120 + 工作台 3D 页签」）；总计 **106/106 全绿**
  （static 83/83）。

## [0.33.0] — 2026-08-18

- **GIS 模式 AI 面整合：`kanyu_catalog` WMS 底图分支参数面**：`servicesWms`
  调用从硬编 `null/640/320` 改为 `bbox/width/height` 参数直通——模型可据
  `kanyu_data info` 的 extent 给真实范围（此前恒全球范围出图）；补
  `urlOnly` 参数走离线契约路径（只构造 GetMap 地址不触网，可交用户/调试）；
  成功回执宽高从硬编「640×320」改写实，并注明内联预览在工作台目录页签
  服务链接区。至此服务链接三分支（discover/fetch/wms）模型侧参数与回执
  面全部补齐。RPC 表不变仍 25。
- **测试器 +2 断言**（hostSrc 静态契约 + urlOnly 动态断言：bbox 六位
  小数序列化 + 宽高直通，不触网）；总计 **103/103 全绿**（static 80/80）。

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
