# dsh/ 组件变更记录

## [0.1.0] — 2026-08-18

- 组件源首次完整入库：`plugin/host.js` + `plugin/client.js`（七大能力域 RPC + 8 个
  `kanyu_*` 动态工具）、`presets/kanyu-gis/`（GIS 模式 preset + 领域技能）、
  `examples/`、`tools/verify_preset.mjs`、`sync-preset.sh`。
- `host.js` 的 kanyu CLI 命令面与 v0.22.0 实测逐旗标对拍一致
  （`data info/query/validate/reproject`、`render map`、`analysis` 13 工具参数名）。
- GitHub 开源同步：主仓库 `DaoMingyuan/Kanyu` 入库推送 + 独立组件仓
  `DaoMingyuan/kanyu-gis` 建仓首发（详见 AI_SYNC.md 会签簿 2026-08-18 回记）。
