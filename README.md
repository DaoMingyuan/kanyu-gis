# dsh/ —— 堪舆 GIS × DeepSeek Harness 组件

> 本目录是堪舆（Kanyu）GIS 能力在 DeepSeek Harness（DSH / Cordis）侧的组件源，
> 即「GIS 模式」的仓库内单一事实来源。组件运行手册见 [`docs/GIS_MODE.md`](../docs/GIS_MODE.md)。

## 组成

| 路径 | 职责 |
|------|------|
| `plugin/host.js` | 组件 Host 半（宿主进程侧）：以 `kanyu` CLI 为执行后端，暴露 Package 私有 JSON RPC（`harness.handle`），并向 DSH 模型注册 8 个 `kanyu_*` 动态工具（`harness.registerTool`）——堪舆原壳层 LocalDriver/OpenAiDriver 意图面在 Harness function-calling 代理循环中的整合形态 |
| `plugin/client.js` | 组件 Client 半（浏览器侧，动态包形态）：DSH Web GUI「堪舆 GIS 工作台」，会话头部按钮 + 全局浮层七页签（目录/数据/地图/坐标/处理/编辑/3D/关于）+ cordis 卡片，全部经 `host.call` 走 Host 半 |
| `pkg/` | **常驻静态插件**（双面包）：`index.js` Host 适配器（包装 host.js 单一事实源 + `webServer` 前缀路由 `/kanyu-gis/call` RPC 桥）+ `client.js` 静态客户端 bundle（dsh.client 约定，手写工厂格式；工作台面板**随 kanyu-gis preset 联动显示**——读会话快照 `agentPreset` 字段门控）+ `package.json`（`exports` 含 `./client` 与 `./package.json`、`dsh.client` 声明） |
| `presets/kanyu-gis/` | GIS 模式 agent preset：`preset.yml`（发现元数据）+ `agent.cordis.yml`（代理平面组合：persona/工具面/plan-mode/compaction/delegation 组 + skill-filesystem 技能注入，形态与 local-hybrid 同方言）+ `skills/kanyu-gis/SKILL.md`（七域能力地图技能） |
| `examples/` | 组件演示数据（GeoJSON 小样例） |
| `tools/verify_preset.mjs` | preset 可加载性旁路校验（与 DSH 发现库同判定链）；用法：`node dsh/tools/verify_preset.mjs --preset-dir dsh/presets` |
| `sync-preset.sh` | 把仓库内 preset 源同步到本机 DSH 安装区（`~/.dsh/.agent-presets/kanyu-gis/`）并触发校验 |

## 七大能力域 → kanyu 内核落点

| 能力 | 组件工具 | kanyu 侧对应物 |
|------|----------|----------------|
| 地图面板 | `kanyu_render` | `kanyu render map`（晨山/夜观星，PNG/SVG） |
| GIS 数据目录读取 | `kanyu_catalog` / `kanyu_data` | `kanyu data info/query/validate` + 格式注册表 |
| 坐标框架 | `kanyu_crs` | `kanyu data reproject`（EPSG 全库） |
| 工程目录 | Client 目录页签 | `catalog.list` RPC（扩展名矩阵对齐 `format.rs`） |
| 地理处理 | `kanyu_geoprocess` | `kanyu analysis <13 工具>`（QGIS 语义） |
| 地理编辑 | `kanyu_edit` | 组件内 GeoJSON 编辑内核（6 算子 + 命令逆操作双栈 undo/redo，对齐 `kanyu-edit` 范式）；深度拓扑编辑由 `kanyu-edit` crate 承接 |
| 3D 地理 | `kanyu_scene3d` | 挤出体场景数据制备 + Client canvas 等距投影绘制 |

另注册 `kanyu_introspect`（系统自省，对齐 `kanyu introspect --json`）。

## 安装与同步

**两条安装路线**（互补，可并存）：

| 路线 | 机制 | 生命周期 |
|------|------|----------|
| 动态包（Web 工作台 + 8 工具） | 会话内 `cordis_define`（host.js + client.js）→ `cordis_run` | 进程内存态，重启不恢复（宿主设计如此） |
| **常驻静态插件（8 工具 + GIS 工作台面板）** | `dsh/pkg/` 双面包适配器包装 host.js 单一事实源，经 `dsh plugin --profile web add file:<仓库>/dsh/pkg` + profile `cordis.patch.yml` insert 行安装 | 常驻，随 DSH 启动自动激活（2026-08-18 实测：启动日志「8 个 kanyu_* 工具注册进工具注册表」+ boot 图含 `kanyu-gis-dsh-plugin` 客户端条目，切到 kanyu-gis preset 会话即见「🧭 堪舆GIS」头部按钮） |

```bash
# 仓库 → 本机 DSH 安装区（preset 同步 + 校验）
bash dsh/sync-preset.sh

# 常驻静态插件安装（一次性；更新 host.js 后需重装以刷新 profile 副本）：
dsh plugin --profile web remove kanyu-gis-dsh-plugin
dsh plugin --profile web add "file:<仓库绝对路径>/dsh/pkg"
# cordis.patch.yml 需含 insert 行（含 config.hostSource 指向 host.js 绝对路径），
# 见 dsh/pkg/index.js 头部注释与 docs/GIS_MODE.md §3
```

组件工具全部经 PATH 上的 `kanyu` CLI 执行，不依赖宿主 `node_modules`；
找不到 `kanyu.exe` 时以 `kanyu-mcp`（MCP stdio 入口）兜底。

## 本地测试

```bash
# 组件测试器：node:vm 等价沙箱加载 plugin/host.js，真实 kanyu CLI 后端，
# 逐项实证七大能力 + 8 动态工具 + Client 半结构 + pkg 双面包契约（35 项断言）
node dsh/tools/test_plugin.mjs        # 退出码 0 = 全绿

# preset 可加载性旁路校验（与 DSH 发现库同判定链）
node dsh/tools/verify_preset.mjs --preset-dir dsh/presets

# DSH 无头会话冒烟（真实模型链路 × kanyu CLI；需本机 DSH 检出）
dsh --profile headless "执行 kanyu agents validate --code-repo 并引用其输出"
```

边界（2026-08-18 实测记录）：headless profile 不含 agent-presets roster 与 cordis
动态包 runner（`--dump-config` 实证），故 preset 挂载与组件动态包（cordis_define/
cordis_run）只能在 web profile（GUI 会话）进行；headless 可用于「DSH 会话 ×
kanyu CLI」链路冒烟。Windows 上经 cmd.exe 传含中文的绝对路径会被代码页截断——
组件宿主 shell 为 pwsh（无此问题），本地测试器统一走 Git Bash。

## 自我迭代边界

组件的迭代发生在 **Git 协作层**（提交/PR + CI），运行时绝不自改内核——
对齐 [AI_SYNC.md](../AI_SYNC.md) §1.3。改本目录任何文件后：
开工登记 → 验证（`verify_preset.mjs` + `kanyu agents validate --code-repo`）→ 收工回记。
