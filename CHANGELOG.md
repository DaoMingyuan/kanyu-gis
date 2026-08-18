# dsh/ 组件变更记录

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
