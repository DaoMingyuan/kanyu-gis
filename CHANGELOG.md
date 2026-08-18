# dsh/ 组件变更记录

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
