# dsh/ 组件变更记录

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
